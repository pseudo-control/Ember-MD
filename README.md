# FragGen GUI

Desktop application for structure-based drug design using FragGen.

## Prerequisites

- Linux (Ubuntu 22.04+) or macOS
- NVIDIA GPU with CUDA support (recommended) or CPU
- ~10GB disk space for conda environment + models
- Node.js 18+ and npm

## Quick Setup (Ubuntu/Linux)

### 1. Install Miniconda

```bash
# Download and install Miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
eval "$($HOME/miniconda3/bin/conda shell.bash hook)"
conda init bash
source ~/.bashrc
```

### 2. Create FragGen Environment

```bash
# Create environment with Python 3.10
conda create -n fraggen python=3.10 -y
conda activate fraggen

# Install PyTorch with CUDA support (adjust cuda version as needed)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install PyTorch Geometric
pip install torch_geometric
pip install pyg_lib torch_scatter torch_sparse torch_cluster torch_spline_conv -f https://data.pyg.org/whl/torch-2.1.0+cu118.html

# Install other dependencies
pip install rdkit biopython numpy tqdm easydict pyyaml
```

### 3. Clone FragGen

```bash
mkdir -p ~/FragGen
cd ~
git clone https://github.com/HaotianZhangAI4Science/FragGen.git
cd FragGen

# Download model weights (check FragGen repo for latest instructions)
# Models go in: ./ckpt/
```

### 4. Install GUI Dependencies

```bash
cd /path/to/FragGen-GUI
npm install
```

### 5. Configure Paths (Optional)

The app auto-detects paths. If needed, set environment variables:

```bash
export FRAGGEN_ROOT="$HOME/FragGen"
export FRAGGEN_PYTHON="$HOME/miniconda3/envs/fraggen/bin/python"
```

Or the app will look for FragGen in these locations:
- `~/FragGen`
- `~/fraggen`
- `~/fraggen_workspace/FragGen`
- `/opt/FragGen`

## Running

```bash
npm start
```

## Usage

1. **Upload** - Select a PDB file containing a protein-ligand complex
2. **Configure** - Choose model variant, device (cuda/cpu), and sampling parameters
3. **Generate** - Wait for FragGen to generate molecules
4. **Results** - View generated molecules and open output folder

## Output

Each run creates a folder `fraggen_<pdbname>/` containing:
- `pocket.pdb` - Extracted binding pocket
- `ligand.pdb` - Extracted reference ligand
- `pocket_surface.ply` - Pocket surface mesh
- `output/` - Generated molecules
  - `<ligand>/SDF/` - Individual molecule SDF files
  - `runtime_config.yml` - Parameters used for generation
  - `run_parameters.json` - Full run log

## Troubleshooting

### "Python not found"
- Ensure conda environment exists: `conda activate fraggen && which python`
- Set `FRAGGEN_PYTHON` environment variable to your Python path

### "FragGen script not found"
- Verify FragGen is cloned to `~/FragGen` or set `FRAGGEN_ROOT`

### CUDA not detected
- Ensure NVIDIA drivers are installed: `nvidia-smi`
- Ensure PyTorch has CUDA support: `python -c "import torch; print(torch.cuda.is_available())"`

## Development

```bash
npm run build:electron  # Compile TypeScript
npm run build           # Build frontend
npm start               # Run app
```

## Building Packages

```bash
# Linux AppImage/deb
npm run pack:linux

# macOS DMG
npm run pack:mac
```

## Tech Stack

- **Frontend**: SolidJS + Tailwind CSS + DaisyUI
- **Backend**: Electron + TypeScript
- **ML**: FragGen (PyTorch + PyG)
