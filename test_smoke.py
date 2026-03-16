"""
Smoke tests for the Mac version of OpenSBDD.
Verifies that all Python scripts the Electron app calls are importable
and that OpenMM + OpenCL work correctly.
"""

import subprocess
import sys
import os

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), 'deps', 'staging', 'scripts')
PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  [PASS] {name}")
        PASS += 1
    else:
        print(f"  [FAIL] {name} — {detail}")
        FAIL += 1


def test_scripts_exist():
    """Check all required Python scripts are present."""
    print("\n=== Script Existence ===")
    required = [
        'run_md_simulation.py',
        'cluster_trajectory.py',
        'export_frame.py',
        'analyze_rmsd.py',
        'analyze_rmsf.py',
        'analyze_hbonds.py',
        'generate_md_report.py',
        'extract_xray_ligand.py',
        'align_clusters.py',
    ]
    for script in required:
        path = os.path.join(SCRIPTS_DIR, script)
        check(script, os.path.exists(path), f"not found at {path}")


def test_no_deleted_scripts():
    """Make sure GNINA/FragGen scripts were actually removed."""
    print("\n=== Deleted Scripts Absent ===")
    should_not_exist = [
        'run_gnina_docking.py',
        'parse_gnina_results.py',
        'export_gnina_csv.py',
        'prep_pdb_gui.py',
        'generate_pocket_surface.py',
        'gen_from_pdb.py',
        'generate_results_csv.py',
        'generate_2d_thumbnail.py',
        'enumerate_protonation.py',
        'generate_conformers.py',
    ]
    for script in should_not_exist:
        path = os.path.join(SCRIPTS_DIR, script)
        check(f"{script} removed", not os.path.exists(path), "still exists!")


def test_openmm_imports():
    """Check OpenMM and dependencies import correctly."""
    print("\n=== OpenMM Imports ===")
    try:
        import openmm
        check("openmm", True)
        check(f"version {openmm.Platform.getOpenMMVersion()}", True)
    except ImportError as e:
        check("openmm", False, str(e))

    try:
        from openmm import app
        check("openmm.app", True)
    except ImportError as e:
        check("openmm.app", False, str(e))

    try:
        import openmmforcefields
        check("openmmforcefields", True)
    except ImportError as e:
        check("openmmforcefields", False, str(e))

    try:
        from openff.toolkit import Molecule
        check("openff.toolkit", True)
    except ImportError as e:
        check("openff.toolkit", False, str(e))

    try:
        from pdbfixer import PDBFixer
        check("pdbfixer", True)
    except ImportError as e:
        check("pdbfixer", False, str(e))

    try:
        import rdkit
        check("rdkit", True)
    except ImportError as e:
        check("rdkit", False, str(e))


def test_opencl_platform():
    """Verify OpenCL platform is available and runs on GPU."""
    print("\n=== OpenCL Platform ===")
    try:
        from openmm import Platform
        platforms = [Platform.getPlatform(i).getName()
                     for i in range(Platform.getNumPlatforms())]
        check("platforms available", len(platforms) > 0, f"found: {platforms}")
        check("OpenCL present", 'OpenCL' in platforms, f"only: {platforms}")

        if 'OpenCL' in platforms:
            from openmm import System, VerletIntegrator
            from openmm.app import Simulation, Topology
            import openmm.unit as unit

            sys = System()
            sys.addParticle(1.0 * unit.dalton)
            integrator = VerletIntegrator(0.001 * unit.picoseconds)
            p = Platform.getPlatformByName('OpenCL')
            from openmm import Context
            ctx = Context(sys, integrator, p)
            device = p.getPropertyValue(ctx, 'DeviceName')
            check(f"OpenCL device: {device}", True)
            del ctx
    except Exception as e:
        check("OpenCL test", False, str(e))


def test_force_fields():
    """Verify AMBER force fields load."""
    print("\n=== Force Fields ===")
    try:
        from openmm.app import ForceField
        ff = ForceField('amber14-all.xml', 'amber14/tip3p.xml')
        check("ff14SB + TIP3P", True)
    except Exception as e:
        check("ff14SB + TIP3P", False, str(e))

    try:
        from openmm.app import ForceField
        ff = ForceField('amber/protein.ff19SB.xml', 'amber/opc_standard.xml')
        check("ff19SB + OPC", True)
    except Exception as e:
        check("ff19SB + OPC", False, str(e))


def test_md_script_syntax():
    """Check run_md_simulation.py has no syntax errors."""
    print("\n=== MD Script Syntax ===")
    md_script = os.path.join(SCRIPTS_DIR, 'run_md_simulation.py')
    result = subprocess.run(
        [sys.executable, '-m', 'py_compile', md_script],
        capture_output=True, text=True
    )
    check("run_md_simulation.py compiles", result.returncode == 0,
          result.stderr.strip() if result.returncode != 0 else "")


def test_no_gnina_dirs():
    """Verify large GNINA/FragGen dirs were removed."""
    print("\n=== Removed Directories ===")
    base = os.path.dirname(__file__)
    should_not_exist = [
        'deps/staging/gnina',
        'deps/staging/python310',
        'deps/staging/python36',
        'deps/staging/models',
        'deps/packaging',
        'CORDIAL',
        'packaging',
        'shared/types/gnina.ts',
    ]
    for d in should_not_exist:
        p = os.path.join(base, d)
        check(f"{d} removed", not os.path.exists(p), "still exists!")


if __name__ == '__main__':
    print("OpenSBDD Mac Smoke Tests")
    print("=" * 50)

    test_scripts_exist()
    test_no_deleted_scripts()
    test_no_gnina_dirs()
    test_openmm_imports()
    test_opencl_platform()
    test_force_fields()
    test_md_script_syntax()

    print(f"\n{'=' * 50}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    if FAIL == 0:
        print("All smoke tests passed!")
    else:
        print("Some tests FAILED!")
    sys.exit(1 if FAIL > 0 else 0)
