import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channel names (can't require external modules in preload sandbox)
const IpcChannels = {
  SELECT_PDB_FILE: 'select-pdb-file',
  SELECT_PDB_FILES_MULTI: 'select-pdb-files-multi',
  SELECT_OUTPUT_FOLDER: 'select-output-folder',
  PREP_PDB: 'prep-pdb',
  GENERATE_SURFACE: 'generate-surface',
  RUN_GENERATION: 'run-generation',
  GENERATE_RESULTS_CSV: 'generate-results-csv',
  GENERATE_THUMBNAIL: 'generate-thumbnail',
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
  // GNINA channels
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
  // MD channels
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
  // Image reading channel
  READ_IMAGE_AS_DATA_URL: 'read-image-as-data-url',
  // Send channels
  PREP_OUTPUT: 'prep-output',
  SURFACE_OUTPUT: 'surface-output',
  GENERATION_OUTPUT: 'generation-output',
  GNINA_OUTPUT: 'gnina-output',
  GNINA_DOWNLOAD_PROGRESS: 'gnina-download-progress',
  MD_OUTPUT: 'md:output',
} as const;

interface OutputData {
  type: 'stdout' | 'stderr';
  data: string;
}

interface PrepPdbOptions {
  ligandName?: string;
  pocketRadius?: number;
}

interface GenerationOptions {
  surfacePly: string;
  pocketPdb: string;
  ligandPdb: string | null;
  outputDir: string;
  modelVariant: string;
  device: string;
  sampling: unknown;
  pocketRadius: number;
  // Anchor mode fields
  generationMode: 'denovo' | 'grow';
  anchorSdfPath: string | null;
}

interface GninaDockingConfig {
  exhaustiveness: number;
  numPoses: number;
  autoboxAdd: number;
  numThreads: number;
}

interface GninaDownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

interface MDConfig {
  productionNs: number;
  forceFieldPreset: 'fast' | 'accurate';
}

interface MDBenchmarkResult {
  nsPerDay: number;
  systemInfo: {
    atomCount: number;
    boxVolumeA3: number;
  };
}

interface TrajectoryInfoResult {
  frameCount: number;
  timestepPs: number;
  totalTimeNs: number;
}

interface ClusteringOptions {
  topologyPath: string;
  trajectoryPath: string;
  numClusters: number;
  method: 'kmeans' | 'dbscan' | 'hierarchical';
  rmsdSelection: 'ligand' | 'backbone' | 'all';
  stripWaters: boolean;
  outputDir: string;
}

interface ExportFrameOptions {
  topologyPath: string;
  trajectoryPath: string;
  frameIndex: number;
  outputPath: string;
  stripWaters?: boolean;
}

interface AnalysisOptions {
  topologyPath: string;
  trajectoryPath: string;
  analysisType: 'rmsd' | 'rmsf' | 'hbonds' | 'contacts';
  outputDir: string;
  ligandSelection?: string;
}

interface MdReportOptions {
  topologyPath: string;
  trajectoryPath: string;
  outputDir: string;
  includeRmsd?: boolean;
  includeRmsf?: boolean;
  includeHbonds?: boolean;
  includeContacts?: boolean;
}

const electronAPI = {
  // File operations
  selectPdbFile: (defaultPath?: string) => ipcRenderer.invoke(IpcChannels.SELECT_PDB_FILE, defaultPath),
  selectPdbFilesMulti: () => ipcRenderer.invoke(IpcChannels.SELECT_PDB_FILES_MULTI),
  selectOutputFolder: () => ipcRenderer.invoke(IpcChannels.SELECT_OUTPUT_FOLDER),
  fileExists: (path: string) => ipcRenderer.invoke(IpcChannels.FILE_EXISTS, path),
  getFileInfo: (path: string) => ipcRenderer.invoke(IpcChannels.GET_FILE_INFO, path),
  createDirectory: (dirPath: string) => ipcRenderer.invoke(IpcChannels.CREATE_DIRECTORY, dirPath),
  listSdfFiles: (dirPath: string) => ipcRenderer.invoke(IpcChannels.LIST_SDF_FILES, dirPath),
  listPdbInDirectory: (dirPath: string) => ipcRenderer.invoke(IpcChannels.LIST_PDB_IN_DIRECTORY, dirPath),
  openFolder: (folderPath: string) => ipcRenderer.invoke(IpcChannels.OPEN_FOLDER, folderPath),

  // Preparation steps
  prepPdb: (pdbPath: string, outputDir: string, options?: PrepPdbOptions) =>
    ipcRenderer.invoke(IpcChannels.PREP_PDB, pdbPath, outputDir, options),

  generateSurface: (pocketPdb: string, ligandPdb: string, outputPly: string) =>
    ipcRenderer.invoke(IpcChannels.GENERATE_SURFACE, pocketPdb, ligandPdb, outputPly),

  // Generation
  runGeneration: (options: GenerationOptions) =>
    ipcRenderer.invoke(IpcChannels.RUN_GENERATION, options),

  // Results CSV
  generateResultsCsv: (sdfDir: string, outputCsv: string) =>
    ipcRenderer.invoke(IpcChannels.GENERATE_RESULTS_CSV, sdfDir, outputCsv),

  // Thumbnail
  generateThumbnail: (sdfPath: string) =>
    ipcRenderer.invoke(IpcChannels.GENERATE_THUMBNAIL, sdfPath),

  // Device info
  getAvailableDevices: () => ipcRenderer.invoke(IpcChannels.GET_AVAILABLE_DEVICES),
  getCpuCount: () => ipcRenderer.invoke(IpcChannels.GET_CPU_COUNT),

  // Stats
  getStats: () => ipcRenderer.invoke(IpcChannels.GET_STATS),
  updateStats: (moleculeCount: number) => ipcRenderer.invoke(IpcChannels.UPDATE_STATS, moleculeCount),

  // Job management
  checkJobExists: (outputFolder: string, jobName: string) =>
    ipcRenderer.invoke(IpcChannels.CHECK_JOB_EXISTS, outputFolder, jobName),

  // Anchor SDF validation for fragment growing mode
  validateAnchorSdf: (sdfPath: string) =>
    ipcRenderer.invoke(IpcChannels.VALIDATE_ANCHOR_SDF, sdfPath),

  // Event listeners (return cleanup functions)
  onPrepOutput: (callback: (data: OutputData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: OutputData) => callback(data);
    ipcRenderer.on(IpcChannels.PREP_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IpcChannels.PREP_OUTPUT, listener);
  },

  onSurfaceOutput: (callback: (data: OutputData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: OutputData) => callback(data);
    ipcRenderer.on(IpcChannels.SURFACE_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IpcChannels.SURFACE_OUTPUT, listener);
  },

  onGenerationOutput: (callback: (data: OutputData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: OutputData) => callback(data);
    ipcRenderer.on(IpcChannels.GENERATION_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IpcChannels.GENERATION_OUTPUT, listener);
  },

  // GNINA docking operations
  selectCsvFile: () => ipcRenderer.invoke(IpcChannels.SELECT_CSV_FILE),
  selectSdfFile: () => ipcRenderer.invoke(IpcChannels.SELECT_SDF_FILE),

  savePdbFile: (content: string, defaultName?: string) =>
    ipcRenderer.invoke(IpcChannels.SAVE_PDB_FILE, content, defaultName),

  parseFragGenCsv: (csvPath: string) =>
    ipcRenderer.invoke(IpcChannels.PARSE_FRAGGEN_CSV, csvPath),

  checkGninaInstalled: () => ipcRenderer.invoke(IpcChannels.CHECK_GNINA_INSTALLED),

  downloadGnina: () => ipcRenderer.invoke(IpcChannels.DOWNLOAD_GNINA),

  runGninaDocking: (
    receptorPdb: string,
    referenceLigand: string,
    ligandSdfPaths: string[],
    outputDir: string,
    config: GninaDockingConfig
  ) => ipcRenderer.invoke(
    IpcChannels.RUN_GNINA_DOCKING,
    receptorPdb,
    referenceLigand,
    ligandSdfPaths,
    outputDir,
    config
  ),

  parseGninaResults: (outputDir: string) =>
    ipcRenderer.invoke(IpcChannels.PARSE_GNINA_RESULTS, outputDir),

  listSdfInDirectory: (dirPath: string) =>
    ipcRenderer.invoke(IpcChannels.LIST_SDF_IN_DIRECTORY, dirPath),

  detectPdbLigands: (pdbPath: string) =>
    ipcRenderer.invoke(IpcChannels.DETECT_PDB_LIGANDS, pdbPath),

  extractLigand: (pdbPath: string, ligandId: string, outputPath: string) =>
    ipcRenderer.invoke(IpcChannels.EXTRACT_LIGAND, pdbPath, ligandId, outputPath),

  prepareReceptor: (pdbPath: string, ligandId: string, outputPath: string, waterDistance: number = 0) =>
    ipcRenderer.invoke(IpcChannels.PREPARE_RECEPTOR, pdbPath, ligandId, outputPath, waterDistance),

  exportGninaCsv: (outputDir: string, csvOutput: string, bestOnly: boolean) =>
    ipcRenderer.invoke(IpcChannels.EXPORT_GNINA_CSV, outputDir, csvOutput, bestOnly),

  exportComplexPdb: (receptorPdb: string, ligandSdf: string, poseIndex: number, outputPath: string) =>
    ipcRenderer.invoke(IpcChannels.EXPORT_COMPLEX_PDB, receptorPdb, ligandSdf, poseIndex, outputPath),

  // Multi-input ligand source operations
  selectFolder: () => ipcRenderer.invoke(IpcChannels.SELECT_FOLDER),

  scanSdfDirectory: (dirPath: string, outputDir: string) =>
    ipcRenderer.invoke(IpcChannels.SCAN_SDF_DIRECTORY, dirPath, outputDir),

  parseSmilesCsv: (csvPath: string, outputDir: string) =>
    ipcRenderer.invoke(IpcChannels.PARSE_SMILES_CSV, csvPath, outputDir),

  convertSingleMolecule: (input: string, outputDir: string, inputType: 'smiles' | 'mol_file') =>
    ipcRenderer.invoke(IpcChannels.CONVERT_SINGLE_MOLECULE, input, outputDir, inputType),

  extractXrayLigand: (pdbPath: string, ligandId: string, outputDir: string, smiles?: string) =>
    ipcRenderer.invoke(IpcChannels.EXTRACT_XRAY_LIGAND, pdbPath, ligandId, outputDir, smiles),

  enumerateProtonation: (
    ligandSdfPaths: string[],
    outputDir: string,
    phMin: number,
    phMax: number
  ) => ipcRenderer.invoke(
    IpcChannels.ENUMERATE_PROTONATION,
    ligandSdfPaths,
    outputDir,
    phMin,
    phMax
  ),

  generateConformers: (
    ligandSdfPaths: string[],
    outputDir: string,
    maxConformers: number,
    rmsdCutoff: number,
    energyWindow: number
  ) => ipcRenderer.invoke(
    IpcChannels.GENERATE_CONFORMERS,
    ligandSdfPaths,
    outputDir,
    maxConformers,
    rmsdCutoff,
    energyWindow
  ),

  // CORDIAL rescoring
  checkCordialInstalled: () => ipcRenderer.invoke(IpcChannels.CHECK_CORDIAL_INSTALLED),

  runCordialScoring: (gninaOutputDir: string, batchSize: number) =>
    ipcRenderer.invoke(IpcChannels.RUN_CORDIAL_SCORING, gninaOutputDir, batchSize),

  // GNINA event listeners
  onGninaOutput: (callback: (data: OutputData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: OutputData) => callback(data);
    ipcRenderer.on(IpcChannels.GNINA_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IpcChannels.GNINA_OUTPUT, listener);
  },

  onGninaDownloadProgress: (callback: (progress: GninaDownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: GninaDownloadProgress) => callback(progress);
    ipcRenderer.on(IpcChannels.GNINA_DOWNLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IpcChannels.GNINA_DOWNLOAD_PROGRESS, listener);
  },

  // MD simulation operations
  loadGninaOutputForMd: (dirPath: string) =>
    ipcRenderer.invoke(IpcChannels.LOAD_GNINA_OUTPUT_FOR_MD, dirPath),

  runMdBenchmark: (
    receptorPdb: string | null,
    ligandSdf: string,
    outputDir: string,
    forceFieldPreset: 'fast' | 'accurate' = 'accurate',
    ligandOnly: boolean = false
  ) => ipcRenderer.invoke(
    IpcChannels.RUN_MD_BENCHMARK,
    receptorPdb,
    ligandSdf,
    outputDir,
    forceFieldPreset,
    ligandOnly
  ),

  runMdSimulation: (
    receptorPdb: string | null,
    ligandSdf: string,
    outputDir: string,
    config: MDConfig,
    ligandOnly: boolean = false
  ) => ipcRenderer.invoke(
    IpcChannels.RUN_MD_SIMULATION,
    receptorPdb,
    ligandSdf,
    outputDir,
    config,
    ligandOnly
  ),

  // MD event listener
  onMdOutput: (callback: (data: OutputData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: OutputData) => callback(data);
    ipcRenderer.on(IpcChannels.MD_OUTPUT, listener);
    return () => ipcRenderer.removeListener(IpcChannels.MD_OUTPUT, listener);
  },

  // Trajectory viewer operations
  selectDcdFile: () => ipcRenderer.invoke(IpcChannels.SELECT_DCD_FILE),

  getTrajectoryInfo: (topologyPath: string, trajectoryPath: string) =>
    ipcRenderer.invoke(IpcChannels.GET_TRAJECTORY_INFO, topologyPath, trajectoryPath),

  getTrajectoryFrame: (topologyPath: string, trajectoryPath: string, frameIndex: number) =>
    ipcRenderer.invoke(IpcChannels.GET_TRAJECTORY_FRAME, topologyPath, trajectoryPath, frameIndex),

  clusterTrajectory: (options: ClusteringOptions) =>
    ipcRenderer.invoke(IpcChannels.CLUSTER_TRAJECTORY, options),

  scanClusterDirectory: (directoryPath: string) =>
    ipcRenderer.invoke(IpcChannels.SCAN_CLUSTER_DIRECTORY, directoryPath),

  loadAlignedClusters: (directoryPath: string, clusterIds: number[]) =>
    ipcRenderer.invoke(IpcChannels.LOAD_ALIGNED_CLUSTERS, directoryPath, clusterIds),

  exportTrajectoryFrame: (options: ExportFrameOptions) =>
    ipcRenderer.invoke(IpcChannels.EXPORT_TRAJECTORY_FRAME, options),

  analyzeTrajectory: (options: AnalysisOptions) =>
    ipcRenderer.invoke(IpcChannels.ANALYZE_TRAJECTORY, options),

  generateMdReport: (options: MdReportOptions) =>
    ipcRenderer.invoke(IpcChannels.GENERATE_MD_REPORT, options),

  // Image reading
  readImageAsDataUrl: (imagePath: string) =>
    ipcRenderer.invoke(IpcChannels.READ_IMAGE_AS_DATA_URL, imagePath),

  // JSON file reading (for CORDIAL scores etc)
  readJsonFile: (jsonPath: string) =>
    ipcRenderer.invoke('read-json-file', jsonPath),

  // Text file writing (for logs)
  writeTextFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(IpcChannels.WRITE_TEXT_FILE, filePath, content),

  // Get default output directory (user's Desktop)
  getDefaultOutputDir: () =>
    ipcRenderer.invoke('get-default-output-dir'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
