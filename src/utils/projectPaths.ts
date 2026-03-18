/**
 * Centralized path construction for the project directory layout.
 *
 * ~/Ember/{projectName}/
 *   raw/           — Original input PDB files
 *   prepared/      — PDBFixer-cleaned + protonated structures
 *   ligands/sdf/   — Extracted/imported ligand SDFs
 *   ligands/smiles/ — SMILES text files
 *   ligands/images/ — 2D depiction PNGs
 *   surfaces/      — Surface property caches
 *   surfaces/binding_site_map/ — Interaction grids
 *   docking/{run}/ — Docking runs
 *   simulations/{run}/ — MD simulation runs
 *   fep/           — FEP scoring results
 */

import path from 'path';

export function projectPaths(baseDir: string, projectName: string) {
  const root = path.join(baseDir, projectName);
  return {
    root,
    raw: path.join(root, 'raw'),
    prepared: path.join(root, 'prepared'),
    ligands: {
      sdf: path.join(root, 'ligands', 'sdf'),
      smiles: path.join(root, 'ligands', 'smiles'),
      images: path.join(root, 'ligands', 'images'),
    },
    surfaces: path.join(root, 'surfaces'),
    bindingSiteMap: path.join(root, 'surfaces', 'binding_site_map'),
    docking: (runFolder: string) => path.join(root, 'docking', runFolder),
    simulations: (runFolder: string) => path.join(root, 'simulations', runFolder),
    fep: path.join(root, 'fep'),
    /** Prefix a filename with the project name */
    prefix: (name: string) => `${projectName}_${name}`,
  };
}
