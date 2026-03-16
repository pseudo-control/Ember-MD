/**
 * Molecular Dynamics simulation types
 */

export type MDForceFieldPreset = 'fast' | 'accurate';

export interface MDConfig {
  // User-adjustable
  productionNs: number;           // Nanoseconds (default: 10, text input)
  forceFieldPreset: MDForceFieldPreset;  // Fast (ff14SB) or Accurate (ff19SB)
}

export const DEFAULT_MD_CONFIG: MDConfig = {
  productionNs: 10,
  forceFieldPreset: 'accurate',
};

// Fixed parameters that don't change with preset
export const MD_COMMON_PARAMS = {
  temperature: 300,           // K
  saltConcentration: 0.15,    // M (150 mM)
  boxShape: 'dodecahedron',
  paddingNm: 1.2,             // nm
  timestepFs: 4,              // fs (HMR enabled for faster production)
  forceFieldLigand: 'OpenFF Sage 2.0',
  integrator: 'LangevinMiddle',
  equilibrationPs: 270,       // ~270 ps (AMBER-style with restraints: min, heat, equil, release)
} as const;

// Preset-specific force field parameters
export const MD_PRESET_PARAMS = {
  fast: {
    forceFieldProtein: 'ff14SB (AMBER)',
    forceFieldWater: 'TIP3P',
    description: 'Faster simulation with well-tested ff14SB + TIP3P',
  },
  accurate: {
    forceFieldProtein: 'ff19SB (AMBER)',
    forceFieldWater: 'OPC (4-site)',
    description: 'Higher accuracy ff19SB + OPC water model (recommended)',
  },
} as const;

// Legacy export for backwards compatibility
export const MD_FIXED_PARAMS = {
  ...MD_COMMON_PARAMS,
  forceFieldProtein: MD_PRESET_PARAMS.fast.forceFieldProtein,
  forceFieldWater: MD_PRESET_PARAMS.fast.forceFieldWater,
} as const;

export interface MDSystemInfo {
  atomCount: number;          // Total atoms in solvated system
  boxVolumeA3: number;        // Box volume in A^3
}

export interface MDBenchmarkResult {
  nsPerDay: number;           // Estimated throughput
  estimatedHours: number;     // For production_ns duration
  systemInfo: MDSystemInfo;
}

export type MDStage =
  | 'building'
  | 'parameterizing'
  | 'min_restrained'
  | 'min_unrestrained'
  | 'heating'
  | 'npt_restrained'
  | 'release'
  | 'equilibration'
  | 'production'
  | 'benchmark';

export interface MDProgress {
  stage: MDStage;
  progress: number;           // 0-100 for current stage
  systemInfo?: MDSystemInfo;  // Populated after building
}

export interface MDResult {
  systemPdbPath: string;      // Solvated system (system.pdb)
  trajectoryPath: string;     // Full trajectory (trajectory.dcd)
  equilibratedPdbPath: string; // Post-equilibration frame
  finalPdbPath: string;       // Final frame (final.pdb)
  energyCsvPath: string;      // Energy timeseries (energy.csv)
}

// Output data for MD progress events
export interface MDOutputData {
  type: 'stdout' | 'stderr';
  data: string;
}

// Ligand loaded from GNINA output for MD
export interface MDLoadedLigand {
  name: string;           // e.g., "mol_002"
  sdfPath: string;        // Path to *_docked.sdf.gz
  smiles: string;         // SMILES string extracted from SDF
  cnnScore: number;       // Best pose CNN score (from SDF properties)
  cnnAffinity: number;    // Best pose CNN affinity (from SDF properties)
  vinaAffinity: number;   // Best pose Vina affinity (from SDF properties)
  qed: number;            // QED calculated from structure
  mw?: number;            // Molecular weight
  logp?: number;          // LogP
  cordialPHighAffinity?: number;  // CORDIAL P(pKd >= 6) if available
  cordialExpectedPkd?: number;    // CORDIAL expected pKd if available
  thumbnailPath?: string; // Path to 2D PNG if available (legacy)
  thumbnail?: string;     // Base64 encoded 2D thumbnail (preferred)
}

// GNINA output directory structure for MD loading
export interface MDGninaOutput {
  receptorPdb: string;           // receptor_prepared.pdb
  ligands: MDLoadedLigand[];     // Sorted by cnnScore descending
}
