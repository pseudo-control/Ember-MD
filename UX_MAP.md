# FragGen GUI - UX Map

## Overview

FragGen GUI is a **four-mode** pipeline for structure-based drug design:

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   FragGen   │ ───> │    GNINA    │ ───> │     MD      │      │   Viewer    │
│  Generation │      │   Docking   │      │  Simulation │      │  (NGL 3D)   │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
     │                     │                    │                    │
     ▼                     ▼                    ▼                    ▼
 results.csv          *_docked.sdf.gz      trajectory.dcd       Static PDB
 SDF/*.sdf            receptor_prepared    system.pdb           visualization
```

**FragGen → GNINA → MD** form a sequential pipeline.
**Viewer** is standalone for visualizing any PDB structure.

Each pipeline mode has 4 steps: **Load → Configure → Progress → Results**

---

## Mode 1: FragGen (Molecule Generation)

Generates novel drug-like molecules that fit a protein binding pocket.

### Step 1: Upload
| | |
|---|---|
| **Input** | PDB file (protein-ligand complex) |
| **Output** | PDB path stored in state |

### Step 2: Configure
| | |
|---|---|
| **Inputs** | Job name, Output folder |
| **Outputs** | SamplingConfig in state |

**Parameters:**
| Parameter | Range | Default | Notes |
|-----------|-------|---------|-------|
| Model | `dihedral` / `cartesian` / `geomopt` | `dihedral` | |
| Device | `cpu` / `mps` / `cuda` | auto-detect | |
| Pocket radius | 5-20 Å | 10 | |
| Num samples | 10-500 | 500 | |
| Beam size | 50-1000 | 500 | |
| Max steps | 10-100 | 50 | |
| Diversity | 1-10 | 2 | queue_same_smi_tolerance |
| Seed | any int | 2020 | |

*Thresholds (advanced):* focal, pos, element thresholds for current/next step

### Step 3: Progress
| | |
|---|---|
| **Phases** | prep → surface → generation → thumbnails |
| **Output** | Real-time logs, molecule count |

### Step 4: Results
| | |
|---|---|
| **Outputs** | `SDF/*.sdf`, `results.csv`, `thumbnails/*.png` |
| **Actions** | Paginated grid (32/page), Open folder |
| **Pipelines to** | GNINA Step 1 (via results.csv) |

---

## Mode 2: GNINA (Molecular Docking)

Docks generated molecules into the binding site and scores binding affinity.

### Step 1: Load
| | |
|---|---|
| **Inputs** | FragGen `results.csv`, Receptor PDB (with ligand), Reference ligand selection |
| **Outputs** | Filtered molecules, `receptor_prepared.pdb`, `reference_ligand.pdb` |

**Receptor PDB Requirements:**
- Can be raw PDB from RCSB, prepared structure, or previously docked structure
- Must contain at least one ligand (HETATM with ≥5 atoms)
- Auto-excludes water, ions, buffers (HOH, NA, CL, SO4, GOL, etc.)
- User selects which ligand defines the binding site (autobox)

**Ligand Format:**
- Input molecules must be in **SDF format** (from FragGen's `SDF/*.sdf`)
- Output docked poses are `*_docked.sdf.gz` (gzipped SDF with scores)

**Parameters:**
| Parameter | Range | Default | Notes |
|-----------|-------|---------|-------|
| QED threshold | 0-1 | 0.5 | Filter molecules by drug-likeness |

### Step 2: Configure
| | |
|---|---|
| **Inputs** | Job name, Output directory |
| **Outputs** | GninaDockingConfig in state |

**Parameters:**
| Parameter | Range | Default | Notes |
|-----------|-------|---------|-------|
| Exhaustiveness | 1-32 | 8 | Search thoroughness |
| Num poses | 1-20 | 9 | Poses per ligand |
| Autobox margin | 2-8 Å | 4 | Box padding around reference |
| Parallel threads | 1-CPU count | CPU count | Concurrent docking jobs |

*Fixed:* GNINA binary at `~/.fraggen/bin/gnina`, Linux-only

### Step 3: Progress
| | |
|---|---|
| **Output** | Real-time logs, molecule progress (X/Y) |

*Fixed:* Sequential docking with `--cpu 1` per molecule, staggered start

### Step 4: Results
| | |
|---|---|
| **Outputs** | `*_docked.sdf.gz`, `gnina_results_best.csv`, `gnina_results_all.csv` |
| **Actions** | Sort by column, pagination, export CSV, export complex PDB |
| **Pipelines to** | MD Step 1 (via output directory) |

**Score columns:**
- CNNscore (0-1, higher = better)
- CNNaffinity (kcal/mol, more negative = better)
- VinaAffinity (kcal/mol)

---

## Mode 3: MD (Molecular Dynamics)

Runs molecular dynamics simulation of the protein-ligand complex using OpenMM.

### Step 1: Load
| | |
|---|---|
| **Input** | GNINA output directory |
| **Outputs** | `receptorPdb`, `ligandSdf`, `ligandName` in state |

**UI Layout:**
- Directory picker → loads `receptor_prepared.pdb` + all `*_docked.sdf.gz`
- Left panel: Ligand table (Name, CNN Score, CNN Affinity, QED) sorted by score
- Right panel: 2D structure preview + selected ligand details
- Single-select via radio buttons

### Step 2: Configure
| | |
|---|---|
| **Inputs** | Job name, Output directory |
| **Outputs** | MDConfig in state, optional benchmark results |

**Parameters:**
| Parameter | Range | Default | Notes |
|-----------|-------|---------|-------|
| Production duration | 1-100+ ns | 10 | Simulation length |

**Benchmark button:** Estimates ns/day, shows atom count and box volume

*Fixed parameters (read-only display):*
| Parameter | Value |
|-----------|-------|
| Temperature | 300 K |
| Salt | 150 mM NaCl |
| Box shape | Rhombic dodecahedron |
| Padding | 1.2 nm |
| Timestep | 4 fs (HMR enabled) |
| Force fields | ff14SB + OpenFF Sage 2.0 + TIP3P |
| Equilibration | ~170 ps (AMBER-style protocol) |

### Step 3: Progress
| | |
|---|---|
| **Stages** | building → min_restrained → heating → npt_restrained → release → equilibration → production |
| **Output** | Stage progress %, system info, logs |

**Equilibration Protocol (AMBER-style):**
1. Energy minimization (5000 iterations)
2. NVT heating: 10K → 100K (~20ps) - establishes kinetic energy
3. NPT heating: 100K → 300K (~50ps) - barostat added at 100K
4. NPT equilibration: 300K (~100ps) - density stabilization

### Step 4: Results
| | |
|---|---|
| **Outputs** | See "MD Output Files" below |
| **Pipelines to** | External visualization (VMD/PyMOL/ChimeraX) |

---

## MD Output Files

| File | Format | Description | Viewing Tools |
|------|--------|-------------|---------------|
| `system.pdb` | PDB | Solvated system (protein + ligand + water + ions) | VMD, PyMOL, ChimeraX, FragGen Viewer |
| `equilibrated.pdb` | PDB | Post-equilibration snapshot | VMD, PyMOL, ChimeraX, FragGen Viewer |
| `trajectory.dcd` | DCD | Production trajectory (frames every 10ps) | VMD, ChimeraX |
| `final.pdb` | PDB | Final frame of production | VMD, PyMOL, ChimeraX, FragGen Viewer |
| `energy.csv` | CSV | Time series: step, time, PE, KE, temp, volume | Excel, Python, R |

**Note on formats:**
- DCD is CHARMM/NAMD format, widely supported
- AMBER users typically use NetCDF (.nc) - future enhancement
- PDB files can be viewed in FragGen's built-in Viewer mode
- Trajectory playback requires external tools (VMD recommended)

**Typical AMBER output comparison:**
| Our Output | AMBER Equivalent | Notes |
|------------|------------------|-------|
| `system.pdb` | `.inpcrd` + `.prmtop` | We use PDB; AMBER uses separate topology/coords |
| `trajectory.dcd` | `.nc` (NetCDF) | DCD is equally capable, different ecosystem |
| `energy.csv` | `.mdout` | Our CSV is easier to parse programmatically |
| `equilibrated.pdb` | `.ncrst` | AMBER restart includes velocities |

---

## Mode 4: Viewer (NGL Molecular Viewer)

Standalone 3D visualization of PDB structures with ligand detection.

### Features
| Feature | Description |
|---------|-------------|
| **Load PDB** | Any PDB file (raw, prepared, or docked) |
| **Auto-detect ligands** | Finds HETATM groups ≥5 atoms (excludes water/ions) |
| **External SDF** | Import ligand from separate SDF file |
| **Protein styling** | Cartoon, ribbon, spacefill + surface options |
| **Surface coloring** | Hydrophobicity, electrostatic, chain, position |
| **Ligand styling** | Ball+stick, stick, spacefill + surface options |
| **Pocket residues** | Show protein sidechains within 5Å of ligand |
| **Residue labels** | Single-letter codes (e.g., F2108) |
| **Interactions** | H-bonds, hydrophobic, ionic, halogen, pi-stacking |
| **Carbon colors** | Customizable for protein and ligand separately |
| **Polar H only** | Show only hydrogens bonded to N/O/S |
| **Export PDB** | Save current view as PDB file |

### Limitations
- **Static structures only** - no trajectory playback
- For MD trajectories, use VMD, PyMOL, or ChimeraX

---

## Cross-Mode Data Flow

```
FragGen                      GNINA                         MD
────────────────────────────────────────────────────────────────────

[Upload PDB]
     │
     ▼
[Configure]
     │
     ▼
[Generate] ──────────────────┐
     │                       │
     ▼                       ▼
results.csv ────────────> [Load CSV]
SDF/*.sdf (ligands)          │
thumbnails/*.png             ▼
                        [Select Receptor PDB]
                        [Select Reference Ligand]
                             │
                             ▼
                        [Configure Docking]
                             │
                             ▼
                        [Dock] ──────────────────┐
                             │                   │
                             ▼                   ▼
                        *_docked.sdf.gz ───> [Load Directory]
                        receptor_prepared.pdb    │
                        gnina_results_*.csv      ▼
                                            [Select Ligand from Table]
                                                 │
                                                 ▼
                                            [Configure MD]
                                                 │
                                                 ▼
                                            [Simulate]
                                                 │
                                                 ▼
                                            trajectory.dcd ──> VMD/ChimeraX
                                            system.pdb
                                            final.pdb ──────> Viewer Mode
                                            energy.csv ─────> Analysis
```

---

## File Structure

```
<output_dir>/
└── <job_name>/
    ├── pocket.pdb              # Extracted pocket
    ├── ligand.pdb              # Extracted ligand
    ├── surface.ply             # Pocket surface mesh
    ├── runtime_config.yml      # Generation config
    ├── run_parameters.json     # Full parameter log
    ├── results.csv             # SMILES + properties
    ├── ligand/
    │   └── SDF/
    │       ├── 1.sdf           # Generated molecules
    │       ├── 2.sdf
    │       └── ...
    ├── thumbnails/
    │   ├── 1.png               # 2D structure images
    │   └── ...
    └── gnina/
        └── <gnina_job>/
            ├── receptor_prepared.pdb  # Receptor for MD
            ├── reference_ligand.pdb   # Autobox reference
            ├── ligands.json           # Input ligand list
            ├── gnina_results_best.csv # Best pose per ligand
            ├── gnina_results_all.csv  # All poses
            ├── 1_docked.sdf.gz        # Docked poses
            ├── 2_docked.sdf.gz
            └── ...
            └── md/
                └── <md_job>/
                    ├── system.pdb         # Solvated system
                    ├── equilibrated.pdb   # Post-equilibration
                    ├── trajectory.dcd     # Production trajectory
                    ├── final.pdb          # Final frame
                    └── energy.csv         # Energy timeseries
```

---

## Viewing MD Results

### Built-in Viewer (Static)
- Load `system.pdb`, `equilibrated.pdb`, or `final.pdb`
- View protein-ligand complex with styling options
- Cannot play back trajectory

### VMD (Recommended for Trajectories)
```bash
# Load topology and trajectory
vmd system.pdb trajectory.dcd
```

### ChimeraX
```bash
# Open structure, then open trajectory
chimerax system.pdb
# In ChimeraX: open trajectory.dcd
```

### PyMOL
```bash
# Load PDB first
pymol system.pdb
# Then load trajectory (may need plugin for DCD)
```

### Python Analysis with MDAnalysis
```python
import MDAnalysis as mda
from MDAnalysis.analysis import rms, distances

# Load trajectory
u = mda.Universe('system.pdb', 'trajectory.dcd')

# RMSD of protein backbone over time
protein = u.select_atoms('protein and backbone')
R = rms.RMSD(protein, protein, select='backbone')
R.run()
print(R.results.rmsd)  # Time series of RMSD values

# RMSD of ligand (assuming residue name LIG)
ligand = u.select_atoms('resname LIG')
R_lig = rms.RMSD(ligand, ligand)
R_lig.run()

# Iterate frames for custom analysis
for ts in u.trajectory:
    positions = u.atoms.positions
    # Calculate distances, contacts, etc.
```

### Python Analysis with MDTraj
```python
import mdtraj as md

# Load trajectory
traj = md.load('trajectory.dcd', top='system.pdb')

# RMSD to first frame
rmsd = md.rmsd(traj, traj, frame=0)

# Compute secondary structure
dssp = md.compute_dssp(traj)

# Compute hydrogen bonds
hbonds = md.baker_hubbard(traj)
```

### Recommended Analysis Tools

| Tool | Best For | Install |
|------|----------|---------|
| [MDAnalysis](https://www.mdanalysis.org/) | General analysis, RMSD, contacts | `pip install MDAnalysis` |
| [MDTraj](https://www.mdtraj.org/) | Fast I/O, DSSP, H-bonds | `pip install mdtraj` |
| [OpenMMDL](https://github.com/wolberlab/OpenMMDL) | Protein-ligand interaction analysis | `pip install openmmdl` |
| [ProLIF](https://prolif.readthedocs.io/) | Protein-ligand fingerprints | `pip install prolif` |

### Common Analyses for Drug Discovery

1. **Ligand RMSD** - Does the ligand stay in the binding pose?
2. **Protein-Ligand Contacts** - Which residues interact with the ligand?
3. **Binding Site RMSF** - How flexible is the binding pocket?
4. **Hydrogen Bond Occupancy** - How stable are key H-bonds?
5. **MM-PBSA/GBSA** - Estimate binding free energy (use `gmx_MMPBSA`)

---

## Future: Trajectory Playback in Viewer

NGL Viewer supports trajectory playback via `TrajectoryPlayer`. Potential future enhancement:

```javascript
// NGL trajectory loading (not yet implemented)
stage.loadFile('system.pdb').then(o => {
  o.addTrajectory('trajectory.dcd');
  const player = new NGL.TrajectoryPlayer(o.trajList[0], {
    step: 1,
    timeout: 50,
    mode: 'loop'
  });
  player.play();
});
```

For now, use VMD or ChimeraX for trajectory visualization.
