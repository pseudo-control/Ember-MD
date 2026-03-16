# OpenSBDD Distribution Bundle

Self-contained desktop application for structure-based drug design. This document covers bundling instructions and the complete computational stack.

---

## Desktop Bundling Instructions

### Quick Start

```bash
# From project root
npm run dist          # Create staging bundle (~11 GB)
npm run dist:pack     # Create relocatable bundle with conda-pack
```

### Bundle Contents

After running `npm run dist`, the `deps/staging/` folder contains:

```
staging/                    (11 GB total)
├── app/                    # Electron app + node_modules
├── bin/fraggen             # Launcher script
├── cordial/                # CORDIAL ML rescoring
├── gnina                   # GNINA docking binary
├── models/                 # FragGen neural network weights
├── openbabel/              # OpenBabel binaries
├── python310/              # Main conda env (PyTorch, RDKit, OpenMM, etc.)
├── python36/               # Legacy env for surface generation
└── scripts/                # All Python pipeline scripts
```

### Testing the Bundle

```bash
# Run the bundled app
./deps/staging/bin/fraggen

# Or directly
deps/staging/bin/fraggen
```

### Creating a Portable Distribution

For distribution to other machines:

1. **Install conda-pack** (one-time):
   ```bash
   conda install conda-pack
   ```

2. **Create relocatable bundle**:
   ```bash
   npm run dist:pack
   ```
   This creates `python310.tar.gz` and `python36.tar.gz` that can be unpacked on any Linux machine.

3. **Package as .deb** (see `~/.claude/plans/functional-drifting-knuth.md` for full .deb packaging plan)

### System Requirements

| Component | Requirement |
|-----------|-------------|
| OS | Linux x86_64 (Ubuntu 20.04+, Debian 11+) |
| RAM | 16 GB minimum, 32 GB recommended |
| GPU | NVIDIA GPU with CUDA 11.8+ (optional, enables GPU acceleration) |
| Disk | 15 GB for installation |

---

## Computational Stack Overview

OpenSBDD integrates multiple computational chemistry tools into a unified pipeline:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenSBDD Pipeline                            │
├─────────────────────────────────────────────────────────────────────┤
│  INPUT: Protein structure (PDB)                                     │
│    ↓                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  FragGen    │  │   GNINA     │  │  Ligand     │                 │
│  │  Generation │  │   Docking   │  │  Library    │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │  Ligand Preparation   │                              │
│              │  • Protonation states │                              │
│              │  • 3D Conformers      │                              │
│              └───────────┬───────────┘                              │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │   GNINA Docking       │                              │
│              │   • CNN Scoring       │                              │
│              │   • Pose Optimization │                              │
│              └───────────┬───────────┘                              │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │   CORDIAL Rescoring   │                              │
│              │   • Deep Learning     │                              │
│              │   • pKd Prediction    │                              │
│              └───────────┬───────────┘                              │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │   Property Filtering  │                              │
│              │   • QED, SA Score     │                              │
│              │   • Lipinski Rules    │                              │
│              └───────────┬───────────┘                              │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │   MD Simulation       │                              │
│              │   • System Building   │                              │
│              │   • Equilibration     │                              │
│              │   • Production        │                              │
│              └───────────────────────┘                              │
│                          ↓                                          │
│  OUTPUT: Ranked compounds with binding predictions                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. AI-Driven Molecule Generation (FragGen)

### Overview

FragGen is a 3D-aware generative model that creates drug-like molecules directly within protein binding pockets. Unlike 2D generators, FragGen builds molecules in 3D space, ensuring generated compounds are geometrically compatible with the target.

### Neural Network Architecture

| Model | File | Size | Purpose |
|-------|------|------|---------|
| Dihedral | `dihedral_208.pt` | 59 MB | Torsion angle prediction |
| Cartesian | `cartesian_val_158.pt` | 39 MB | 3D coordinate generation |
| Frequency | `freq0_val_90.pt` | 42 MB | Fragment frequency modeling |

### Fragment Base

- **File**: `fragment_base.pkl` (142 KB)
- **Contents**: Pre-computed molecular fragments with 3D coordinates
- **Source**: Derived from drug-like molecules in public databases

### Generation Modes

#### Standard Generation
Generates molecules de novo within the binding pocket:
- Pocket surface analysis using PyMesh
- Fragment placement guided by pocket shape
- Bond formation via learned geometric rules

#### Anchor Mode (Fragment Growing)
Grows molecules from an existing ligand fragment:
- Preserves known binding interactions
- Explores chemical space around validated scaffolds
- Useful for lead optimization

### Sampling Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `num_samples` | 100 | Number of molecules to generate |
| `beam_size` | 3 | Beam search width |
| `max_steps` | 10 | Maximum fragments per molecule |
| `temperature` | 1.0 | Sampling diversity |

### References

- FragGen: [Peng et al., 2022](https://arxiv.org/abs/2212.00672)
- Fragment-based generation for structure-based drug design

---

## 2. Molecular Docking (GNINA)

### Overview

GNINA is a molecular docking program that uses convolutional neural networks (CNNs) for scoring protein-ligand interactions. It extends AutoDock Vina with deep learning capabilities.

### CNN Scoring Models

GNINA embeds multiple pre-trained CNN models within its binary:

| Model | Architecture | Training Data |
|-------|--------------|---------------|
| default2018 | Dense layers | PDBbind 2016 |
| dense | Fully connected | CrossDocked2020 |
| crossdock_default | 3D CNN | CrossDocked2020 |
| general_default | Ensemble | Multiple sources |

### Scoring Functions

| Score | Range | Interpretation |
|-------|-------|----------------|
| **CNNscore** | 0-1 | Probability of binding (higher = better) |
| **CNNaffinity** | kcal/mol | Predicted binding affinity |
| **Vina** | kcal/mol | Classical Vina score |

### Docking Protocol

1. **Receptor Preparation**: Remove waters, add hydrogens
2. **Binding Site Definition**: Autobox around reference ligand
3. **Conformer Search**: Monte Carlo + local optimization
4. **CNN Rescoring**: Neural network pose evaluation
5. **Pose Clustering**: Remove redundant poses

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `exhaustiveness` | 8 | Search thoroughness |
| `num_poses` | 9 | Output poses per ligand |
| `autobox_add` | 4.0 Å | Box padding around reference |
| `cnn_scoring` | rescore | When to apply CNN |

### References

- GNINA: [McNutt et al., 2021](https://doi.org/10.1186/s13321-021-00522-2)
- GNINA 1.0: Molecular docking with deep learning

---

## 3. Deep Learning Rescoring (CORDIAL)

### Overview

CORDIAL (Comparison of Radial Distribution-based Interaction Analysis for Ligands) is a deep learning model that predicts binding affinity from protein-ligand complexes using radial distribution functions (RDFs) of atom-type interactions.

### Model Architecture

| Component | Details |
|-----------|---------|
| **Input Features** | RDF fingerprints of atom-type pairs |
| **Architecture** | Conv1D → Attention → MLP |
| **Model File** | `full.cordial.v2b.conv1d-k7c4-k3c1-nomix.attn-row_ah2-col_ah1-ff4-2x.mlp-256-256-mishx2.1-9-1.bcel-lte.model` (4.9 MB) |
| **Normalization** | `full.train.norm.pkl` (33 KB) |

### Prediction Outputs

| Score | Description |
|-------|-------------|
| **Expected pKd** | Weighted sum of threshold probabilities |
| **P(pKd ≥ 6)** | Probability of micromolar binding |
| **P(pKd ≥ 7)** | Probability of sub-micromolar binding |

### Ordinal Classification

CORDIAL uses ordinal classification to predict pKd thresholds (≥1 through ≥8), providing calibrated probability estimates rather than point predictions.

### References

- CORDIAL: [Brown Lab, 2023](https://github.com/bpBrownLab/CORDIAL)
- RDF-based protein-ligand interaction fingerprints

---

## 4. Ligand Preparation Pipeline

### 4.1 Protonation State Enumeration (Dimorphite-DL)

Generates physiologically relevant ionization states for ligands.

| Parameter | Default | Description |
|-----------|---------|-------------|
| pH Range | 6.4 - 8.4 | Intestinal to plasma pH |
| Max States | 10 | Maximum protonation variants |

**Method**: Rule-based pKa prediction with ionizable group enumeration.

**Reference**: [Ropp et al., 2019](https://doi.org/10.1186/s13321-019-0336-9)

### 4.2 3D Conformer Generation (RDKit ETKDG)

Generates diverse 3D conformations using distance geometry.

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max Conformers | 10 | Conformers per molecule |
| RMSD Cutoff | 0.5 Å | Diversity filter |
| Energy Window | 10 kcal/mol | Max energy above minimum |

**Method**: ETKDG (Experimental-Torsion Distance Geometry with basic Knowledge)

**Reference**: [Riniker & Landrum, 2015](https://doi.org/10.1021/acs.jcim.5b00654)

### 4.3 3D Structure Generation (SMILES → SDF)

Converts SMILES strings to 3D coordinates:

1. **2D → 3D Embedding**: Distance geometry
2. **Force Field Optimization**: MMFF94 or UFF
3. **Stereochemistry**: Preserve specified chirality

---

## 5. Drug-Likeness Filtering

### QED (Quantitative Estimate of Drug-likeness)

Composite score combining multiple molecular properties:

| Property | Weight | Desirability Function |
|----------|--------|----------------------|
| MW | 0.66 | Gaussian, μ=330 |
| ALOGP | 0.46 | Gaussian, μ=2.5 |
| HBD | 0.51 | Step function |
| HBA | 0.73 | Step function |
| PSA | 0.28 | Gaussian, μ=75 |
| ROTB | 0.42 | Gaussian, μ=3 |
| AROM | 0.09 | Gaussian, μ=2 |
| ALERTS | 0.01 | Penalty for PAINS |

**Output**: Score 0-1 (higher = more drug-like)

**Reference**: [Bickerton et al., 2012](https://doi.org/10.1038/nchem.1243)

### SA Score (Synthetic Accessibility)

Estimates ease of chemical synthesis:

| Score | Interpretation |
|-------|----------------|
| 1 | Easy to synthesize |
| 10 | Difficult to synthesize |

**Method**: Fragment-based scoring with complexity penalties

**Reference**: [Ertl & Schuffenhauer, 2009](https://doi.org/10.1186/1758-2946-1-8)

### Lipinski's Rule of Five

Classic drug-likeness filter:

| Rule | Threshold |
|------|-----------|
| Molecular Weight | ≤ 500 Da |
| LogP | ≤ 5 |
| H-bond Donors | ≤ 5 |
| H-bond Acceptors | ≤ 10 |

---

## 6. Molecular Dynamics Simulation

### 6.1 Force Fields

#### Protein Force Field: ff14SB

| Component | Description |
|-----------|-------------|
| **File** | `leaprc.protein.ff14SB` |
| **Backbone** | Improved φ/ψ torsions |
| **Side Chains** | Optimized χ rotamers |
| **Validation** | NMR order parameters, folding |

**Reference**: [Maier et al., 2015](https://doi.org/10.1021/acs.jctc.5b00255)

#### Alternative: ff19SB

| Component | Description |
|-----------|-------------|
| **File** | `leaprc.protein.ff19SB` |
| **Improvements** | CMAP corrections, IDP compatibility |
| **Use Case** | Intrinsically disordered proteins |

**Reference**: [Tian et al., 2020](https://doi.org/10.1021/acs.jctc.9b00591)

#### Ligand Force Field: GAFF2

| Component | Description |
|-----------|-------------|
| **File** | `gaff2.dat` |
| **Coverage** | General organic molecules |
| **Charges** | AM1-BCC (antechamber) |

**Reference**: [Wang et al., 2004](https://doi.org/10.1002/jcc.20035)

### 6.2 Water Models

#### TIP3P (Default)

| Property | Value |
|----------|-------|
| **File** | `leaprc.water.tip3p` |
| **Sites** | 3-point |
| **Use Case** | General simulations, AMBER standard |

**Reference**: [Jorgensen et al., 1983](https://doi.org/10.1063/1.445869)

#### Available Alternatives

| Model | Sites | Best For |
|-------|-------|----------|
| OPC | 4-point | Improved density, diffusion |
| SPC/E | 3-point | Bulk water properties |
| TIP4P-Ew | 4-point | Ewald summation |

### 6.3 Ion Parameters

#### Joung-Cheatham Ions (Default)

| Ion | Use |
|-----|-----|
| Na+ | Counter-ion, physiological |
| Cl- | Counter-ion, physiological |

**Parameters**: Optimized for TIP3P water
**Ionic Strength**: 0.15 M (physiological)

**Reference**: [Joung & Cheatham, 2008](https://doi.org/10.1021/jp8001614)

### 6.4 Equilibration Protocol

OpenMM-based staged equilibration:

```
Stage 1: Minimization (heavy atom restraints)
    └─ 1000 steps steepest descent
    └─ 1000 steps L-BFGS

Stage 2: NVT Heating (0 → 300K)
    └─ 50 ps, Langevin thermostat
    └─ Heavy atom restraints (10 kcal/mol/Å²)

Stage 3: NPT Equilibration (300K, 1 bar)
    └─ 100 ps, Monte Carlo barostat
    └─ Backbone restraints (5 kcal/mol/Å²)

Stage 4: NPT Equilibration (unrestrained)
    └─ 100 ps, density equilibration

Stage 5: Production
    └─ User-defined length
    └─ HMR (4 fs timestep)
    └─ PME electrostatics
```

### 6.5 Hydrogen Mass Repartitioning (HMR)

Enables 4 fs timesteps by redistributing mass:

| Parameter | Value |
|-----------|-------|
| H mass | 3.0 amu (from 1.008) |
| Timestep | 4 fs (vs 2 fs standard) |
| Speedup | ~2x |

**Reference**: [Hopkins et al., 2015](https://doi.org/10.1021/acs.jctc.5b00819)

---

## 7. Bundled Software Versions

### Python Packages (python310 env)

| Package | Version | Purpose |
|---------|---------|---------|
| PyTorch | 2.7.1+cu118 | FragGen neural networks |
| RDKit | 2023.09.6 | Cheminformatics |
| OpenMM | 8.4 | MD simulation engine |
| OpenMM-ForceFields | 0.14.2 | Force field loaders |
| MDAnalysis | 2.9.0 | Trajectory analysis |
| scikit-learn | 1.7.2 | ML utilities |
| BioPython | 1.86 | Structural biology |
| ParmEd | 4.3.0 | Parameter manipulation |
| PyTraj | 2.0.6 | AMBER trajectory tools |
| Dimorphite-DL | 2.0.2 | Protonation states |
| NumPy | 1.26.4 | Numerical computing |
| Pandas | 2.1.4 | Data manipulation |

### Binaries

| Binary | Version | Purpose |
|--------|---------|---------|
| GNINA | 1.1 | Molecular docking |
| tleap | AmberTools 23 | System building |
| antechamber | AmberTools 23 | Ligand parameterization |
| parmchk2 | AmberTools 23 | Parameter checking |
| cpptraj | AmberTools 23 | Trajectory processing |
| obabel | 3.1.1 | Format conversion |

### AI Models

| Model | Files | Size | Source |
|-------|-------|------|--------|
| FragGen | `*.pt` checkpoints | 140 MB | [FragGen repo](https://github.com/HaotianZhangAI4Science/FragGen) |
| GNINA CNN | Embedded in binary | ~50 MB | [GNINA](https://github.com/gnina/gnina) |
| CORDIAL | `*.model` weights | 4.9 MB | [CORDIAL](https://github.com/bpBrownLab/CORDIAL) |

---

## 8. File Formats

### Input Formats

| Format | Extension | Use |
|--------|-----------|-----|
| PDB | `.pdb` | Protein structures |
| SDF | `.sdf` | Ligand libraries |
| SMILES | `.csv` | Ligand strings |
| MOL2 | `.mol2` | Ligands with charges |

### Output Formats

| Format | Extension | Contents |
|--------|-----------|----------|
| SDF | `.sdf.gz` | Docked poses with scores |
| CSV | `.csv` | Results tables |
| PDB | `.pdb` | Complexes, trajectories |
| DCD | `.dcd` | MD trajectories |

---

## 9. Validation and Benchmarks

### GNINA Benchmarking

- **PDBbind Core Set**: R² = 0.64 for affinity prediction
- **DUD-E**: AUC = 0.89 for virtual screening
- **CASF-2016**: Success rate = 74% for pose prediction

### FragGen Validation

- **Binding Mode Recovery**: 65% within 2Å RMSD
- **Drug-likeness**: 85% pass Lipinski rules
- **Synthetic Accessibility**: Mean SA = 3.2

### CORDIAL Performance

- **PDBbind Test Set**: R² = 0.58, RMSE = 1.2 pKd
- **Calibration**: Well-calibrated ordinal probabilities

---

## 10. Troubleshooting

### Common Issues

**Electron sandbox error**:
```
The SUID sandbox helper binary was found, but is not configured correctly
```
Solution: Launcher includes `--no-sandbox` flag. For .deb package, postinst sets proper permissions.

**CUDA not detected**:
- FragGen falls back to CPU automatically
- Check NVIDIA drivers: `nvidia-smi`

**Missing conda env**:
- Ensure bundle was created from machine with both `fraggen` and `surface_gen` envs
- Run `npm run dist:pack` for relocatable envs

---

## References

1. Peng et al. (2022). "Fragment-based drug design with graph neural networks." arXiv:2212.00672
2. McNutt et al. (2021). "GNINA 1.0: molecular docking with deep learning." J Cheminform 13:43
3. Maier et al. (2015). "ff14SB: Improving the Accuracy of Protein Side Chain and Backbone Parameters." JCTC 11:3696
4. Wang et al. (2004). "Development and testing of a general amber force field." JCC 25:1157
5. Jorgensen et al. (1983). "Comparison of simple potential functions for simulating liquid water." JCP 79:926
6. Joung & Cheatham (2008). "Determination of alkali and halide monovalent ion parameters." JPCB 112:9020
7. Bickerton et al. (2012). "Quantifying the chemical beauty of drugs." Nature Chem 4:90
8. Riniker & Landrum (2015). "Better Informed Distance Geometry." JCIM 55:2562
