"""
Validate OpenCL (Metal via cl2Metal) vs CPU Reference platform accuracy.

Tests:
1. TIP3P water box (~1000 atoms) - basic energy comparison
2. OPC 4-site water box - virtual site handling
3. CustomExternalForce with periodicdistance - PBC restraints
"""

import openmm as mm
import openmm.app as app
import openmm.unit as unit
import numpy as np
import sys


def compare_platforms(system, positions, topology, test_name,
                      platform_a="Reference", platform_b="OpenCL"):
    """Compute single-point energy on two platforms and compare."""

    # Platform A
    integrator_a = mm.VerletIntegrator(0.001 * unit.picoseconds)
    pa = mm.Platform.getPlatformByName(platform_a)
    context_a = mm.Context(system, integrator_a, pa)
    context_a.setPositions(positions)
    state_a = context_a.getState(getEnergy=True, getForces=True)
    energy_a = state_a.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
    forces_a = np.array(state_a.getForces(asNumpy=True).value_in_unit(
        unit.kilojoules_per_mole / unit.nanometer))

    # Platform B
    integrator_b = mm.VerletIntegrator(0.001 * unit.picoseconds)
    pb = mm.Platform.getPlatformByName(platform_b)
    context_b = mm.Context(system, integrator_b, pb)
    context_b.setPositions(positions)
    state_b = context_b.getState(getEnergy=True, getForces=True)
    energy_b = state_b.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
    forces_b = np.array(state_b.getForces(asNumpy=True).value_in_unit(
        unit.kilojoules_per_mole / unit.nanometer))

    n_atoms = system.getNumParticles()
    energy_diff = abs(energy_a - energy_b)
    per_atom_diff = energy_diff / n_atoms

    force_diff = np.sqrt(np.mean((forces_a - forces_b)**2))

    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print(f"{'='*60}")
    print(f"  Atoms: {n_atoms}")
    print(f"  {platform_a} energy: {energy_a:.6f} kJ/mol")
    print(f"  {platform_b} energy: {energy_b:.6f} kJ/mol")
    print(f"  Energy diff: {energy_diff:.6f} kJ/mol")
    print(f"  Per-atom diff: {per_atom_diff:.6f} kJ/mol/atom")
    print(f"  Force RMSD: {force_diff:.6f} kJ/mol/nm")

    threshold = 0.01  # kJ/mol per atom
    passed = per_atom_diff < threshold
    status = "PASS" if passed else "FAIL"
    print(f"  Threshold: {threshold} kJ/mol/atom")
    print(f"  Result: {status}")

    del context_a, context_b
    return passed


def test_tip3p_water_box():
    """Test 1: TIP3P water box (~1000 atoms)."""
    ff = app.ForceField('amber14/tip3p.xml')
    modeller = app.Modeller(app.Topology(), [])
    modeller.addSolvent(ff, model='tip3p',
                        boxSize=mm.Vec3(2.5, 2.5, 2.5) * unit.nanometers)

    system = ff.createSystem(modeller.topology,
                             nonbondedMethod=app.PME,
                             nonbondedCutoff=1.0 * unit.nanometers,
                             ewaldErrorTolerance=0.0005,
                             constraints=app.HBonds)

    return compare_platforms(system, modeller.positions, modeller.topology,
                             "TIP3P Water Box (PME)")


def test_opc_water_box():
    """Test 2: OPC 4-site water box - validates virtual site handling."""
    ff = app.ForceField('amber/opc_standard.xml')
    modeller = app.Modeller(app.Topology(), [])
    modeller.addSolvent(ff, model='tip4pew',
                        boxSize=mm.Vec3(2.5, 2.5, 2.5) * unit.nanometers)

    system = ff.createSystem(modeller.topology,
                             nonbondedMethod=app.PME,
                             nonbondedCutoff=1.0 * unit.nanometers,
                             ewaldErrorTolerance=0.0005,
                             constraints=app.HBonds)

    return compare_platforms(system, modeller.positions, modeller.topology,
                             "OPC 4-Site Water Box (PME, virtual sites)")


def test_periodic_distance_restraint():
    """Test 3: CustomExternalForce with periodicdistance."""
    ff = app.ForceField('amber14/tip3p.xml')
    modeller = app.Modeller(app.Topology(), [])
    modeller.addSolvent(ff, model='tip3p',
                        boxSize=mm.Vec3(2.5, 2.5, 2.5) * unit.nanometers)

    system = ff.createSystem(modeller.topology,
                             nonbondedMethod=app.PME,
                             nonbondedCutoff=1.0 * unit.nanometers,
                             constraints=app.HBonds)

    # Add CustomExternalForce with periodicdistance (PBC-aware restraint)
    restraint = mm.CustomExternalForce(
        'k*periodicdistance(x, y, z, x0, y0, z0)^2')
    restraint.addGlobalParameter('k', 1000.0)
    restraint.addPerParticleParameter('x0')
    restraint.addPerParticleParameter('y0')
    restraint.addPerParticleParameter('z0')

    # Restrain first 10 oxygen atoms
    positions = modeller.positions
    count = 0
    for i in range(system.getNumParticles()):
        if count >= 10:
            break
        pos = positions[i]
        restraint.addParticle(i, [
            pos[0].value_in_unit(unit.nanometers),
            pos[1].value_in_unit(unit.nanometers),
            pos[2].value_in_unit(unit.nanometers)
        ])
        count += 1

    system.addForce(restraint)

    return compare_platforms(system, positions, modeller.topology,
                             "CustomExternalForce with periodicdistance")


if __name__ == '__main__':
    results = []

    print("OpenMM Metal (cl2Metal) Validation Suite")
    print(f"OpenMM version: {mm.Platform.getOpenMMVersion()}")
    print(f"Platforms: {[mm.Platform.getPlatform(i).getName() for i in range(mm.Platform.getNumPlatforms())]}")

    results.append(("TIP3P Water Box", test_tip3p_water_box()))
    results.append(("OPC 4-Site Water", test_opc_water_box()))
    results.append(("periodicdistance Restraint", test_periodic_distance_restraint()))

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\nAll tests PASSED!")
    else:
        print("\nSome tests FAILED!")
        sys.exit(1)
