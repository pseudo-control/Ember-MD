# OpenSBDD Environment Setup

This document describes the Python environments and system dependencies needed to run OpenSBDD. The exported environment files in this directory can be used to recreate the environments on a new machine.

## Environment Files

| File | Description |
|------|-------------|
| `fraggen-environment.yml` | Conda environment spec (platform-independent, no builds) |
| `fraggen-conda-export.txt` | Conda explicit export (Linux x86_64 specific) |
| `fraggen-pip-freeze.txt` | pip freeze output (for cross-reference) |
| `surface_gen-environment.yml` | Surface generation env (Python 3.6, legacy) |

## Environment 1: fraggen (Python 3.10)

**Purpose**: Main environment for all pipeline scripts — molecule generation (PyTorch), docking (GNINA integration), MD simulation (OpenMM), analysis (MDAnalysis), and chemistry (RDKit).

### Core Packages

| Package | Version | Purpose |
|---------|---------|---------|
| python | 3.10 | Runtime |
| pytorch | 2.7.1+cu118 | FragGen neural generation |
| torch-geometric | 2.7.0 | Graph neural networks for FragGen |
| torch-cluster | 1.6.3 | Geometric deep learning |
| torch-scatter | 2.1.2 | Sparse operations |
| torch-sparse | 0.6.18 | Sparse tensor support |
| openmm | 8.4 | Molecular dynamics engine |
| openmmforcefields | 0.14.2 | AMBER ff19SB, OPC water, ion params |
| openff-toolkit | latest | OpenFF Sage 2.0 ligand parameterization |
| pdbfixer | latest | PDB structure repair + hydrogen addition |
| rdkit | latest | Cheminformatics (SMILES, 3D generation, properties) |
| mdanalysis | 2.7.0 | Trajectory analysis (RMSD, RMSF, H-bonds) |
| biopython | 1.86 | CORDIAL rescoring (PDB parsing) |
| scikit-learn | 1.7.2 | Trajectory clustering |
| dimorphite_dl | 2.0.2 | Protonation state enumeration |
| ambertools | 23.6 | AMBER force field support |

### Recreating on Linux (x86_64)

```bash
# Option A: From environment.yml (recommended)
conda env create -f deps/fraggen-environment.yml

# Option B: Manual setup (if yml has platform issues)
conda create -n fraggen python=3.10
conda activate fraggen
conda install -c conda-forge openmm openmmforcefields openff-toolkit pdbfixer rdkit
conda install -c conda-forge mdanalysis scikit-learn biopython
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install torch-geometric torch-cluster torch-scatter torch-sparse torch-spline-conv
pip install dimorphite_dl easydict
```

### Recreating on macOS (ARM64 / Apple Silicon)

```bash
conda create -n fraggen python=3.10
conda activate fraggen

# OpenMM + force fields (CPU + OpenCL on Mac)
conda install -c conda-forge openmm openmmforcefields openff-toolkit pdbfixer rdkit

# Analysis tools
conda install -c conda-forge mdanalysis scikit-learn biopython

# PyTorch (MPS backend for Apple Silicon GPU - used by FragGen)
pip install torch torchvision torchaudio

# PyTorch Geometric (CPU-only on Mac - no CUDA)
pip install torch-geometric
pip install torch-cluster torch-scatter torch-sparse torch-spline-conv

# Protonation enumeration
pip install dimorphite_dl easydict
```

**macOS Notes:**
- torch-cluster does NOT support MPS — FragGen auto-falls back to CPU
- OpenMM uses CPU or OpenCL (no CUDA, no Metal)
- GNINA is Linux-only — docking mode unavailable on macOS
- All other features (MD, viewer, analysis) work on macOS

## Environment 2: surface_gen (Python 3.6)

**Purpose**: Legacy environment for `generate_pocket_surface.py` (PLY mesh generation from PDB pocket). Uses PyMesh which requires Python 3.6.

### Core Packages

| Package | Version | Purpose |
|---------|---------|---------|
| python | 3.6 | Runtime (EOL but required by PyMesh) |
| pymesh2 | 0.3 | Mesh operations for surface generation |
| biopython | 1.79 | PDB parsing |
| scipy | 1.5.4 | Scientific computing |
| numpy | 1.19.5 | Array operations |

### Recreating

```bash
# Linux
conda create -n surface_gen python=3.6
conda activate surface_gen
pip install pymesh2 biopython scipy numpy matplotlib plyfile

# macOS - PyMesh may need to be built from source on ARM64
# Alternative: port surface generation to use trimesh (Python 3.10 compatible)
```

**Note:** This environment is only used by FragGen mode (surface generation step). It is NOT needed for GNINA docking, MD simulation, or the 3D viewer.

## System Dependencies

### Ubuntu/Debian
```bash
sudo apt-get install -y libopenbabel7 openbabel
# Optional: NVIDIA drivers + CUDA for GPU acceleration
```

### macOS
```bash
brew install open-babel
# No CUDA — GPU via OpenCL (Intel Macs) or CPU-only (Apple Silicon)
```

## GNINA Binary

- **Linux**: Auto-downloaded to `~/.fraggen/bin/gnina` on first use
- **macOS**: Not available (Linux x86_64 binary only)
- **Source**: https://github.com/gnina/gnina (can be built from source for macOS)

## Directory Structure (Bundled Installation)

```
/opt/opensbdd/
├── app/              # Electron app + node_modules
├── scripts/          # Python pipeline scripts
├── models/           # Neural network weights + fragment data
├── python310/        # fraggen conda environment
├── python36/         # surface_gen conda environment
├── gnina             # GNINA docking binary
├── openbabel/        # OpenBabel binaries + libs
├── cordial/          # CORDIAL rescoring (optional)
└── bin/opensbdd      # Launcher script
```
