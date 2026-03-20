# Ember

Desktop app for GPU-accelerated molecular dynamics on Apple Silicon. Primary user-facing tabs: **View** (NGL 3D viewer), **MCMM** (standalone conformer generation), **Dock** (AutoDock Vina), **Map** (binding site mapping), and **Simulate** (OpenMM AMBER MD). The codebase also contains an **FEP** scoring panel, but its header tab is currently disabled.

**Repos**: `pseudo-control/Ember-MD` (this repo), `pseudo-control/Ember-Metal` (native Metal GPU backend, separate repo)
**Stale docs**: `README.md` and `deps/README.md` still reference FragGen/GNINA/Linux — use this file instead.
**Script duplication**: `run_md_simulation.py` exists at both repo root (reference copy) and `deps/staging/scripts/` (canonical bundled copy with plugin loading).

## Tech Stack
- **Frontend**: SolidJS + TypeScript + Tailwind/DaisyUI (wireframe/business themes)
- **Desktop**: Electron 27, Webpack
- **MD Engine**: OpenMM 8.1.2 (AMBER ff19SB/ff14SB + OPC/TIP3P + OpenFF Sage 2.3.0)
- **GPU**: OpenCL (cl2Metal, preferred in the app runtime for larger systems) → Metal (native MSL fallback, often faster on smaller systems) → CPU
- **Visualization**: NGL (WebGL), always mounted and CSS-hidden outside View mode to avoid stage re-creation/OOM issues
- **Cheminformatics**: RDKit, Meeko (PDBQT prep), Molscrub (protonation), PDBFixer, MDAnalysis, AmberTools
- **Scoring**: CORDIAL neural-network rescoring (optional, `~/Desktop/CORDIAL`)

## Build
```bash
npm start               # Build + run dev mode
npm run build:electron  # TS → electron-dist/
npm run build           # Webpack → dist-webpack/
npm run dist:mac        # Bundle .dmg via scripts/bundle-mac.sh (conda-pack → electron-builder dir build → create-dmg/plain DMG)
                        # Auto-generates assets/dmg-background.png if missing
                        # Requires: brew install create-dmg, Finder automation permission
```

## Project Structure
```
/electron/main.ts          — IPC handlers, subprocess management, logging, path resolution
/electron/preload.ts       — Context bridge (inlined channel names)
/src/App.tsx               — Root: ViewerMode always mounted (CSS-hidden); routes View, MCMM, Dock, Map, MD, and FEP panel
/src/stores/workflow.ts    — SolidJS signals (WorkflowState, MDState, DockState, ViewerState, MapState, ConformState)
/src/utils/projectPaths.ts — Project directory layout (DockingPaths, SimulationPaths, conformers path)
/src/utils/jobName.ts      — Job name generation + folder naming
/src/components/layout/WizardLayout.tsx — Header: View | MCMM | Dock | Map | Simulate | FEP(disabled), project+job selector, step indicators
/src/components/steps/     — DockStep{Load,Configure,Progress,Results}, MDStep{Load,Configure,Progress,Results}, ConformStep{Load,Configure,Progress,Results}
/src/components/viewer/    — ViewerMode, TrajectoryControls, ClusteringModal, AnalysisPanel, FepScoringPanel, LayerPanel, BindingSiteMapPanel
/src/components/map/       — MapMode (binding site mapping)
/shared/types/             — md.ts, dock.ts, ipc.ts, electron-api.ts, errors.ts, result.ts
/scripts/score_cordial.py  — CORDIAL rescoring (outside deps/staging/)
/deps/staging/scripts/     — Canonical Python scripts called by Electron
                             run_md_simulation.py, run_vina_docking.py, run_abfe.py,
                             detect_pdb_ligands.py, extract_xray_ligand.py, enumerate_protonation.py,
                             enumerate_stereoisomers.py, generate_conformers.py, cluster_trajectory.py,
                             analyze_*.py, utils.py, etc.
```

## Project Directory Layout
Each project lives under `~/Ember/{projectName}/`. Defined in `src/utils/projectPaths.ts`.
```text
{project}/
  .ember-project
  structures/                        — Imported PDB/CIF files
  surfaces/binding_site_map/         — OpenDX interaction grids

  docking/Vina_{ligandId}/           — Self-contained docking job
    inputs/receptor.pdb, reference_ligand.sdf, ligands/*.sdf
    prep/                            — Extraction, protonation, stereoisomers, conformers
    results/all_docked.sdf, cordial_scores.json, poses/*_docked.sdf.gz

  simulations/{run}/
    inputs/                          — receptor.pdb, ligand.sdf
    results/                         — system.pdb, trajectory.dcd, final.pdb, energy.csv, seed.txt
    analysis/                        — clustering/, rmsd/, rmsf/, hbonds/, contacts/

  conformers/{run}/                  — Standalone conformer generation output
  fep/                               — FEP scoring output
```
**Legacy fallbacks**: scanners still check old layouts such as `*_receptor_prepared.pdb`, top-level `poses/`, prefixed `*_system.pdb`, and `raw/`.

**Path API**: `projectPaths(baseDir, name).docking(run)` returns `{ root, inputs, inputsLigands, prep, results, resultsPoses }`. `.simulations(run)` returns `{ root, inputs, results, analysis, analysisClustering }`. `.conformers(run)` returns the standalone conformer output directory.

## Header UI
Three-zone layout: mode tabs on the left, project name + job selector in the center, step indicators on the right. The visible tabs are `View`, `MCMM`, `Dock`, `Map`, `Simulate`, and a disabled `FEP` tab labeled “coming soon”. The job selector currently groups jobs under docking and simulation.

## Simulate Mode
**Equilibration**: AMBER-style restrained minimization → graduated minimization → NVT heating 5→100 K → NPT heating 100→300 K → restrained NPT → gradual restraint release → unrestrained NPT → production with HMR. Shared type metadata currently treats equilibration as roughly 270 ps.

**Random seed**: `MDConfig.seed` (`0 = auto`). Applied to velocity initialization and Langevin noise, then written to `seed.txt` for reproducibility.

**Presets**: `ff19sb-opc` (default), `ff14sb-tip3p`, `ff19sb-opc3`, `charmm36-mtip3p`. Ligands use OpenFF Sage 2.3.0.

**Key details**: protein FF path is `amber/protein.ff19SB.xml`. OpenCL production uses single precision. Restraints use `periodicdistance()^2` for PBC compatibility.

## Dock Mode
Pipeline: receptor prep (Meeko Polymer) → ligand PDBQT prep (Meeko) → autobox from reference ligand → Vina docking → optional post-dock pocket refinement (OpenMM, Sage 2.3.0 + OBC2, receptor-restrained) → multi-pose SDF.gz output. Optional CORDIAL rescoring, MCS core-constrained RMSD, protonation via Molscrub, stereoisomer enumeration via RDKit, and conformer generation before docking.

**Receptor prep**: removes the docking ligand and common crystallization artifacts, keeps nearby crystallographic waters, metal ions, and relevant cofactors near the binding site. Metals are re-injected into PDBQT after Meeko processing with explicit AD4 atom types and charges.

## MCMM Mode
Standalone conformer generation is exposed in the UI as **MCMM**. Internally the workflow state is still named `conform`, but user-facing docs and tabs should call this MCMM mode. The screen supports both `ETKDG` and `MCMM`; defaults come from `DEFAULT_CONFORMER_CONFIG` and currently favor `MCMM` with 50 max conformers, 1.0 A RMSD cutoff, 5.0 kcal/mol energy window, 1000 MCMM steps, 298 K, and amide cis/trans sampling enabled. MCMM uses Sage 2.3.0 + OBC2 implicit solvent.

## FEP Panel
`FepScoringPanel` and `run_abfe.py` are present in the codebase, and `state().mode === 'score'` renders the panel. In the current header UI the `FEP` tab is disabled, so this is implemented but not exposed as a normal selectable tab.

## View Mode
NGL viewer with queue navigation for docking poses or cluster centroids. Trajectory playback updates coordinates in place after the first frame instead of reparsing PDBs. Supports clustering, RMSD/RMSF/H-bond/contact analysis, binding-site maps, surface coloring, and multi-structure layer alignment.

## Logging
`~/Ember/logs/ember-<timestamp>.log` captures main-process and renderer console output. Tags commonly include `[Viewer]`, `[Dock]`, `[MD]`, `[FEP]`, `[Nav]`, and `[Store]`.

## Key Patterns
```typescript
// SolidJS store update
setState(s => ({ ...s, md: { ...s.md, config: { ...s.md.config, ...config } } }));

// ViewerMode stays mounted and is only CSS-hidden outside View mode
<div style={{ display: state().mode === 'viewer' ? 'block' : 'none' }}>
  <ViewerMode />
</div>

// Load a job in the viewer
resetViewer();
setViewerPdbPath(pdb);
setViewerLigandPath(sdf);
setMode('viewer');

// NGL ligand selection: use resname, not chain
return `[${ligand.resname}] and ${ligand.resnum}`;
```

## Path Resolution (main.ts)
Bundled app paths prefer `process.resourcesPath/scripts` and `process.resourcesPath/python/bin/python`. Dev mode falls back to `deps/staging/scripts/` and typical `openmm-metal`/`fraggen` conda env paths. Legacy env vars such as `FRAGGEN_ROOT` and `FRAGGEN_PYTHON` are still honored.

## GPU Platform Cascade
For the canonical bundled MD runner in `deps/staging/scripts/run_md_simulation.py`, the runtime platform order is `CUDA → OpenCL (cl2Metal) → Metal → CPU`. OpenCL is currently tried before Metal in both benchmarking and full simulation setup.

## Metal Backend
Native Metal backend work lives in the separate `pseudo-control/Ember-Metal` repo. Use that repo’s instruction file for low-level backend architecture, profiling, and MSL porting notes rather than duplicating them here.

## Known Limitations
- macOS only in practice for the current app workflow
- App is unsigned, so launch from `/Applications` or Spotlight rather than Launchpad
- `run_md_simulation.py` exists both at repo root and in `deps/staging/scripts/`; the staging copy is canonical for the app
- The header `FEP` tab is disabled even though the scoring panel exists in code

## License
MIT. GPL-licensed scientific tools are invoked as separate processes. Meeko and Molscrub are Apache-2.0.
