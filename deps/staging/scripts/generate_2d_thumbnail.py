#!/usr/bin/env python
"""
Generate 2D structure thumbnail from SDF file.
Outputs base64-encoded PNG data URL to stdout.
"""
import argparse
import base64
import io
import sys

from rdkit import Chem
from rdkit.Chem import Draw


def generate_thumbnail(sdf_path, size=300):
    """Generate a 2D thumbnail image from an SDF file."""
    try:
        # Handle gzipped SDF files
        if sdf_path.endswith('.gz'):
            import gzip
            with gzip.open(sdf_path, 'rb') as f:
                suppl = Chem.ForwardSDMolSupplier(f, sanitize=True)
                mol = next(suppl, None)
        else:
            suppl = Chem.SDMolSupplier(sdf_path, sanitize=True)
            mol = next(iter(suppl))
        if mol is None:
            return None

        # Always compute clean 2D coordinates for proper layout
        # This ensures no overlapping atoms regardless of 3D conformer state
        from rdkit.Chem import AllChem
        AllChem.Compute2DCoords(mol)

        # Draw molecule
        img = Draw.MolToImage(mol, size=(size, size))

        # Convert to base64 PNG
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)

        b64_data = base64.b64encode(buffer.read()).decode('utf-8')
        return f"data:image/png;base64,{b64_data}"

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description='Generate 2D thumbnail from SDF')
    parser.add_argument('--sdf_file', required=True, help='Input SDF file')
    parser.add_argument('--size', type=int, default=300, help='Image size in pixels')
    args = parser.parse_args()

    result = generate_thumbnail(args.sdf_file, args.size)
    if result:
        print(result)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
