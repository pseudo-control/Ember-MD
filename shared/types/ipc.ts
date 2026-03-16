/**
 * IPC channel types and payloads
 */

import type { Result } from './result';
import type { AppError } from './errors';

// === Configuration types ===

export interface SamplingThresholds {
  focalThreshold: number;
  posThreshold: number;
  elementThreshold: number;
}

export interface SamplingConfig {
  seed: number;
  numSamples: number;
  beamSize: number;
  maxSteps: number;
  threshold: SamplingThresholds;
  nextThreshold: SamplingThresholds;
  queueSameSmiTolerance: number;
}

// Default sampling config (matches FragGen defaults)
export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  seed: 2020,
  numSamples: 500,
  beamSize: 500,
  maxSteps: 50,
  threshold: {
    focalThreshold: 0.5,
    posThreshold: 0.2,
    elementThreshold: 0.2,
  },
  nextThreshold: {
    focalThreshold: 0.25,
    posThreshold: 0.1,
    elementThreshold: 0.2,
  },
  queueSameSmiTolerance: 2,
};

// === Request/Response types ===

export interface PrepPdbOptions {
  ligandName?: string;
  pocketRadius?: number;
}

export interface PrepPdbResult {
  pocketPdb: string;
  ligandPdb: string;
  outputDir: string;
}

export interface SurfaceResult {
  surfaceFile: string;
}

export type ModelVariant = 'dihedral' | 'cartesian' | 'geomopt';
export type Device = 'cpu' | 'mps' | 'cuda';
export type GenerationMode = 'denovo' | 'grow';

export interface AnchorValidationResult {
  valid: boolean;
  atomCount: number;
  has3DCoords: boolean;
  errorMessage?: string;
}

export interface GenerationOptions {
  surfacePly: string;
  pocketPdb: string;
  ligandPdb: string | null;
  outputDir: string;
  modelVariant: ModelVariant;
  device: Device;
  sampling: SamplingConfig;
  pocketRadius: number;
  // Anchor mode fields
  generationMode: GenerationMode;
  anchorSdfPath: string | null;  // Path to anchor SDF (null for denovo)
}

export interface GenerationResult {
  outputDir: string;
  sdfDir: string;
  paramsFile: string;
}

export interface FileInfo {
  exists: boolean;
  size?: number;
  modified?: Date;
}

// === Run parameters log ===

export interface RunParameters {
  timestamp: string;
  inputPdb: string;
  modelVariant: ModelVariant;
  device: Device;
  pocketRadius: number;
  sampling: SamplingConfig;
  outputDir: string;
  pocketPdb: string;
  ligandPdb: string | null;
  surfacePly: string;
}

// === Output stream types ===

export interface OutputData {
  type: 'stdout' | 'stderr';
  data: string;
}

// === Stats types ===

export interface GenerationStats {
  totalMoleculesGenerated: number;
  sessionsCount: number;
  lastGenerationDate: string | null;
}

// === IPC Channel names ===

export const IpcChannels = {
  // Invoke channels (renderer -> main -> renderer)
  SELECT_PDB_FILE: 'select-pdb-file',
  SELECT_OUTPUT_FOLDER: 'select-output-folder',
  PREP_PDB: 'prep-pdb',
  GENERATE_SURFACE: 'generate-surface',
  RUN_GENERATION: 'run-generation',
  GENERATE_RESULTS_CSV: 'generate-results-csv',
  GENERATE_THUMBNAIL: 'generate-thumbnail',
  SELECT_PDB_FILES_MULTI: 'select-pdb-files-multi',
  FILE_EXISTS: 'file-exists',
  GET_FILE_INFO: 'get-file-info',
  CREATE_DIRECTORY: 'create-directory',
  LIST_SDF_FILES: 'list-sdf-files',
  OPEN_FOLDER: 'open-folder',
  GET_AVAILABLE_DEVICES: 'get-available-devices',
  GET_STATS: 'get-stats',
  UPDATE_STATS: 'update-stats',
  CHECK_JOB_EXISTS: 'check-job-exists',
  VALIDATE_ANCHOR_SDF: 'validate-anchor-sdf',

  // GNINA docking channels
  SELECT_CSV_FILE: 'select-csv-file',
  SELECT_SDF_FILE: 'select-sdf-file',
  PARSE_FRAGGEN_CSV: 'parse-fraggen-csv',
  CHECK_GNINA_INSTALLED: 'check-gnina-installed',
  DOWNLOAD_GNINA: 'download-gnina',
  RUN_GNINA_DOCKING: 'run-gnina-docking',
  PARSE_GNINA_RESULTS: 'parse-gnina-results',
  LIST_SDF_IN_DIRECTORY: 'list-sdf-in-directory',
  DETECT_PDB_LIGANDS: 'detect-pdb-ligands',
  EXTRACT_LIGAND: 'extract-ligand',
  PREPARE_RECEPTOR: 'prepare-receptor',
  EXPORT_GNINA_CSV: 'export-gnina-csv',
  EXPORT_COMPLEX_PDB: 'export-complex-pdb',
  GET_CPU_COUNT: 'get-cpu-count',
  // Multi-input ligand source channels
  SELECT_FOLDER: 'select-folder',
  SCAN_SDF_DIRECTORY: 'scan-sdf-directory',
  PARSE_SMILES_CSV: 'parse-smiles-csv',
  CONVERT_SINGLE_MOLECULE: 'convert-single-molecule',
  EXTRACT_XRAY_LIGAND: 'extract-xray-ligand',
  ENUMERATE_PROTONATION: 'enumerate-protonation',
  GENERATE_CONFORMERS: 'generate-conformers',
  // CORDIAL rescoring
  CHECK_CORDIAL_INSTALLED: 'check-cordial-installed',
  RUN_CORDIAL_SCORING: 'run-cordial-scoring',

  // Viewer channels
  SAVE_PDB_FILE: 'save-pdb-file',

  // File writing
  WRITE_TEXT_FILE: 'write-text-file',

  // MD simulation channels
  LOAD_GNINA_OUTPUT_FOR_MD: 'md:load-gnina-output',
  RUN_MD_BENCHMARK: 'md:benchmark',
  RUN_MD_SIMULATION: 'md:simulate',

  // Trajectory viewer channels
  SELECT_DCD_FILE: 'select-dcd-file',
  LIST_PDB_IN_DIRECTORY: 'list-pdb-in-directory',
  GET_TRAJECTORY_INFO: 'get-trajectory-info',
  GET_TRAJECTORY_FRAME: 'get-trajectory-frame',
  CLUSTER_TRAJECTORY: 'cluster-trajectory',
  SCAN_CLUSTER_DIRECTORY: 'scan-cluster-directory',
  LOAD_ALIGNED_CLUSTERS: 'load-aligned-clusters',
  EXPORT_TRAJECTORY_FRAME: 'export-trajectory-frame',
  ANALYZE_TRAJECTORY: 'analyze-trajectory',
  GENERATE_MD_REPORT: 'generate-md-report',

  // Send channels (main -> renderer)
  PREP_OUTPUT: 'prep-output',
  SURFACE_OUTPUT: 'surface-output',
  GENERATION_OUTPUT: 'generation-output',
  GNINA_OUTPUT: 'gnina-output',
  GNINA_DOWNLOAD_PROGRESS: 'gnina-download-progress',
  MD_OUTPUT: 'md:output',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

// === Trajectory types ===

export interface TrajectoryInfoResult {
  frameCount: number;
  timestepPs: number;      // Timestep in picoseconds between frames
  totalTimeNs: number;     // Total simulation time in nanoseconds
}

export interface ClusteringOptions {
  topologyPath: string;      // PDB file path
  trajectoryPath: string;    // DCD file path
  numClusters: number;
  method: 'kmeans' | 'dbscan' | 'hierarchical';
  rmsdSelection: 'ligand' | 'backbone' | 'all';  // Which atoms to use for RMSD
  stripWaters: boolean;
  outputDir: string;
}

export interface ClusterResultData {
  clusterId: number;
  frameCount: number;
  population: number;        // Percentage
  centroidFrame: number;
  centroidPdbPath?: string;  // Path to centroid PDB if saved
}

export interface ClusteringResult {
  clusters: ClusterResultData[];
  frameAssignments: number[];  // Cluster ID for each frame
  outputDir: string;
}

export interface ExportFrameOptions {
  topologyPath: string;
  trajectoryPath: string;
  frameIndex: number;
  outputPath: string;
  stripWaters?: boolean;
}

export interface AnalysisOptions {
  topologyPath: string;
  trajectoryPath: string;
  analysisType: 'rmsd' | 'rmsf' | 'hbonds' | 'contacts';
  outputDir: string;
  ligandSelection?: string;  // Optional ligand selection for ligand-specific analyses
}

export interface RmsdAnalysisResult {
  timeNs: number[];         // Time points
  rmsdProtein: number[];    // Protein backbone RMSD
  rmsdLigand?: number[];    // Ligand RMSD (if ligand present)
  plotPath: string;         // Path to generated plot PNG
}

export interface RmsfAnalysisResult {
  residueIndices: number[];
  rmsf: number[];
  plotPath: string;
}

export interface HbondAnalysisResult {
  hbonds: Array<{
    donor: string;
    acceptor: string;
    occupancy: number;      // Percentage of frames with this H-bond
  }>;
  plotPath: string;
  csvPath: string;
}

export interface AnalysisResult {
  type: 'rmsd' | 'rmsf' | 'hbonds' | 'contacts';
  data: RmsdAnalysisResult | RmsfAnalysisResult | HbondAnalysisResult;
}

export interface MdReportOptions {
  topologyPath: string;
  trajectoryPath: string;
  outputDir: string;
  includeRmsd?: boolean;
  includeRmsf?: boolean;
  includeHbonds?: boolean;
  includeContacts?: boolean;
}

export interface MdReportResult {
  reportPath: string;       // Path to generated HTML report
  analysisDir: string;      // Directory containing analysis outputs
}

// Cluster directory scanning types
export interface ScannedCluster {
  clusterId: number;
  pdbPath: string;
  population: number;       // Percentage from clustering results
}

export interface ScanClusterDirectoryResult {
  clusters: ScannedCluster[];
  clusteringResultsPath?: string;  // Path to clustering_results.json if found
}

export interface LoadedClusterPdb {
  clusterId: number;
  pdbPath: string;          // Original PDB path
  alignedPath: string;      // Path to aligned PDB file
  population: number;
}
