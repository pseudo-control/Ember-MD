"""
Shared utilities for Ember staging scripts.

Consolidates duplicated patterns: CIF conversion, ligand selection,
PBC transforms, SA score calculation, and output schemas.
"""

import os
import sys
from typing import TypedDict, List, Optional


# ---------------------------------------------------------------------------
# Output schemas — match TypeScript interfaces in shared/types/
# Used for documentation; enforce with mypy, not at runtime.
# ---------------------------------------------------------------------------

class DetectedLigand(TypedDict):
    """Ligand detected in a PDB file. Matches shared/types/dock.ts DetectedLigand."""
    id: str            # e.g. "ATP_A_501"
    resname: str
    chain: str
    resnum: str        # String, not int (PDB insertion codes)
    num_atoms: int

class DockMolecule(TypedDict):
    """Molecule loaded for docking. Matches shared/types/dock.ts DockMolecule."""
    filename: str
    smiles: str
    qed: float
    saScore: float
    sdfPath: str

class DockResult(TypedDict, total=False):
    """Single docking pose result. Matches shared/types/dock.ts DockResult."""
    ligandName: str
    smiles: str
    qed: float
    vinaAffinity: float
    poseIndex: int
    outputSdf: str
    parentMolecule: Optional[str]
    protonationVariant: Optional[int]
    conformerIndex: Optional[int]

class AnalysisResultMeta(TypedDict):
    """Common fields for analysis result JSON files."""
    type: str          # 'rmsd', 'rmsf', 'hbonds', 'contacts'
    plotPath: Optional[str]
    csvPath: Optional[str]

class BindingSiteHotspot(TypedDict):
    """Single hotspot from binding site map analysis."""
    type: str          # 'hydrophobic', 'hbond_donor', 'hbond_acceptor'
    position: List[float]
    direction: List[float]
    score: float

class SurfacePropsResult(TypedDict):
    """Per-atom surface properties. Matches shared/types/ipc.ts SurfacePropsResult."""
    atomCount: int
    hydrophobic: List[float]     # per-atom, [-1, 1]
    electrostatic: List[float]   # per-atom, [-1, 1]


def convert_cif_to_pdb(cif_path):
    """Convert mmCIF (.cif) file to PDB format.

    Prefers BioPython (preserves all HETATM records including ligands).
    Falls back to PDBFixer (may drop some non-standard residues).
    Returns path to converted PDB, or original path if not CIF.
    """
    if not cif_path.lower().endswith('.cif'):
        return cif_path

    pdb_path = cif_path.rsplit('.', 1)[0] + '_converted.pdb'
    if os.path.exists(pdb_path):
        print(f'  Using cached CIF->PDB conversion: {os.path.basename(pdb_path)}', file=sys.stderr)
        return pdb_path

    # Prefer BioPython — preserves all residues including HETATM
    try:
        from Bio.PDB import MMCIFParser, PDBIO
        print(f"  Converting CIF to PDB (BioPython): {os.path.basename(cif_path)}", file=sys.stderr)
        parser = MMCIFParser(QUIET=True)
        structure = parser.get_structure('struct', cif_path)
        io = PDBIO()
        io.set_structure(structure)
        io.save(pdb_path)
        print(f"  Converted to: {os.path.basename(pdb_path)}", file=sys.stderr)
        return pdb_path
    except ImportError:
        pass
    except Exception as e:
        print(f"  WARNING: BioPython CIF conversion failed: {e}, trying PDBFixer", file=sys.stderr)

    # Fallback to PDBFixer
    try:
        from pdbfixer import PDBFixer
        from openmm.app import PDBFile
    except ImportError:
        print("ERROR: Neither BioPython nor PDBFixer available for CIF support", file=sys.stderr)
        sys.exit(1)

    print(f"  Converting CIF to PDB (PDBFixer): {os.path.basename(cif_path)}", file=sys.stderr)
    fixer = PDBFixer(filename=cif_path)
    with open(pdb_path, 'w') as f:
        PDBFile.writeFile(fixer.topology, fixer.positions, f, keepIds=True)
    print(f"  Converted to: {os.path.basename(pdb_path)}", file=sys.stderr)
    return pdb_path


def select_ligand_atoms(universe, custom_selection=None):
    """Select ligand atoms from an MDAnalysis Universe.

    Two-tier fallback:
    1. Custom selection or broad non-protein/non-solvent selection
    2. Common ligand resnames (LIG, UNL, UNK, MOL)

    Returns MDAnalysis AtomGroup (may be empty).
    """
    if custom_selection:
        return universe.select_atoms(custom_selection)

    # Primary: everything that's not protein, water, or ions
    ligand = universe.select_atoms(
        'not protein and not resname WAT HOH TIP3 TIP4 NA CL SOL K MG and not element H'
    )
    if len(ligand) == 0:
        # Fallback: common ligand resnames
        ligand = universe.select_atoms('(resname LIG UNL UNK MOL) and not element H')

    return ligand


def apply_pbc_transforms(universe, protein=None, ligand=None):
    """Apply PBC unwrapping and centering transformations.

    Applies: unwrap → center_in_box → wrap workflow.
    Handles protein-ligand, protein-only, and ligand-only systems.
    Silently continues if transforms fail (e.g., missing box dimensions).
    """
    try:
        from MDAnalysis import transformations as trans

        if protein is not None and len(protein) > 0:
            if ligand is not None and len(ligand) > 0:
                complex_group = protein + ligand
            else:
                complex_group = protein
            workflow = [
                trans.unwrap(complex_group),
                trans.center_in_box(protein, center='mass'),
                trans.wrap(complex_group, compound='fragments'),
            ]
            universe.trajectory.add_transformations(*workflow)
            print("Applied PBC unwrapping and centering transformations")
        elif ligand is not None and len(ligand) > 0:
            workflow = [
                trans.unwrap(ligand),
                trans.center_in_box(ligand, center='mass'),
                trans.wrap(ligand, compound='fragments'),
            ]
            universe.trajectory.add_transformations(*workflow)
            print("Applied PBC unwrapping and centering transformations (ligand-only)")
    except Exception as e:
        print(f"Warning: Could not apply PBC transformations: {e}", file=sys.stderr)


def calculate_sa_score(mol, default=3.0):
    """Calculate synthetic accessibility score using RDKit's SA_Score contrib.

    Returns SA score (1-10, lower is more synthetically accessible),
    or default value if sascorer is unavailable.
    """
    try:
        from rdkit.Chem import RDConfig
        sa_path = os.path.join(RDConfig.RDContribDir, 'SA_Score')
        if sa_path not in sys.path:
            sys.path.append(sa_path)
        import sascorer
        return sascorer.calculateScore(mol)
    except Exception:
        return default
