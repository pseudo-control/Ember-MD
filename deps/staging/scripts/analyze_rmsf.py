#!/usr/bin/env python3
"""
Calculate per-residue RMSF (Root Mean Square Fluctuation) from MD trajectory.

Generates RMSF plot showing flexibility along the protein sequence.
"""

import argparse
import json
import os
import sys
import warnings

warnings.filterwarnings('ignore')


def main():
    parser = argparse.ArgumentParser(description='Calculate per-residue RMSF from trajectory')
    parser.add_argument('--topology', required=True, help='Topology file (PDB)')
    parser.add_argument('--trajectory', required=True, help='Trajectory file (DCD)')
    parser.add_argument('--output_dir', required=True, help='Output directory')
    parser.add_argument('--ligand_selection', default=None, help='Custom ligand selection string')
    args = parser.parse_args()

    try:
        import MDAnalysis as mda
        from MDAnalysis.analysis import rms
        import numpy as np
    except ImportError as e:
        print(f"Error: Missing required package: {e}", file=sys.stderr)
        print("Install with: pip install MDAnalysis", file=sys.stderr)
        sys.exit(1)

    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print("Warning: matplotlib not available, skipping plot generation", file=sys.stderr)
        plt = None

    print(f"Loading trajectory: {args.trajectory}")
    print(f"Topology: {args.topology}")

    # Load universe
    u = mda.Universe(args.topology, args.trajectory)
    n_frames = len(u.trajectory)
    print(f"Frames: {n_frames}")

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    # Select CA atoms for per-residue RMSF
    ca_atoms = u.select_atoms('name CA')
    if len(ca_atoms) == 0:
        print("Warning: No CA atoms found, trying backbone", file=sys.stderr)
        ca_atoms = u.select_atoms('backbone')

    if len(ca_atoms) == 0:
        print("No protein atoms found, skipping RMSF calculation")
        # Write empty results so report generation can continue
        results = {
            'type': 'rmsf',
            'plotPath': None,
            'csvPath': None,
            'data': {
                'residueIndices': [],
                'residueNums': [],
                'residueNames': [],
                'rmsf': [],
                'stats': {'mean': None, 'std': None, 'max': None, 'maxResidue': None, 'min': None, 'minResidue': None},
            },
        }
        results_path = os.path.join(args.output_dir, 'rmsf_results.json')
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)
        sys.exit(0)

    print(f"Calculating RMSF for {len(ca_atoms)} atoms...")

    # Calculate RMSF
    R = rms.RMSF(ca_atoms)
    R.run()

    rmsf_values = R.results.rmsf
    residue_indices = np.arange(1, len(rmsf_values) + 1)

    # Get residue names and numbers if available
    try:
        resnames = [atom.resname for atom in ca_atoms]
        resnums = [atom.resnum for atom in ca_atoms]
    except:
        resnames = ['UNK'] * len(ca_atoms)
        resnums = residue_indices.tolist()

    print(f"  Residues: {len(rmsf_values)}")
    print(f"  Mean RMSF: {np.mean(rmsf_values):.2f} Å")
    print(f"  Max RMSF: {np.max(rmsf_values):.2f} Å at residue {resnums[np.argmax(rmsf_values)]}")

    # Save data as CSV
    csv_path = os.path.join(args.output_dir, 'rmsf_data.csv')
    with open(csv_path, 'w') as f:
        f.write('residue_index,residue_num,residue_name,rmsf\n')
        for i in range(len(rmsf_values)):
            f.write(f'{residue_indices[i]},{resnums[i]},{resnames[i]},{rmsf_values[i]:.4f}\n')
    print(f"Data saved to: {csv_path}")

    # Generate plot
    plot_path = os.path.join(args.output_dir, 'rmsf_plot.png')
    if plt is not None:
        fig, ax = plt.subplots(figsize=(12, 5))

        ax.fill_between(residue_indices, 0, rmsf_values, alpha=0.3, color='#2563eb')
        ax.plot(residue_indices, rmsf_values, color='#2563eb', linewidth=0.8)

        ax.set_xlabel('Residue Index')
        ax.set_ylabel('RMSF (Å)')
        ax.set_title('Per-Residue RMSF')
        ax.grid(True, alpha=0.3)
        ax.set_xlim(1, len(rmsf_values))

        # Add horizontal line for mean
        mean_rmsf = np.mean(rmsf_values)
        ax.axhline(y=mean_rmsf, color='#dc2626', linestyle='--', linewidth=1, alpha=0.7,
                   label=f'Mean: {mean_rmsf:.2f} Å')
        ax.legend()

        # Highlight flexible regions (> mean + 1 std)
        threshold = mean_rmsf + np.std(rmsf_values)
        flexible = rmsf_values > threshold
        if np.any(flexible):
            flexible_indices = residue_indices[flexible]
            flexible_rmsf = rmsf_values[flexible]
            ax.scatter(flexible_indices, flexible_rmsf, color='#dc2626', s=20, zorder=5,
                       label='Flexible regions')

        plt.tight_layout()
        plt.savefig(plot_path, dpi=150)
        plt.close()
        print(f"Plot saved to: {plot_path}")

    # Save results JSON
    results = {
        'type': 'rmsf',
        'plotPath': plot_path if os.path.exists(plot_path) else None,
        'csvPath': csv_path if os.path.exists(csv_path) else None,
        'data': {
            'residueIndices': residue_indices.tolist(),
            'residueNums': resnums,
            'residueNames': resnames,
            'rmsf': rmsf_values.tolist(),
            'stats': {
                'mean': float(np.mean(rmsf_values)),
                'std': float(np.std(rmsf_values)),
                'max': float(np.max(rmsf_values)),
                'maxResidue': int(resnums[np.argmax(rmsf_values)]),
                'min': float(np.min(rmsf_values)),
                'minResidue': int(resnums[np.argmin(rmsf_values)]),
            }
        }
    }

    results_path = os.path.join(args.output_dir, 'rmsf_results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)

    print("Done!")


if __name__ == '__main__':
    main()
