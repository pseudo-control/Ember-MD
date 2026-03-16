#!/bin/bash
set -e

# OpenSBDD Dependency Bundler
# Copies all dependencies into staging/ for packaging test

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STAGING_DIR="$SCRIPT_DIR/staging"

# Source paths
source "$SCRIPT_DIR/paths.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
USE_CONDA_PACK=false
SKIP_CONDA=false
for arg in "$@"; do
    case $arg in
        --pack) USE_CONDA_PACK=true ;;
        --skip-conda) SKIP_CONDA=true ;;
        --help)
            echo "Usage: ./bundle.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --pack        Use conda-pack for relocatable envs (slower, smaller)"
            echo "  --skip-conda  Skip conda envs (for quick testing)"
            echo "  --help        Show this help"
            exit 0
            ;;
    esac
done

echo "=========================================="
echo "  OpenSBDD Dependency Bundler"
echo "=========================================="
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if [ ! -d "$FRAGGEN_ROOT" ]; then
    log_error "FragGen repo not found at $FRAGGEN_ROOT"
    exit 1
fi

if [ ! -f "$GNINA_PATH" ]; then
    log_error "GNINA not found at $GNINA_PATH"
    exit 1
fi

if [ ! -d "$FRAGGEN_CONDA_ENV" ]; then
    log_error "fraggen conda env not found at $FRAGGEN_CONDA_ENV"
    exit 1
fi

# Clean and create staging directory
log_info "Creating staging directory..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"/{bin,app,scripts,models}

# 1. Copy Electron app
log_info "Building and copying Electron app..."
cd "$PROJECT_ROOT"
npm run build:electron 2>/dev/null || log_warn "build:electron had warnings"
npm run build 2>/dev/null || log_warn "build had warnings"

cp -r "$PROJECT_ROOT/dist-webpack" "$STAGING_DIR/app/"
cp -r "$PROJECT_ROOT/electron-dist" "$STAGING_DIR/app/"
cp "$PROJECT_ROOT/package.json" "$STAGING_DIR/app/"
cp "$PROJECT_ROOT/package-lock.json" "$STAGING_DIR/app/"

# Install production deps only
log_info "Installing production node_modules..."
cd "$STAGING_DIR/app"
npm install --omit=dev --silent 2>/dev/null

# Install electron (it's in devDeps but needed for runtime)
log_info "Installing Electron runtime..."
npm install electron --save-prod --silent 2>/dev/null

# 2. Copy FragGen scripts
log_info "Copying FragGen scripts..."
cd "$FRAGGEN_ROOT"
cp *.py "$STAGING_DIR/scripts/" 2>/dev/null || true
cp -r configs "$STAGING_DIR/scripts/"

# 3. Copy model weights and data
log_info "Copying model weights..."
cp -r "$FRAGGEN_ROOT/ckpt" "$STAGING_DIR/models/"
mkdir -p "$STAGING_DIR/models/data"
cp "$FRAGGEN_ROOT/data/fragment_base.pkl" "$STAGING_DIR/models/data/"

# 4. Copy GNINA
log_info "Copying GNINA binary..."
cp "$GNINA_PATH" "$STAGING_DIR/gnina"
chmod +x "$STAGING_DIR/gnina"

# 5. Copy OpenBabel (system libs)
log_info "Copying OpenBabel..."
mkdir -p "$STAGING_DIR/openbabel"/{bin,lib,share}
cp /usr/bin/obabel "$STAGING_DIR/openbabel/bin/"
# Copy shared libraries
for lib in /usr/lib/x86_64-linux-gnu/libopenbabel.so*; do
    if [ -f "$lib" ]; then
        cp "$lib" "$STAGING_DIR/openbabel/lib/"
    fi
done
# Copy data files if they exist
if [ -d "/usr/share/openbabel" ]; then
    cp -r /usr/share/openbabel/* "$STAGING_DIR/openbabel/share/"
fi

# 6. Handle conda environments
if [ "$SKIP_CONDA" = true ]; then
    log_warn "Skipping conda environments (--skip-conda)"
    echo "SKIPPED" > "$STAGING_DIR/python310.SKIPPED"
    echo "SKIPPED" > "$STAGING_DIR/python36.SKIPPED"
elif [ "$USE_CONDA_PACK" = true ]; then
    # Use conda-pack for relocatable environments
    log_info "Packing conda environments with conda-pack..."

    if ! command -v conda-pack &> /dev/null; then
        log_error "conda-pack not installed. Run: conda install conda-pack"
        exit 1
    fi

    log_info "Packing fraggen env (this takes a while)..."
    conda pack -n fraggen -o "$STAGING_DIR/python310.tar.gz" --ignore-missing-files

    log_info "Packing surface_gen env..."
    conda pack -n surface_gen -o "$STAGING_DIR/python36.tar.gz" --ignore-missing-files

    log_info "Conda envs packed as tarballs (unpack on install)"
else
    # Direct copy (faster but not relocatable without fixes)
    log_info "Copying conda environments directly..."
    log_warn "Direct copy may have path issues. Use --pack for production."

    log_info "Copying fraggen env (~8.7 GB)..."
    cp -r "$FRAGGEN_CONDA_ENV" "$STAGING_DIR/python310"

    log_info "Copying surface_gen env (~1 GB)..."
    cp -r "$SURFACE_GEN_CONDA_ENV" "$STAGING_DIR/python36"
fi

# 7. Copy CORDIAL if available
if [ -n "$CORDIAL_ROOT" ] && [ -d "$CORDIAL_ROOT" ]; then
    log_info "Copying CORDIAL..."
    cp -r "$CORDIAL_ROOT" "$STAGING_DIR/cordial"
else
    log_warn "CORDIAL not found, skipping"
fi

# 8. Create launcher script
log_info "Creating launcher script..."
cat > "$STAGING_DIR/bin/fraggen" << 'LAUNCHER'
#!/bin/bash
# OpenSBDD Launcher

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Set up environment (var names must match electron/main.ts expectations)
export FRAGGEN_ROOT="$INSTALL_DIR/scripts"
export FRAGGEN_PYTHON="$INSTALL_DIR/python310/bin/python"
export FRAGGEN_SURFACE_PYTHON="$INSTALL_DIR/python36/bin/python"
export FRAGGEN_GNINA="$INSTALL_DIR/gnina"

# OpenBabel
export LD_LIBRARY_PATH="$INSTALL_DIR/openbabel/lib:$LD_LIBRARY_PATH"
export PATH="$INSTALL_DIR/openbabel/bin:$PATH"
if [ -d "$INSTALL_DIR/openbabel/share" ]; then
    export BABEL_DATADIR="$INSTALL_DIR/openbabel/share"
fi

# CORDIAL (if bundled)
if [ -d "$INSTALL_DIR/cordial" ]; then
    export CORDIAL_ROOT="$INSTALL_DIR/cordial"
fi

# Model paths
export FRAGGEN_MODELS="$INSTALL_DIR/models"

# Launch Electron
# Note: --no-sandbox needed for portable installs (sandbox requires root-owned binary)
cd "$INSTALL_DIR/app"
exec ./node_modules/.bin/electron . --no-sandbox "$@"
LAUNCHER
chmod +x "$STAGING_DIR/bin/fraggen"

# Calculate sizes
log_info "Calculating bundle size..."
TOTAL_SIZE=$(du -sh "$STAGING_DIR" | cut -f1)

echo ""
echo "=========================================="
echo "  Bundle Complete!"
echo "=========================================="
echo ""
echo "Location: $STAGING_DIR"
echo "Size: $TOTAL_SIZE"
echo ""
echo "Contents:"
du -sh "$STAGING_DIR"/* 2>/dev/null | sort -hr
echo ""
echo "To test: $STAGING_DIR/bin/fraggen"
echo ""
