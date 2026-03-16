#!/usr/bin/env python3
"""
Generate comprehensive MD analysis report.

Runs RMSD, RMSF, and H-bond analyses and compiles results into an HTML report.
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import warnings
from datetime import datetime

warnings.filterwarnings('ignore')


def encode_image(image_path):
    """Encode image to base64 for embedding in HTML."""
    if not os.path.exists(image_path):
        return None
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def generate_html_report(output_dir, results):
    """Generate HTML report from analysis results."""

    rmsd_data = results.get('rmsd', {})
    rmsf_data = results.get('rmsf', {})
    hbonds_data = results.get('hbonds', {})

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MD Analysis Report</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9fafb;
        }}
        h1 {{ color: #111827; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }}
        h2 {{ color: #1f2937; margin-top: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }}
        .card {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }}
        .stat-box {{
            background: #f3f4f6;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #2563eb; }}
        .stat-label {{ font-size: 14px; color: #6b7280; }}
        .plot-container {{ margin: 20px 0; text-align: center; }}
        .plot-container img {{ max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
        th {{ background-color: #f3f4f6; font-weight: 600; }}
        tr:hover {{ background-color: #f9fafb; }}
        .timestamp {{ color: #6b7280; font-size: 14px; }}
        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }}
        .badge-blue {{ background: #dbeafe; color: #1d4ed8; }}
        .badge-red {{ background: #fee2e2; color: #dc2626; }}
    </style>
</head>
<body>
    <h1>MD Analysis Report</h1>
    <p class="timestamp">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
'''

    # RMSD Section
    if rmsd_data:
        stats = rmsd_data.get('data', {}).get('stats', {})
        plot_path = rmsd_data.get('plotPath', '')
        plot_b64 = encode_image(plot_path) if plot_path else None

        html += '''
    <h2>RMSD Analysis</h2>
    <div class="card">
        <div class="stats-grid">
'''
        prot_mean = stats.get('proteinMean')
        prot_std = stats.get('proteinStd') or 0
        if prot_mean is not None:
            html += f'''
            <div class="stat-box">
                <div class="stat-value">{prot_mean:.2f} Å</div>
                <div class="stat-label">Protein RMSD (mean ± {prot_std:.2f})</div>
            </div>
'''
        lig_mean = stats.get('ligandMean')
        lig_std = stats.get('ligandStd') or 0
        if lig_mean is not None:
            html += f'''
            <div class="stat-box">
                <div class="stat-value">{lig_mean:.2f} Å</div>
                <div class="stat-label">Ligand RMSD (mean ± {lig_std:.2f})</div>
            </div>
'''
        html += '''
        </div>
'''
        if plot_b64:
            html += f'''
        <div class="plot-container">
            <img src="data:image/png;base64,{plot_b64}" alt="RMSD Plot">
        </div>
'''
        html += '''
    </div>
'''

    # RMSF Section
    if rmsf_data:
        stats = rmsf_data.get('data', {}).get('stats', {})
        plot_path = rmsf_data.get('plotPath', '')
        plot_b64 = encode_image(plot_path) if plot_path else None

        rmsf_mean = stats.get('mean')
        rmsf_max = stats.get('max')
        rmsf_max_res = stats.get('maxResidue', 'N/A')

        html += '''
    <h2>RMSF Analysis (Per-Residue Flexibility)</h2>
    <div class="card">
        <div class="stats-grid">
'''
        if rmsf_mean is not None:
            html += f'''
            <div class="stat-box">
                <div class="stat-value">{rmsf_mean:.2f} Å</div>
                <div class="stat-label">Mean RMSF</div>
            </div>
'''
        if rmsf_max is not None:
            html += f'''
            <div class="stat-box">
                <div class="stat-value">{rmsf_max:.2f} Å</div>
                <div class="stat-label">Max RMSF (Res {rmsf_max_res})</div>
            </div>
'''
        if rmsf_mean is None:
            html += '''
            <div class="stat-box">
                <div class="stat-value">N/A</div>
                <div class="stat-label">No protein atoms found</div>
            </div>
'''
        html += '''
        </div>
'''
        if plot_b64:
            html += f'''
        <div class="plot-container">
            <img src="data:image/png;base64,{plot_b64}" alt="RMSF Plot">
        </div>
'''
        html += '''
    </div>
'''

    # H-bond Section
    if hbonds_data:
        hbonds = hbonds_data.get('data', {}).get('hbonds', [])
        total = hbonds_data.get('data', {}).get('totalUnique', 0)
        plot_path = hbonds_data.get('plotPath', '')
        plot_b64 = encode_image(plot_path) if plot_path else None

        html += f'''
    <h2>Hydrogen Bond Analysis</h2>
    <div class="card">
        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-value">{total}</div>
                <div class="stat-label">Unique H-bonds</div>
            </div>
'''
        # Count high-occupancy H-bonds
        high_occ = len([hb for hb in hbonds if hb.get('occupancy', 0) > 50])
        html += f'''
            <div class="stat-box">
                <div class="stat-value">{high_occ}</div>
                <div class="stat-label">Persistent (>50% occupancy)</div>
            </div>
        </div>
'''
        if plot_b64:
            html += f'''
        <div class="plot-container">
            <img src="data:image/png;base64,{plot_b64}" alt="H-bond Plot">
        </div>
'''

        # H-bond table (top 20)
        if hbonds:
            html += '''
        <h3>Top Hydrogen Bonds</h3>
        <table>
            <thead>
                <tr>
                    <th>Donor</th>
                    <th>Acceptor</th>
                    <th>Direction</th>
                    <th>Occupancy</th>
                    <th>Avg. Distance</th>
                </tr>
            </thead>
            <tbody>
'''
            for hb in hbonds[:20]:
                direction_badge = 'badge-blue' if hb.get('direction', '') == 'protein→ligand' else 'badge-red'
                html += f'''
                <tr>
                    <td>{hb.get('donor', '')}</td>
                    <td>{hb.get('acceptor', '')}</td>
                    <td><span class="badge {direction_badge}">{hb.get('direction', '')}</span></td>
                    <td>{hb.get('occupancy', 0):.1f}%</td>
                    <td>{hb.get('meanDistance', 0):.2f} Å</td>
                </tr>
'''
            html += '''
            </tbody>
        </table>
'''
        html += '''
    </div>
'''

    html += '''
</body>
</html>
'''

    report_path = os.path.join(output_dir, 'md_analysis_report.html')
    with open(report_path, 'w') as f:
        f.write(html)

    return report_path


def main():
    parser = argparse.ArgumentParser(description='Generate MD analysis report')
    parser.add_argument('--topology', required=True, help='Topology file (PDB)')
    parser.add_argument('--trajectory', required=True, help='Trajectory file (DCD)')
    parser.add_argument('--output_dir', required=True, help='Output directory')
    parser.add_argument('--rmsd', action='store_true', help='Include RMSD analysis')
    parser.add_argument('--rmsf', action='store_true', help='Include RMSF analysis')
    parser.add_argument('--hbonds', action='store_true', help='Include H-bond analysis')
    parser.add_argument('--contacts', action='store_true', help='Include contact analysis')
    args = parser.parse_args()

    # Default to all analyses if none specified
    if not (args.rmsd or args.rmsf or args.hbonds or args.contacts):
        args.rmsd = True
        args.rmsf = True
        args.hbonds = True

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    # Get the directory containing this script
    script_dir = os.path.dirname(os.path.abspath(__file__))

    results = {}
    python_exe = sys.executable

    # Run RMSD analysis
    if args.rmsd:
        print("=== Running RMSD Analysis ===")
        rmsd_dir = os.path.join(args.output_dir, 'rmsd')
        os.makedirs(rmsd_dir, exist_ok=True)

        cmd = [
            python_exe, os.path.join(script_dir, 'analyze_rmsd.py'),
            '--topology', args.topology,
            '--trajectory', args.trajectory,
            '--output_dir', rmsd_dir,
        ]
        try:
            subprocess.run(cmd, check=True)
            results_file = os.path.join(rmsd_dir, 'rmsd_results.json')
            if os.path.exists(results_file):
                with open(results_file) as f:
                    results['rmsd'] = json.load(f)
        except subprocess.CalledProcessError as e:
            print(f"Warning: RMSD analysis failed (exit code {e.returncode}), skipping", file=sys.stderr)

    # Run RMSF analysis
    if args.rmsf:
        print("\n=== Running RMSF Analysis ===")
        rmsf_dir = os.path.join(args.output_dir, 'rmsf')
        os.makedirs(rmsf_dir, exist_ok=True)

        cmd = [
            python_exe, os.path.join(script_dir, 'analyze_rmsf.py'),
            '--topology', args.topology,
            '--trajectory', args.trajectory,
            '--output_dir', rmsf_dir,
        ]
        try:
            subprocess.run(cmd, check=True)
            results_file = os.path.join(rmsf_dir, 'rmsf_results.json')
            if os.path.exists(results_file):
                with open(results_file) as f:
                    results['rmsf'] = json.load(f)
        except subprocess.CalledProcessError as e:
            print(f"Warning: RMSF analysis failed (exit code {e.returncode}), skipping", file=sys.stderr)

    # Run H-bond analysis
    if args.hbonds:
        print("\n=== Running H-bond Analysis ===")
        hbonds_dir = os.path.join(args.output_dir, 'hbonds')
        os.makedirs(hbonds_dir, exist_ok=True)

        cmd = [
            python_exe, os.path.join(script_dir, 'analyze_hbonds.py'),
            '--topology', args.topology,
            '--trajectory', args.trajectory,
            '--output_dir', hbonds_dir,
        ]
        try:
            subprocess.run(cmd, check=True)
            results_file = os.path.join(hbonds_dir, 'hbonds_results.json')
            if os.path.exists(results_file):
                with open(results_file) as f:
                    results['hbonds'] = json.load(f)
        except subprocess.CalledProcessError as e:
            print(f"Warning: H-bond analysis failed (exit code {e.returncode}), skipping", file=sys.stderr)

    # Generate HTML report
    print("\n=== Generating Report ===")
    report_path = generate_html_report(args.output_dir, results)
    print(f"Report saved to: {report_path}")

    print("\nDone!")


if __name__ == '__main__':
    main()
