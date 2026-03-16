#!/usr/bin/env python3
"""
Validation tests for OPC water model integration.

Tests parameter parity with the published OPC model (Izadi et al. 2014,
J. Phys. Chem. Lett. 5:3863-71), correct system construction with
ff19SB + OPC, and post-minimization water geometry.

Run with: /path/to/conda/python test_opc_water_model.py
"""

import math
import sys
import os
import tempfile

# Published OPC parameters from Izadi et al. 2014
# Table 1 and Supporting Information
PUBLISHED_OPC = {
    'r_OH_A':      0.8724,      # O-H bond length in Angstroms
    'theta_HOH':   103.6,       # H-O-H angle in degrees
    'sigma_A':     3.16655,     # LJ sigma in Angstroms
    'epsilon_kcal': 0.21280,    # LJ epsilon in kcal/mol
    'q_H':         0.6791,      # Charge on H (e)
    'q_M':        -1.3582,      # Charge on virtual site M (e)
    'd_OM_A':      0.1594,      # O-M distance in Angstroms
}

# Unit conversions
ANGSTROM_TO_NM = 0.1
KCAL_TO_KJ = 4.184


def test_opc_xml_parameters():
    """Test 1: Verify OPC XML parameters match published values."""
    print('='*60)
    print('TEST 1: OPC XML parameter parity with Izadi et al. 2014')
    print('='*60)

    from openmm.app import ForceField
    import openmmforcefields
    import xml.etree.ElementTree as ET

    # Find and parse the OPC XML
    ffxml_dir = os.path.join(
        os.path.dirname(openmmforcefields.__file__), 'ffxml', 'amber'
    )
    opc_path = os.path.join(ffxml_dir, 'opc.xml')
    tree = ET.parse(opc_path)
    root = tree.getroot()

    passed = 0
    failed = 0

    # --- Bond length ---
    bond = root.find('.//HarmonicBondForce/Bond')
    xml_r_OH_nm = float(bond.get('length'))
    xml_r_OH_A = xml_r_OH_nm / ANGSTROM_TO_NM
    pub_r_OH = PUBLISHED_OPC['r_OH_A']
    ok = abs(xml_r_OH_A - pub_r_OH) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] r(O-H): XML={xml_r_OH_A:.4f} A, published={pub_r_OH:.4f} A')
    passed += ok; failed += (not ok)

    # --- Angle ---
    angle = root.find('.//HarmonicAngleForce/Angle')
    xml_angle_rad = float(angle.get('angle'))
    xml_angle_deg = math.degrees(xml_angle_rad)
    pub_angle = PUBLISHED_OPC['theta_HOH']
    ok = abs(xml_angle_deg - pub_angle) < 0.05
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] theta(HOH): XML={xml_angle_deg:.2f} deg, published={pub_angle:.1f} deg')
    passed += ok; failed += (not ok)

    # --- LJ sigma ---
    atoms = root.findall('.//NonbondedForce/Atom')
    o_atom = [a for a in atoms if 'opc-O' in a.get('type')][0]
    xml_sigma_nm = float(o_atom.get('sigma'))
    xml_sigma_A = xml_sigma_nm / ANGSTROM_TO_NM
    pub_sigma = PUBLISHED_OPC['sigma_A']
    ok = abs(xml_sigma_A - pub_sigma) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] sigma(O): XML={xml_sigma_A:.5f} A, published={pub_sigma:.5f} A')
    passed += ok; failed += (not ok)

    # --- LJ epsilon ---
    xml_eps_kj = float(o_atom.get('epsilon'))
    xml_eps_kcal = xml_eps_kj / KCAL_TO_KJ
    pub_eps = PUBLISHED_OPC['epsilon_kcal']
    ok = abs(xml_eps_kcal - pub_eps) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] epsilon(O): XML={xml_eps_kcal:.5f} kcal/mol, published={pub_eps:.5f} kcal/mol')
    passed += ok; failed += (not ok)

    # --- Charges ---
    h_atom = [a for a in atoms if 'opc-H' in a.get('type')][0]
    m_atom = [a for a in atoms if 'opc-M' in a.get('type')][0]

    xml_q_H = float(h_atom.get('charge'))
    pub_q_H = PUBLISHED_OPC['q_H']
    ok = abs(xml_q_H - pub_q_H) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] q(H): XML={xml_q_H:.4f} e, published={pub_q_H:.4f} e')
    passed += ok; failed += (not ok)

    xml_q_M = float(m_atom.get('charge'))
    pub_q_M = PUBLISHED_OPC['q_M']
    ok = abs(xml_q_M - pub_q_M) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] q(M): XML={xml_q_M:.4f} e, published={pub_q_M:.4f} e')
    passed += ok; failed += (not ok)

    # --- Charge neutrality ---
    total_q = 2 * xml_q_H + xml_q_M
    ok = abs(total_q) < 1e-6
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] charge neutrality: 2*q(H)+q(M)={total_q:.6f} e')
    passed += ok; failed += (not ok)

    # --- Virtual site weights (d_OM) ---
    vs = root.find('.//Residue/VirtualSite')
    w1 = float(vs.get('weight1'))
    w2 = float(vs.get('weight2'))
    w3 = float(vs.get('weight3'))
    # d_OM = 2 * w2 * r_OH * cos(theta/2)
    half_theta = math.radians(PUBLISHED_OPC['theta_HOH'] / 2)
    computed_d_OM = 2 * w2 * xml_r_OH_A * math.cos(half_theta)
    pub_d_OM = PUBLISHED_OPC['d_OM_A']
    ok = abs(computed_d_OM - pub_d_OM) < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] d(O-M): computed={computed_d_OM:.4f} A, published={pub_d_OM:.4f} A')
    passed += ok; failed += (not ok)

    # Weight sum = 1
    ok = abs(w1 + w2 + w3 - 1.0) < 1e-10
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] weight sum: {w1+w2+w3:.10f} (should be 1.0)')
    passed += ok; failed += (not ok)

    # w2 == w3 (symmetric)
    ok = abs(w2 - w3) < 1e-15
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] weight symmetry: w2={w2:.15f}, w3={w3:.15f}')
    passed += ok; failed += (not ok)

    # --- 4-site topology ---
    residue = root.find('.//Residues/Residue')
    atom_names = [a.get('name') for a in residue.findall('Atom')]
    ok = atom_names == ['O', 'H1', 'H2', 'M']
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] 4-site topology: {atom_names}')
    passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def test_forcefield_loading():
    """Test 2: Verify ff19SB + OPC force fields load together."""
    print('='*60)
    print('TEST 2: Force field loading (ff19SB + OPC)')
    print('='*60)

    from openmm.app import ForceField
    import openmmforcefields

    passed = 0
    failed = 0

    # Load accurate preset
    try:
        ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')
        print('  [PASS] ForceField loads: amber/protein.ff19SB.xml + amber/opc_standard.xml')
        passed += 1
    except Exception as e:
        print(f'  [FAIL] ForceField load error: {e}')
        failed += 1
        return False

    # Load fast preset for comparison
    try:
        ff_fast = ForceField('amber14-all.xml', 'amber14/tip3p.xml')
        print('  [PASS] ForceField loads: amber14-all.xml + amber14/tip3p.xml (fast preset)')
        passed += 1
    except Exception as e:
        print(f'  [FAIL] Fast preset load error: {e}')
        failed += 1

    # Verify SMIRNOFF generator works with both
    try:
        from openff.toolkit import Molecule
        from openmmforcefields.generators import SMIRNOFFTemplateGenerator
        import rdkit.Chem as Chem

        # Simple molecule (ethanol) for testing
        mol = Chem.MolFromSmiles('CCO')
        mol = Chem.AddHs(mol)
        from rdkit.Chem import AllChem
        AllChem.EmbedMolecule(mol, AllChem.ETKDG())

        ligand = Molecule.from_rdkit(mol)
        smirnoff = SMIRNOFFTemplateGenerator(molecules=[ligand])
        ff.registerTemplateGenerator(smirnoff.generator)
        print('  [PASS] SMIRNOFF generator registers with ff19SB+OPC ForceField')
        passed += 1
    except Exception as e:
        print(f'  [FAIL] SMIRNOFF registration error: {e}')
        failed += 1

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def test_water_box_construction():
    """Test 3: Build a pure OPC water box and verify structure."""
    print('='*60)
    print('TEST 3: OPC water box construction')
    print('='*60)

    from openmm.app import ForceField, Modeller, Topology, PDBFile
    from openmm import Vec3
    from openmm.unit import nanometers, angstroms
    import openmmforcefields

    passed = 0
    failed = 0

    ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')

    # Create empty modeller and add water box
    topology = Topology()
    modeller = Modeller(topology, [])

    modeller.addSolvent(
        ff,
        model='tip4pew',  # 4-site template geometry
        boxSize=Vec3(2.5, 2.5, 2.5) * nanometers,
        positiveIon='Na+',
        negativeIon='Cl-',
    )

    n_atoms = modeller.topology.getNumAtoms()
    n_residues = sum(1 for r in modeller.topology.residues())

    ok = n_atoms > 0
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Water box created: {n_atoms} atoms, {n_residues} residues')
    passed += ok; failed += (not ok)

    # Count water molecules (HOH residues)
    n_waters = sum(1 for r in modeller.topology.residues() if r.name == 'HOH')
    ok = n_waters > 100  # 2.5 nm box should have hundreds of waters
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Water count: {n_waters} molecules')
    passed += ok; failed += (not ok)

    # Verify 4 atoms per water (O, H1, H2, M)
    water_residues = [r for r in modeller.topology.residues() if r.name == 'HOH']
    first_water = water_residues[0]
    atoms_per_water = sum(1 for a in first_water.atoms())
    ok = atoms_per_water == 4
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Atoms per water: {atoms_per_water} (expected 4 for OPC)')
    passed += ok; failed += (not ok)

    # Check atom names in water
    atom_names = [a.name for a in first_water.atoms()]
    ok = set(atom_names) == {'O', 'H1', 'H2', 'M'}
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Water atom names: {atom_names}')
    passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def test_system_creation_and_forces():
    """Test 4: Create OpenMM system and verify OPC force parameters."""
    print('='*60)
    print('TEST 4: System creation and OPC force parameters')
    print('='*60)

    from openmm.app import ForceField, Modeller, Topology
    from openmm import (
        Vec3, NonbondedForce, HarmonicBondForce, HarmonicAngleForce,
        System,
    )
    from openmm.app import PME
    from openmm.unit import nanometers, angstroms, kilojoules_per_mole, elementary_charge
    import openmmforcefields

    passed = 0
    failed = 0

    ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')

    topology = Topology()
    modeller = Modeller(topology, [])
    modeller.addSolvent(
        ff,
        model='tip4pew',
        boxSize=Vec3(2.0, 2.0, 2.0) * nanometers,
    )

    system = ff.createSystem(
        modeller.topology,
        nonbondedMethod=PME,
        nonbondedCutoff=1.0 * nanometers,
    )

    ok = system.getNumParticles() > 0
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] System created with {system.getNumParticles()} particles')
    passed += ok; failed += (not ok)

    # Find the NonbondedForce and check O parameters
    nb_force = None
    for i in range(system.getNumForces()):
        force = system.getForce(i)
        if isinstance(force, NonbondedForce):
            nb_force = force
            break

    ok = nb_force is not None
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] NonbondedForce found in system')
    passed += ok; failed += (not ok)

    if nb_force:
        # Find a water oxygen (first heavy atom in first HOH)
        water_residues = [r for r in modeller.topology.residues() if r.name == 'HOH']
        first_water_atoms = list(water_residues[0].atoms())
        o_idx = first_water_atoms[0].index  # O
        h_idx = first_water_atoms[1].index  # H1
        m_idx = first_water_atoms[3].index  # M (virtual site)

        # Check O parameters
        q_O, sig_O, eps_O = nb_force.getParticleParameters(o_idx)
        q_O_val = q_O.value_in_unit(elementary_charge)
        sig_O_A = sig_O.value_in_unit(angstroms)
        eps_O_kj = eps_O.value_in_unit(kilojoules_per_mole)

        ok = abs(q_O_val) < 1e-6  # O charge should be 0 in 4-site model
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] O charge: {q_O_val:.6f} e (expected 0)')
        passed += ok; failed += (not ok)

        pub_sigma = PUBLISHED_OPC['sigma_A']
        ok = abs(sig_O_A - pub_sigma) < 0.001
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] O sigma: {sig_O_A:.5f} A (published: {pub_sigma:.5f} A)')
        passed += ok; failed += (not ok)

        pub_eps_kj = PUBLISHED_OPC['epsilon_kcal'] * KCAL_TO_KJ
        ok = abs(eps_O_kj - pub_eps_kj) < 0.01
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] O epsilon: {eps_O_kj:.5f} kJ/mol (published: {pub_eps_kj:.5f} kJ/mol)')
        passed += ok; failed += (not ok)

        # Check H charge
        q_H, _, _ = nb_force.getParticleParameters(h_idx)
        q_H_val = q_H.value_in_unit(elementary_charge)
        pub_q_H = PUBLISHED_OPC['q_H']
        ok = abs(q_H_val - pub_q_H) < 0.001
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] H charge: {q_H_val:.4f} e (published: {pub_q_H:.4f} e)')
        passed += ok; failed += (not ok)

        # Check M charge
        q_M, _, _ = nb_force.getParticleParameters(m_idx)
        q_M_val = q_M.value_in_unit(elementary_charge)
        pub_q_M = PUBLISHED_OPC['q_M']
        ok = abs(q_M_val - pub_q_M) < 0.001
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] M charge: {q_M_val:.4f} e (published: {pub_q_M:.4f} e)')
        passed += ok; failed += (not ok)

        # Per-molecule charge neutrality
        q_total = q_O_val + 2 * q_H_val + q_M_val
        ok = abs(q_total) < 1e-6
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] Per-molecule charge: {q_total:.6f} e (expected 0)')
        passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def _measure_water_geometry(positions_angstrom, water_residues, n_waters=50):
    """Helper: measure O-H bonds, HOH angles, O-M distances for water molecules."""
    import numpy as np

    bond_lengths = []
    angles = []
    om_distances = []

    for water in water_residues[:n_waters]:
        atoms = list(water.atoms())
        O = positions_angstrom[atoms[0].index]
        H1 = positions_angstrom[atoms[1].index]
        H2 = positions_angstrom[atoms[2].index]
        M = positions_angstrom[atoms[3].index]

        r1 = np.linalg.norm(H1 - O)
        r2 = np.linalg.norm(H2 - O)
        bond_lengths.extend([r1, r2])

        v1 = H1 - O
        v2 = H2 - O
        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
        cos_angle = np.clip(cos_angle, -1, 1)
        angles.append(np.degrees(np.arccos(cos_angle)))

        om_distances.append(np.linalg.norm(M - O))

    return (
        np.mean(bond_lengths), np.std(bond_lengths),
        np.mean(angles), np.std(angles),
        np.mean(om_distances), np.std(om_distances),
    )


def test_water_geometry_after_minimization(platform_name='CPU'):
    """Test 5: Verify water geometry with rigid constraints (production mode).

    In production, OPC uses rigid water constraints (constraints=HBonds).
    Bond lengths and angles are held exactly at target values by SETTLE.
    This is the mode that matters for simulation correctness.
    """
    print('='*60)
    print(f'TEST 5: OPC water geometry (rigid constraints, {platform_name})')
    print('='*60)

    from openmm.app import ForceField, Modeller, Topology, Simulation, HBonds
    from openmm import Vec3, LangevinMiddleIntegrator, Platform
    from openmm.app import PME
    from openmm.unit import nanometers, angstroms, kelvin, picoseconds
    import numpy as np
    import openmmforcefields

    passed = 0
    failed = 0

    ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')
    topology = Topology()
    modeller = Modeller(topology, [])
    modeller.addSolvent(
        ff, model='tip4pew',
        boxSize=Vec3(2.0, 2.0, 2.0) * nanometers,
    )

    water_residues = [r for r in modeller.topology.residues() if r.name == 'HOH']

    # --- Rigid water (production mode) ---
    print('  Building system with rigid water (constraints=HBonds)...')
    system = ff.createSystem(
        modeller.topology,
        nonbondedMethod=PME,
        nonbondedCutoff=1.0 * nanometers,
        constraints=HBonds,
    )

    integrator = LangevinMiddleIntegrator(
        300 * kelvin, 1 / picoseconds, 0.002 * picoseconds
    )
    platform = Platform.getPlatformByName(platform_name)
    simulation = Simulation(modeller.topology, system, integrator, platform)
    simulation.context.setPositions(modeller.positions)

    simulation.minimizeEnergy(maxIterations=500)
    # Run a few steps so constraints are fully applied
    simulation.step(100)

    state = simulation.context.getState(getPositions=True)
    positions = state.getPositions(asNumpy=True).value_in_unit(angstroms)

    mean_r, std_r, mean_a, std_a, mean_om, std_om = _measure_water_geometry(
        positions, water_residues
    )

    pub_r_OH = PUBLISHED_OPC['r_OH_A']
    pub_angle = PUBLISHED_OPC['theta_HOH']
    pub_d_OM = PUBLISHED_OPC['d_OM_A']

    # With rigid constraints, geometry should be very tight
    ok = abs(mean_r - pub_r_OH) < 0.002  # Within 0.002 A
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] r(O-H) rigid: {mean_r:.4f} +/- {std_r:.4f} A '
          f'(published: {pub_r_OH:.4f} A, tol: 0.002 A)')
    passed += ok; failed += (not ok)

    ok = abs(mean_a - pub_angle) < 0.2  # Within 0.2 degrees
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] theta(HOH) rigid: {mean_a:.2f} +/- {std_a:.2f} deg '
          f'(published: {pub_angle:.1f} deg, tol: 0.2 deg)')
    passed += ok; failed += (not ok)

    ok = abs(mean_om - pub_d_OM) < 0.002  # Within 0.002 A
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] d(O-M) rigid: {mean_om:.4f} +/- {std_om:.4f} A '
          f'(published: {pub_d_OM:.4f} A, tol: 0.002 A)')
    passed += ok; failed += (not ok)

    # Low variance confirms constraints are working
    ok = std_r < 0.001
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] r(O-H) std dev: {std_r:.5f} A (should be < 0.001, rigid)')
    passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def test_bulk_density(platform_name='CPU'):
    """Test 6: Verify OPC bulk water density at 298K/1atm.

    Published OPC density: 0.997 g/cm^3 (Izadi et al. 2014, Table 2)
    This test runs a short NPT equilibration and checks density.
    """
    print('='*60)
    print(f'TEST 6: OPC bulk water density (short NPT, ~20ps, {platform_name})')
    print('='*60)

    from openmm.app import ForceField, Modeller, Topology, Simulation
    from openmm import (
        Vec3, LangevinMiddleIntegrator, MonteCarloBarostat,
        Platform,
    )
    from openmm.app import PME
    from openmm.unit import (
        nanometers, angstroms, kelvin, picoseconds, bar, amu,
        AVOGADRO_CONSTANT_NA, item,
    )
    import numpy as np
    import openmmforcefields

    passed = 0
    failed = 0

    ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')

    topology = Topology()
    modeller = Modeller(topology, [])
    modeller.addSolvent(
        ff,
        model='tip4pew',
        boxSize=Vec3(2.5, 2.5, 2.5) * nanometers,
    )

    from openmm.app import HBonds
    system = ff.createSystem(
        modeller.topology,
        nonbondedMethod=PME,
        nonbondedCutoff=1.0 * nanometers,
        constraints=HBonds,  # Rigid water geometry (matches production)
    )

    # Add barostat for NPT
    system.addForce(MonteCarloBarostat(1 * bar, 298 * kelvin, 25))

    integrator = LangevinMiddleIntegrator(
        298 * kelvin, 1 / picoseconds, 0.002 * picoseconds
    )
    platform = Platform.getPlatformByName(platform_name)
    simulation = Simulation(modeller.topology, system, integrator, platform)
    simulation.context.setPositions(modeller.positions)

    # Minimize
    print('  Minimizing...')
    simulation.minimizeEnergy(maxIterations=1000)

    # Equilibrate 10 ps
    print('  Equilibrating (10 ps)...')
    simulation.step(5000)

    # Sample density over 10 ps
    print('  Sampling density (10 ps)...')
    densities = []
    n_water = sum(1 for r in modeller.topology.residues() if r.name == 'HOH')
    water_mass_gmol = 18.015  # g/mol

    for _ in range(100):
        simulation.step(50)  # 0.1 ps between samples
        state = simulation.context.getState()
        box = state.getPeriodicBoxVectors(asNumpy=True).value_in_unit(nanometers)
        # Volume from box vectors: V = a . (b x c)
        cross = np.cross(box[1], box[2])
        vol_nm3 = abs(np.dot(box[0], cross))
        vol_cm3 = vol_nm3 * 1e-21  # nm^3 -> cm^3
        mass_g = n_water * water_mass_gmol / 6.022e23
        density = mass_g / vol_cm3
        densities.append(density)

    mean_density = np.mean(densities)
    std_density = np.std(densities)
    pub_density = 0.997  # g/cm^3 (published OPC, 298K)

    # Allow 3% tolerance for short simulation
    ok = abs(mean_density - pub_density) / pub_density < 0.03
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Density: {mean_density:.4f} +/- {std_density:.4f} g/cm^3 '
          f'(published: {pub_density:.3f} g/cm^3, tolerance: 3%)')
    passed += ok; failed += (not ok)

    # Density should definitely be between 0.95 and 1.05
    ok = 0.95 < mean_density < 1.05
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Density sanity check: 0.95 < {mean_density:.4f} < 1.05')
    passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def test_preset_parity():
    """Test 7: Verify both presets produce different but valid systems."""
    print('='*60)
    print('TEST 7: Fast vs Accurate preset comparison')
    print('='*60)

    from openmm.app import ForceField, Modeller, Topology
    from openmm import Vec3, NonbondedForce
    from openmm.app import PME
    from openmm.unit import nanometers, angstroms, elementary_charge
    import openmmforcefields

    passed = 0
    failed = 0

    # Build both presets
    ff_fast = ForceField('amber14-all.xml', 'amber14/tip3p.xml')
    ff_accurate = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')

    presets = {'fast': ff_fast, 'accurate': ff_accurate}
    water_models = {'fast': 'tip3p', 'accurate': 'tip4pew'}
    results = {}

    for name, ff in presets.items():
        topology = Topology()
        modeller = Modeller(topology, [])
        modeller.addSolvent(
            ff,
            model=water_models[name],
            boxSize=Vec3(2.0, 2.0, 2.0) * nanometers,
        )

        system = ff.createSystem(
            modeller.topology,
            nonbondedMethod=PME,
            nonbondedCutoff=1.0 * nanometers,
        )

        water_residues = [r for r in modeller.topology.residues() if r.name == 'HOH']
        atoms_per_water = sum(1 for _ in water_residues[0].atoms())

        # Get water O charge
        nb = None
        for i in range(system.getNumForces()):
            f = system.getForce(i)
            if isinstance(f, NonbondedForce):
                nb = f
                break

        first_O_idx = list(water_residues[0].atoms())[0].index
        q_O, sig_O, eps_O = nb.getParticleParameters(first_O_idx)

        results[name] = {
            'atoms_per_water': atoms_per_water,
            'q_O': q_O.value_in_unit(elementary_charge),
            'sig_O': sig_O.value_in_unit(angstroms),
        }

        print(f'  {name}: {atoms_per_water} atoms/water, '
              f'q(O)={q_O.value_in_unit(elementary_charge):.4f}, '
              f'sigma(O)={sig_O.value_in_unit(angstroms):.4f} A')

    # TIP3P should have 3 atoms per water, OPC should have 4
    ok = results['fast']['atoms_per_water'] == 3
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Fast (TIP3P): 3 atoms/water = {results["fast"]["atoms_per_water"]}')
    passed += ok; failed += (not ok)

    ok = results['accurate']['atoms_per_water'] == 4
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] Accurate (OPC): 4 atoms/water = {results["accurate"]["atoms_per_water"]}')
    passed += ok; failed += (not ok)

    # TIP3P: charge is on O; OPC: charge is on virtual site M (O charge = 0)
    ok = abs(results['fast']['q_O']) > 0.5  # TIP3P O has charge ~ -0.834
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] TIP3P O has charge: {results["fast"]["q_O"]:.4f} (non-zero)')
    passed += ok; failed += (not ok)

    ok = abs(results['accurate']['q_O']) < 1e-6  # OPC O has charge 0
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] OPC O has zero charge: {results["accurate"]["q_O"]:.6f}')
    passed += ok; failed += (not ok)

    # Sigma values should differ (TIP3P vs OPC)
    ok = abs(results['fast']['sig_O'] - results['accurate']['sig_O']) > 0.01
    status = 'PASS' if ok else 'FAIL'
    print(f'  [{status}] LJ sigma differs between presets: '
          f'{results["fast"]["sig_O"]:.4f} vs {results["accurate"]["sig_O"]:.4f} A')
    passed += ok; failed += (not ok)

    print(f'\n  Results: {passed} passed, {failed} failed\n')
    return failed == 0


def main():
    print('\n' + '='*60)
    print('  OPC Water Model Validation Suite')
    print('  Izadi et al. 2014, J. Phys. Chem. Lett. 5:3863-71')
    print('='*60 + '\n')

    results = []
    test_names = []

    # Detect available GPU platform
    gpu_platform = None
    for name in ('Metal', 'OpenCL'):
        try:
            from openmm import Platform
            Platform.getPlatformByName(name)
            gpu_platform = name
            break
        except Exception:
            pass

    tests = [
        ('XML parameter parity', test_opc_xml_parameters),
        ('Force field loading', test_forcefield_loading),
        ('Water box construction', test_water_box_construction),
        ('System forces', test_system_creation_and_forces),
        ('Geometry after minimization (CPU)', test_water_geometry_after_minimization),
        ('Bulk water density (CPU)', test_bulk_density),
        ('Preset comparison', test_preset_parity),
    ]

    # Add GPU platform variants if available
    if gpu_platform:
        tests.append((
            f'Geometry after minimization ({gpu_platform})',
            lambda: test_water_geometry_after_minimization(gpu_platform),
        ))
        tests.append((
            f'Bulk water density ({gpu_platform})',
            lambda: test_bulk_density(gpu_platform),
        ))

    for name, test_fn in tests:
        try:
            ok = test_fn()
            results.append(ok)
            test_names.append(name)
        except Exception as e:
            print(f'  [ERROR] {name}: {e}')
            import traceback
            traceback.print_exc()
            results.append(False)
            test_names.append(name)

    # Summary
    print('='*60)
    print('  SUMMARY')
    print('='*60)
    for name, ok in zip(test_names, results):
        status = 'PASS' if ok else 'FAIL'
        print(f'  [{status}] {name}')

    total = len(results)
    passed = sum(results)
    print(f'\n  {passed}/{total} test suites passed')

    if all(results):
        print('\n  All tests passed! OPC integration is validated.\n')
        return 0
    else:
        print('\n  Some tests FAILED. Review output above.\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
