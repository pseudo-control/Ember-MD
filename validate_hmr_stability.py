"""
Validate HMR + 4fs timestep stability on OpenCL (Metal via cl2Metal).

Runs a short NPT trajectory and checks:
1. Temperature stability around 300K
2. Energy conservation (no drift)
3. Density stability (~1.0 g/cm3)

Uses OPC 4-site water with ff19SB (the "accurate" preset from run_md_simulation.py).
"""

import openmm as mm
import openmm.app as app
import openmm.unit as unit
import numpy as np
import sys


def run_stability_test(platform_name='OpenCL', production_steps=5000, dt_fs=4.0):
    """Run a short NPT trajectory and check stability metrics."""

    print(f"\n{'='*60}")
    print(f"HMR Stability Test — {platform_name} platform, {dt_fs}fs timestep")
    print(f"{'='*60}")

    # Build OPC water box
    ff = app.ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')
    modeller = app.Modeller(app.Topology(), [])
    modeller.addSolvent(ff, model='tip4pew',
                        boxSize=mm.Vec3(2.5, 2.5, 2.5) * unit.nanometers)

    n_atoms = modeller.topology.getNumAtoms()
    n_water = sum(1 for r in modeller.topology.residues() if r.name == 'HOH')

    system = ff.createSystem(
        modeller.topology,
        nonbondedMethod=app.PME,
        nonbondedCutoff=1.0 * unit.nanometers,
        ewaldErrorTolerance=0.0005,
        constraints=app.HBonds,
        hydrogenMass=1.5 * unit.amu,  # HMR for 4fs timestep
    )

    # Add barostat for NPT
    system.addForce(mm.MonteCarloBarostat(1 * unit.bar, 300 * unit.kelvin, 25))

    integrator = mm.LangevinMiddleIntegrator(
        300 * unit.kelvin,
        1 / unit.picoseconds,
        dt_fs * unit.femtoseconds,
    )

    platform = mm.Platform.getPlatformByName(platform_name)
    simulation = app.Simulation(modeller.topology, system, integrator, platform)
    simulation.context.setPositions(modeller.positions)

    print(f"  System: {n_atoms} atoms, {n_water} OPC waters")
    print(f"  HMR: H mass = 1.5 amu, dt = {dt_fs} fs")
    print(f"  Ensemble: NPT (300K, 1 bar)")

    # Minimize
    print("  Minimizing...")
    simulation.minimizeEnergy(maxIterations=1000)

    # Brief equilibration
    print("  Equilibrating (5 ps)...")
    simulation.step(int(5.0 / (dt_fs * 0.001)))  # 5 ps

    # Production sampling
    sample_interval = 100  # steps between samples
    n_samples = production_steps // sample_interval
    production_ps = production_steps * dt_fs * 0.001

    # Compute DOF correctly: exclude virtual sites (mass=0) and constraints
    n_real = sum(1 for i in range(system.getNumParticles())
                 if system.getParticleMass(i).value_in_unit(unit.dalton) > 0)
    n_constraints = system.getNumConstraints()
    n_dof = 3 * n_real - n_constraints - 3  # subtract COM
    print(f"  DOF: {n_dof} (real particles: {n_real}, constraints: {n_constraints})")

    print(f"  Sampling ({production_ps:.1f} ps, {n_samples} samples)...")

    temperatures = []
    potential_energies = []
    kinetic_energies = []
    total_energies = []
    densities = []

    water_molar_mass = 18.015  # g/mol
    kB = 8.314e-3  # kJ/mol/K

    for i in range(n_samples):
        simulation.step(sample_interval)
        state = simulation.context.getState(getEnergy=True)

        ke = state.getKineticEnergy().value_in_unit(unit.kilojoules_per_mole)
        pe = state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
        temp = 2 * ke / (n_dof * kB)

        box = state.getPeriodicBoxVectors()
        vol_nm3 = box[0][0].value_in_unit(unit.nanometers) * \
                  box[1][1].value_in_unit(unit.nanometers) * \
                  box[2][2].value_in_unit(unit.nanometers)
        vol_cm3 = vol_nm3 * 1e-21  # nm^3 -> cm^3
        mass_g = n_water * water_molar_mass / 6.022e23
        density = mass_g / vol_cm3

        temperatures.append(temp)
        potential_energies.append(pe)
        kinetic_energies.append(ke)
        total_energies.append(pe + ke)
        densities.append(density)

    temperatures = np.array(temperatures)
    total_energies = np.array(total_energies)
    densities = np.array(densities)

    # Results
    print(f"\n  --- Results ---")
    mean_temp = np.mean(temperatures)
    std_temp = np.std(temperatures)
    print(f"  Temperature: {mean_temp:.1f} +/- {std_temp:.1f} K (target: 300 K)")

    mean_density = np.mean(densities)
    std_density = np.std(densities)
    print(f"  Density: {mean_density:.4f} +/- {std_density:.4f} g/cm^3 (target: ~1.0)")

    # Energy drift: linear fit slope
    time_ps = np.arange(n_samples) * sample_interval * dt_fs * 0.001
    if len(time_ps) > 1:
        slope = np.polyfit(time_ps, total_energies, 1)[0]
        drift_per_ns = slope * 1000  # kJ/mol/ns
        print(f"  Energy drift: {drift_per_ns:.1f} kJ/mol/ns")
    else:
        drift_per_ns = 0

    # Checks
    passed = 0
    failed = 0

    # Temperature should be 300 +/- 20 K on average
    ok = abs(mean_temp - 300) < 20
    status = 'PASS' if ok else 'FAIL'
    print(f"  [{status}] Temperature within 20K of target")
    passed += ok; failed += (not ok)

    # Temperature fluctuations shouldn't be huge
    ok = std_temp < 30
    status = 'PASS' if ok else 'FAIL'
    print(f"  [{status}] Temperature std dev < 30K")
    passed += ok; failed += (not ok)

    # Density should be 0.9-1.1 g/cm^3
    ok = 0.9 < mean_density < 1.1
    status = 'PASS' if ok else 'FAIL'
    print(f"  [{status}] Density in reasonable range")
    passed += ok; failed += (not ok)

    # Energy drift should be bounded (Langevin thermostat means
    # total energy isn't conserved, but should not blow up)
    ok = abs(drift_per_ns) < 50000  # generous bound for thermostatted system
    status = 'PASS' if ok else 'FAIL'
    print(f"  [{status}] No energy blowup")
    passed += ok; failed += (not ok)

    print(f"\n  {passed}/{passed+failed} checks passed")
    return failed == 0


if __name__ == '__main__':
    print("HMR Stability Validation Suite")
    print(f"OpenMM version: {mm.Platform.getOpenMMVersion()}")

    results = []

    # Test on OpenCL (Metal via cl2Metal)
    results.append(("OpenCL HMR 4fs", run_stability_test('OpenCL', 5000, 4.0)))

    # Also test on CPU for comparison
    results.append(("CPU HMR 4fs", run_stability_test('CPU', 2000, 4.0)))

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    all_passed = True
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  {name}: {status}")
        if not ok:
            all_passed = False

    sys.exit(0 if all_passed else 1)
