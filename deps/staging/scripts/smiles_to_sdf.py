#!/usr/bin/env python3
"""
Convert a single SMILES string or MOL/SDF file to a 3D SDF file + 2D PNG thumbnail.

Used for single-molecule docking input in the GNINA pipeline.
"""

import argparse
import base64
import io
import json
import os
import sys

try:
    import rdkit.Chem as Chem
    from rdkit.Chem import AllChem, Draw, Descriptors
except ImportError:
    print("ERROR:Missing dependency: rdkit", file=sys.stderr)
    sys.exit(1)


def smiles_to_mol(smiles):
    """Parse SMILES string and return RDKit molecule with 3D coords."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, "Invalid SMILES string"

    mol = Chem.AddHs(mol)

    # Generate 3D conformer via ETKDG
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    result = AllChem.EmbedMolecule(mol, params)
    if result == -1:
        # Fallback with less strict parameters
        result = AllChem.EmbedMolecule(mol, randomSeed=42)
        if result == -1:
            return None, "Failed to generate 3D coordinates"

    # Energy minimize
    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=1000)
    except Exception:
        try:
            AllChem.UFFOptimizeMolecule(mol, maxIters=1000)
        except Exception:
            pass  # Keep unoptimized conformer

    return mol, None


def load_mol_file(mol_path):
    """Load a MOL or SDF file and return RDKit molecule with 3D coords."""
    ext = os.path.splitext(mol_path)[1].lower()

    if ext == '.sdf':
        supplier = Chem.SDMolSupplier(mol_path, removeHs=False)
        mol = next(iter(supplier), None)
    elif ext in ('.mol', '.mol2'):
        mol = Chem.MolFromMolFile(mol_path, removeHs=False)
    else:
        return None, f"Unsupported file format: {ext}"

    if mol is None:
        return None, f"Failed to parse molecule from {mol_path}"

    # If no 3D coordinates, generate them
    conf = mol.GetConformer() if mol.GetNumConformers() > 0 else None
    if conf is None or conf.Is3D() is False:
        mol = Chem.AddHs(mol)
        params = AllChem.ETKDGv3()
        params.randomSeed = 42
        result = AllChem.EmbedMolecule(mol, params)
        if result == -1:
            result = AllChem.EmbedMolecule(mol, randomSeed=42)
            if result == -1:
                return None, "Failed to generate 3D coordinates"
        try:
            AllChem.MMFFOptimizeMolecule(mol, maxIters=1000)
        except Exception:
            pass

    return mol, None


def generate_thumbnail(mol, size=300):
    """Generate a 2D PNG thumbnail as base64 string."""
    # Make a 2D copy for drawing
    mol_2d = Chem.RWMol(mol)
    try:
        Chem.RemoveAllHs(mol_2d)
    except Exception:
        pass

    AllChem.Compute2DCoords(mol_2d)

    img = Draw.MolToImage(mol_2d, size=(size, size))

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    return base64.b64encode(buf.read()).decode('utf-8')


def main():
    parser = argparse.ArgumentParser(description='Convert SMILES/MOL to 3D SDF + thumbnail')
    parser.add_argument('--smiles', help='SMILES string to convert')
    parser.add_argument('--mol_file', help='MOL/SDF file to load')
    parser.add_argument('--output_dir', required=True, help='Output directory')
    parser.add_argument('--name', default='single_mol', help='Molecule name')
    args = parser.parse_args()

    if not args.smiles and not args.mol_file:
        print("ERROR: Either --smiles or --mol_file is required", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    # Load or create molecule
    if args.smiles:
        mol, error = smiles_to_mol(args.smiles)
        if error:
            print(json.dumps({"error": error}))
            sys.exit(1)
        smiles = args.smiles
    else:
        mol, error = load_mol_file(args.mol_file)
        if error:
            print(json.dumps({"error": error}))
            sys.exit(1)
        smiles = Chem.MolToSmiles(Chem.RemoveAllHs(mol))

    # Calculate properties
    mol_no_h = Chem.RemoveAllHs(mol)
    qed = Descriptors.qed(mol_no_h)
    mw = Descriptors.MolWt(mol_no_h)

    # Write 3D SDF
    name = args.name.replace(' ', '_')
    sdf_path = os.path.join(args.output_dir, f'{name}.sdf')
    writer = Chem.SDWriter(sdf_path)
    mol.SetProp("_Name", name)
    mol.SetProp("SMILES", smiles)
    writer.write(mol)
    writer.close()

    # Generate 2D thumbnail
    thumbnail = generate_thumbnail(mol)

    # Output result as JSON
    result = {
        "sdfPath": sdf_path,
        "smiles": smiles,
        "name": name,
        "qed": round(qed, 3),
        "mw": round(mw, 1),
        "thumbnail": thumbnail,
    }
    print(json.dumps(result))


if __name__ == '__main__':
    main()
