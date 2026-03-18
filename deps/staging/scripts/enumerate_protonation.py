#!/usr/bin/env python3
"""
Enumerate protonation states for ligands using Dimorphite-DL.

This script takes a list of SDF files, enumerates protonation states at
the specified pH range, generates 3D conformers for each variant, and
outputs them with a naming convention that tracks the parent molecule.

Usage:
    python enumerate_protonation.py \
        --ligand_list <json_file> \
        --output_dir <path> \
        --ph_min 6.4 \
        --ph_max 8.4

Output:
    JSON with { protonated_paths: [...], parent_mapping: {...} }
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False
    print("ERROR: RDKit not installed", file=sys.stderr)
    sys.exit(1)

try:
    from dimorphite_dl import protonate_smiles
    HAS_DIMORPHITE = True
except ImportError:
    HAS_DIMORPHITE = False


def is_chemically_reasonable(mol):
    """
    Filter out chemically unreasonable protonation states.
    Returns True if the molecule is reasonable, False otherwise.
    """
    if mol is None:
        return False

    # SMARTS patterns for unreasonable protonation states

    # 1. Protonated aniline: N+ directly attached to aromatic carbon
    # Anilines are weak bases (pKa ~4.6) due to lone pair conjugation with ring
    # They should not be protonated at physiological pH
    protonated_aniline = Chem.MolFromSmarts('[NH3+;$([NH3+]c)]')
    protonated_aniline2 = Chem.MolFromSmarts('[NH2+;$([NH2+]c)]')

    if protonated_aniline and mol.HasSubstructMatch(protonated_aniline):
        return False
    if protonated_aniline2 and mol.HasSubstructMatch(protonated_aniline2):
        return False

    # 2. Doubly protonated pyrimidinium or similar heteroaromatics
    # Having 2+ positive nitrogens in a 6-membered aromatic ring is very unfavorable
    ring_info = mol.GetRingInfo()
    atom_rings = ring_info.AtomRings()

    for ring in atom_rings:
        if len(ring) == 6:  # 6-membered rings (pyrimidine, pyridazine, etc.)
            positive_n_count = 0
            for atom_idx in ring:
                atom = mol.GetAtomWithIdx(atom_idx)
                if atom.GetAtomicNum() == 7:  # Nitrogen
                    if atom.GetFormalCharge() > 0:
                        positive_n_count += 1
            if positive_n_count >= 2:
                return False

    # 2b. Doubly protonated 5-membered rings (imidazole can be +1 but not +2)
    for ring in atom_rings:
        if len(ring) == 5:
            positive_n_count = 0
            for atom_idx in ring:
                atom = mol.GetAtomWithIdx(atom_idx)
                if atom.GetAtomicNum() == 7 and atom.GetFormalCharge() > 0:
                    positive_n_count += 1
            if positive_n_count >= 2:
                return False

    # 3. Protonated amide nitrogen (very weak base, pKa << 0)
    protonated_amide = Chem.MolFromSmarts('[NH2+;$([NH2+]C=O)]')
    protonated_amide2 = Chem.MolFromSmarts('[NH3+;$([NH3+]C=O)]')

    if protonated_amide and mol.HasSubstructMatch(protonated_amide):
        return False
    if protonated_amide2 and mol.HasSubstructMatch(protonated_amide2):
        return False

    # 4. Protonated sulfonamide nitrogen (pKa ~ -1 to 1, very weak base)
    protonated_sulfonamide = Chem.MolFromSmarts('[NH2+;$([NH2+]S(=O)=O)]')
    protonated_sulfonamide2 = Chem.MolFromSmarts('[NH3+;$([NH3+]S(=O)=O)]')

    if protonated_sulfonamide and mol.HasSubstructMatch(protonated_sulfonamide):
        return False
    if protonated_sulfonamide2 and mol.HasSubstructMatch(protonated_sulfonamide2):
        return False

    # 5. Protonated urea nitrogen (pKa ~ 0, very weak base)
    protonated_urea = Chem.MolFromSmarts('[NH2+;$([NH2+]C(=O)N)]')
    protonated_urea2 = Chem.MolFromSmarts('[NH3+;$([NH3+]C(=O)N)]')

    if protonated_urea and mol.HasSubstructMatch(protonated_urea):
        return False
    if protonated_urea2 and mol.HasSubstructMatch(protonated_urea2):
        return False

    # 6. Protonated carbamate nitrogen
    protonated_carbamate = Chem.MolFromSmarts('[NH2+;$([NH2+]C(=O)O)]')
    protonated_carbamate2 = Chem.MolFromSmarts('[NH3+;$([NH3+]C(=O)O)]')

    if protonated_carbamate and mol.HasSubstructMatch(protonated_carbamate):
        return False
    if protonated_carbamate2 and mol.HasSubstructMatch(protonated_carbamate2):
        return False

    # 7. Protonated pyrrole-type nitrogen (lone pair in aromatic system, not basic)
    # This catches pyrrole, indole, carbazole, etc.
    protonated_pyrrole = Chem.MolFromSmarts('[nH2+]')  # Aromatic N with 2H and +1

    if protonated_pyrrole and mol.HasSubstructMatch(protonated_pyrrole):
        return False

    # 8. Adjacent positive charges (electrostatically very unfavorable)
    for bond in mol.GetBonds():
        atom1 = bond.GetBeginAtom()
        atom2 = bond.GetEndAtom()
        if atom1.GetFormalCharge() > 0 and atom2.GetFormalCharge() > 0:
            return False

    # 9. Deprotonated amide nitrogen (pKa ~15-17, should never be deprotonated at pH 7.4)
    # Catches [N-]C(=O) patterns like deprotonated peptide bonds, lactams, etc.
    deprot_amide = Chem.MolFromSmarts('[N-;$([N-]C=O)]')
    deprot_amide2 = Chem.MolFromSmarts('[NH-;$([NH-]C=O)]')

    if deprot_amide and mol.HasSubstructMatch(deprot_amide):
        return False
    if deprot_amide2 and mol.HasSubstructMatch(deprot_amide2):
        return False

    # 10. Deprotonated sulfonamide NH (pKa ~10, borderline but unreasonable at pH 7.4)
    deprot_sulfonamide = Chem.MolFromSmarts('[N-;$([N-]S(=O)=O)]')

    if deprot_sulfonamide and mol.HasSubstructMatch(deprot_sulfonamide):
        return False

    # 11. Deprotonated aliphatic amine (pKa ~35, absolutely unreasonable)
    deprot_amine = Chem.MolFromSmarts('[NH-;$([NH-]([H])[CX4])]')

    if deprot_amine and mol.HasSubstructMatch(deprot_amine):
        return False

    # 12. Check total formal charge isn't too extreme (e.g., >+2 or <-2 for drug-like)
    total_charge = sum(atom.GetFormalCharge() for atom in mol.GetAtoms())
    if abs(total_charge) > 2:
        return False

    return True


def get_smiles_from_sdf(sdf_path):
    """Extract SMILES from an SDF file."""
    try:
        if sdf_path.endswith('.gz'):
            import gzip
            with gzip.open(sdf_path, 'rb') as f:
                suppl = Chem.ForwardSDMolSupplier(f)
                mol = next(suppl, None)
        else:
            suppl = Chem.SDMolSupplier(sdf_path)
            mol = suppl[0] if len(suppl) > 0 else None

        if mol is None:
            return None
        return Chem.MolToSmiles(mol)
    except Exception as e:
        print(f"Warning: Failed to read {sdf_path}: {e}", file=sys.stderr)
        return None


def enumerate_protonation_states(smiles, ph_min, ph_max):
    """
    Enumerate protonation states for a SMILES string using Dimorphite-DL.
    Returns list of protonated SMILES strings.
    """
    if not HAS_DIMORPHITE:
        return [smiles]  # Return original if Dimorphite not available

    try:
        # Use new dimorphite_dl 2.0 API
        protonated_list = protonate_smiles(
            smiles,
            ph_min=ph_min,
            ph_max=ph_max,
            max_variants=10,
            precision=1.0,
        )

        # Filter out invalid SMILES, duplicates, and chemically unreasonable states
        valid_smiles = []
        seen = set()
        filtered_count = 0
        for smi in protonated_list:
            if smi and smi not in seen:
                # Verify the SMILES is valid
                mol = Chem.MolFromSmiles(smi)
                if mol is not None:
                    # Check if chemically reasonable
                    if not is_chemically_reasonable(mol):
                        filtered_count += 1
                        continue

                    # Canonicalize for deduplication
                    canon = Chem.MolToSmiles(mol)
                    if canon not in seen:
                        seen.add(canon)
                        valid_smiles.append(smi)

        if filtered_count > 0:
            print(f"  Filtered {filtered_count} unreasonable protonation states", file=sys.stderr)

        return valid_smiles if valid_smiles else [smiles]
    except Exception as e:
        print(f"Warning: Dimorphite-DL failed for {smiles}: {e}", file=sys.stderr)
        return [smiles]


def generate_3d_conformer(smiles):
    """
    Generate a 3D conformer from SMILES using RDKit ETKDG.
    Returns RDKit Mol object or None.
    """
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None

        # Add hydrogens
        mol = Chem.AddHs(mol)

        # Generate 3D conformer using ETKDG
        params = AllChem.ETKDGv3()
        params.randomSeed = 42
        params.maxIterations = 100

        result = AllChem.EmbedMolecule(mol, params)
        if result != 0:
            # Try again with less strict parameters
            params.useRandomCoords = True
            result = AllChem.EmbedMolecule(mol, params)

        if result != 0:
            return None

        # Optimize geometry
        try:
            AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
        except Exception:
            # Fall back to UFF if MMFF fails
            try:
                AllChem.UFFOptimizeMolecule(mol, maxIters=500)
            except Exception:
                pass  # Use un-optimized geometry

        return mol
    except Exception as e:
        print(f"Warning: 3D generation failed for {smiles}: {e}", file=sys.stderr)
        return None


def process_ligand(sdf_path, output_dir, ph_min, ph_max):
    """
    Process a single ligand: enumerate protonation states and generate 3D structures.
    Returns list of (output_path, parent_name) tuples.
    """
    parent_name = Path(sdf_path).stem.replace('_docked', '').replace('.sdf', '')

    # Get SMILES from input SDF
    smiles = get_smiles_from_sdf(sdf_path)
    if smiles is None:
        print(f"Warning: Could not read SMILES from {sdf_path}", file=sys.stderr)
        return [(sdf_path, parent_name)]  # Return original

    # Enumerate protonation states
    protonated_smiles = enumerate_protonation_states(smiles, ph_min, ph_max)

    results = []

    for variant_idx, prot_smiles in enumerate(protonated_smiles):
        # Generate 3D conformer
        mol = generate_3d_conformer(prot_smiles)

        if mol is None:
            print(f"Warning: Could not generate 3D for variant {variant_idx} of {parent_name}", file=sys.stderr)
            continue

        # Set molecule name
        if len(protonated_smiles) == 1:
            # If only one variant (no enumeration), keep original name
            output_name = parent_name
        else:
            # Multiple variants: add _prot_N suffix
            output_name = f"{parent_name}_prot_{variant_idx}"

        mol.SetProp("_Name", output_name)
        mol.SetProp("SMILES", prot_smiles)
        mol.SetProp("parent_molecule", parent_name)
        mol.SetProp("protonation_variant", str(variant_idx))

        # Write to SDF
        output_path = os.path.join(output_dir, f"{output_name}.sdf")
        writer = Chem.SDWriter(output_path)
        writer.write(mol)
        writer.close()

        results.append((output_path, parent_name))
        print(f"Generated: {output_name} from {parent_name}")

    # If no variants were successfully generated, return original
    if not results:
        return [(sdf_path, parent_name)]

    return results


def main():
    parser = argparse.ArgumentParser(description='Enumerate protonation states for ligands')
    parser.add_argument('--ligand_list', required=True, help='JSON file with list of SDF paths')
    parser.add_argument('--output_dir', required=True, help='Output directory for protonated SDFs')
    parser.add_argument('--ph_min', type=float, default=6.4, help='Minimum pH for protonation')
    parser.add_argument('--ph_max', type=float, default=8.4, help='Maximum pH for protonation')
    args = parser.parse_args()

    # Check dependencies
    if not HAS_DIMORPHITE:
        print("Warning: Dimorphite-DL not installed. Using original molecules.", file=sys.stderr)
        print("Install with: pip install dimorphite_dl", file=sys.stderr)

    # Read ligand list
    with open(args.ligand_list, 'r') as f:
        ligand_paths = json.load(f)

    if not ligand_paths:
        print("No ligands to process")
        print(json.dumps({
            "protonated_paths": [],
            "parent_mapping": {}
        }))
        return

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # Process each ligand
    all_protonated_paths = []
    parent_mapping = {}

    for i, sdf_path in enumerate(ligand_paths):
        print(f"Processing {i+1}/{len(ligand_paths)}: {os.path.basename(sdf_path)}")

        results = process_ligand(sdf_path, args.output_dir, args.ph_min, args.ph_max)

        for output_path, parent_name in results:
            all_protonated_paths.append(output_path)
            variant_name = Path(output_path).stem
            parent_mapping[variant_name] = parent_name

    # Output results
    print(f"\nProtonation complete: {len(all_protonated_paths)} variants from {len(ligand_paths)} molecules")

    # Print JSON result for parsing
    print(json.dumps({
        "protonated_paths": all_protonated_paths,
        "parent_mapping": parent_mapping
    }))


if __name__ == '__main__':
    main()
