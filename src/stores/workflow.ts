import { createSignal, createRoot } from 'solid-js';
import { generateJobName } from '../utils/jobName';
import {
  MDConfig,
  MDStage,
  MDSystemInfo,
  MDBenchmarkResult,
  MDResult,
  MDLoadedLigand,
  DEFAULT_MD_CONFIG,
} from '../../shared/types/md';

export type WorkflowMode = 'md' | 'viewer';
export type MDStep = 'md-load' | 'md-configure' | 'md-progress' | 'md-results';

// Viewer state types
export type ProteinRepresentation = 'cartoon' | 'ribbon' | 'spacefill';
export type LigandRepresentation = 'ball+stick' | 'stick' | 'spacefill';
export type SurfaceColorScheme = 'chainid' | 'hydrophobicity' | 'electrostatic' | 'electrostatic-muted' | 'residueindex' | 'uniform-grey';
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;
export type CenterTarget = 'ligand' | 'protein' | 'none';

export interface TrajectoryInfo {
  frameCount: number;
  timestepPs: number;
  totalTimeNs: number;
}

export interface ClusteringConfig {
  numClusters: number;
  method: 'kmeans' | 'dbscan' | 'hierarchical';
  rmsdSelection: 'ligand' | 'backbone' | 'all';
  stripWaters: boolean;
  saveCentroids: boolean;
}

export interface ClusterResult {
  clusterId: number;
  frameCount: number;
  population: number;
  centroidFrame: number;
  centroidPdbPath?: string;
}

export interface ClusteringResults {
  clusters: ClusterResult[];
  frameAssignments: number[];
}

export interface LoadedCluster {
  clusterId: number;
  pdbPath: string;
  population: number;
  color: string;
  visible: boolean;
}

export const CLUSTER_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#c026d3', '#65a30d', '#0d9488', '#e11d48',
];

export interface DetectedLigand {
  resname: string;
  resnum: number;
  chain: string;
  numAtoms: number;
}

export interface ViewerQueueItem {
  pdbPath: string;
  label: string;
}

export interface ViewerState {
  pdbPath: string | null;
  ligandPath: string | null;
  pdbQueue: ViewerQueueItem[];
  pdbQueueIndex: number;
  detectedLigands: DetectedLigand[];
  selectedLigandId: string | null;
  proteinRep: ProteinRepresentation;
  proteinSurface: boolean;
  proteinSurfaceOpacity: number;
  surfaceColorScheme: SurfaceColorScheme;
  proteinCarbonColor: string;
  showPocketResidues: boolean;
  showPocketLabels: boolean;
  hideWaterIons: boolean;
  ligandVisible: boolean;
  ligandRep: LigandRepresentation;
  ligandSurface: boolean;
  ligandSurfaceOpacity: number;
  ligandCarbonColor: string;
  ligandPolarHOnly: boolean;
  showInteractions: boolean;
  trajectoryPath: string | null;
  trajectoryInfo: TrajectoryInfo | null;
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  smoothing: number;
  loopPlayback: boolean;
  centerTarget: CenterTarget;
  clusteringConfig: ClusteringConfig;
  clusteringResults: ClusteringResults | null;
  isClustering: boolean;
  loadedClusters: LoadedCluster[];
  isLoadingClusters: boolean;
}

export interface PdbFile {
  path: string;
  name: string;
}

export type MDInputMode = 'protein_ligand' | 'ligand_only';

export interface MDState {
  inputMode: MDInputMode;
  gninaOutputDir: string | null;
  loadedLigands: MDLoadedLigand[];
  selectedLigandIndex: number | null;
  receptorPdb: string | null;
  ligandSdf: string | null;
  ligandName: string | null;
  singleMoleculeInput: string | null;
  singleMoleculeThumbnail: string | null;
  jobName: string;
  config: MDConfig;
  outputDir: string | null;
  result: MDResult | null;
  currentStage: MDStage | null;
  stageProgress: number;
  systemInfo: MDSystemInfo | null;
  benchmarkResult: MDBenchmarkResult | null;
  isBenchmarking: boolean;
}

export interface WorkflowState {
  mode: WorkflowMode;
  mdStep: MDStep;
  pdbFile: PdbFile | null;
  customOutputDir: string | null;
  jobName: string;
  isRunning: boolean;
  currentPhase: 'idle' | 'generation' | 'complete' | 'error';
  logs: string;
  errorMessage: string | null;
  md: MDState;
  viewer: ViewerState;
}

const defaultMDState: MDState = {
  inputMode: 'protein_ligand',
  gninaOutputDir: null,
  loadedLigands: [],
  selectedLigandIndex: null,
  receptorPdb: null,
  ligandSdf: null,
  ligandName: null,
  singleMoleculeInput: null,
  singleMoleculeThumbnail: null,
  jobName: '',
  config: { ...DEFAULT_MD_CONFIG },
  outputDir: null,
  result: null,
  currentStage: null,
  stageProgress: 0,
  systemInfo: null,
  benchmarkResult: null,
  isBenchmarking: false,
};

const defaultClusteringConfig: ClusteringConfig = {
  numClusters: 5,
  method: 'kmeans',
  rmsdSelection: 'ligand',
  stripWaters: true,
  saveCentroids: true,
};

const defaultViewerState: ViewerState = {
  pdbPath: null,
  ligandPath: null,
  pdbQueue: [],
  pdbQueueIndex: 0,
  detectedLigands: [],
  selectedLigandId: null,
  proteinRep: 'cartoon',
  proteinSurface: false,
  proteinSurfaceOpacity: 0.7,
  surfaceColorScheme: 'electrostatic',
  proteinCarbonColor: '#909090',
  showPocketResidues: true,
  showPocketLabels: false,
  hideWaterIons: true,
  ligandVisible: true,
  ligandRep: 'stick',
  ligandSurface: false,
  ligandSurfaceOpacity: 0.5,
  ligandCarbonColor: '#00ff00',
  ligandPolarHOnly: true,
  showInteractions: true,
  trajectoryPath: null,
  trajectoryInfo: null,
  currentFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,
  smoothing: 1,
  loopPlayback: true,
  centerTarget: 'ligand',
  clusteringConfig: { ...defaultClusteringConfig },
  clusteringResults: null,
  isClustering: false,
  loadedClusters: [],
  isLoadingClusters: false,
};

function createWorkflowStore() {
  const initialJobName = generateJobName();

  const [state, setState] = createSignal<WorkflowState>({
    mode: 'md',
    mdStep: 'md-load',
    pdbFile: null,
    customOutputDir: null,
    jobName: initialJobName,
    isRunning: false,
    currentPhase: 'idle',
    logs: '',
    errorMessage: null,
    md: { ...defaultMDState },
    viewer: { ...defaultViewerState },
  });

  // Mode selection
  const setMode = (mode: WorkflowMode) => setState((s) => ({ ...s, mode }));
  const setMdStep = (mdStep: MDStep) => setState((s) => ({ ...s, mdStep }));

  const setPdbFile = (pdbFile: PdbFile | null) =>
    setState((s) => ({ ...s, pdbFile, errorMessage: null }));

  const setCustomOutputDir = (customOutputDir: string | null) =>
    setState((s) => ({ ...s, customOutputDir }));

  const setJobName = (jobName: string) =>
    setState((s) => ({ ...s, jobName }));

  const regenerateJobName = () =>
    setState((s) => ({ ...s, jobName: generateJobName() }));

  const setIsRunning = (isRunning: boolean) =>
    setState((s) => ({ ...s, isRunning }));

  const appendLog = (text: string) =>
    setState((s) => ({ ...s, logs: s.logs + text }));

  const clearLogs = () => setState((s) => ({ ...s, logs: '' }));

  const setCurrentPhase = (currentPhase: WorkflowState['currentPhase']) =>
    setState((s) => ({ ...s, currentPhase }));

  const setError = (errorMessage: string | null) =>
    setState((s) => ({ ...s, errorMessage }));

  // MD state setters
  const setMdInputMode = (inputMode: MDInputMode) =>
    setState((s) => ({ ...s, md: { ...s.md, inputMode } }));

  const setMdSingleMoleculeInput = (singleMoleculeInput: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, singleMoleculeInput } }));

  const setMdSingleMoleculeThumbnail = (singleMoleculeThumbnail: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, singleMoleculeThumbnail } }));

  const setMdGninaOutputDir = (gninaOutputDir: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, gninaOutputDir } }));

  const setMdLoadedLigands = (loadedLigands: MDLoadedLigand[]) =>
    setState((s) => ({ ...s, md: { ...s.md, loadedLigands } }));

  const setMdSelectedLigandIndex = (selectedLigandIndex: number | null) =>
    setState((s) => ({ ...s, md: { ...s.md, selectedLigandIndex } }));

  const setMdReceptorPdb = (receptorPdb: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, receptorPdb } }));

  const setMdLigandSdf = (ligandSdf: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, ligandSdf } }));

  const setMdLigandName = (ligandName: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, ligandName } }));

  const setMdJobName = (jobName: string) =>
    setState((s) => ({ ...s, md: { ...s.md, jobName } }));

  const setMdConfig = (config: Partial<MDConfig>) =>
    setState((s) => ({ ...s, md: { ...s.md, config: { ...s.md.config, ...config } } }));

  const setMdOutputDir = (outputDir: string | null) =>
    setState((s) => ({ ...s, md: { ...s.md, outputDir } }));

  const setMdResult = (result: MDResult | null) =>
    setState((s) => ({ ...s, md: { ...s.md, result } }));

  const setMdCurrentStage = (currentStage: MDStage | null) =>
    setState((s) => ({ ...s, md: { ...s.md, currentStage } }));

  const setMdStageProgress = (stageProgress: number) =>
    setState((s) => ({ ...s, md: { ...s.md, stageProgress } }));

  const setMdSystemInfo = (systemInfo: MDSystemInfo | null) =>
    setState((s) => ({ ...s, md: { ...s.md, systemInfo } }));

  const setMdBenchmarkResult = (benchmarkResult: MDBenchmarkResult | null) =>
    setState((s) => ({ ...s, md: { ...s.md, benchmarkResult } }));

  const setMdIsBenchmarking = (isBenchmarking: boolean) =>
    setState((s) => ({ ...s, md: { ...s.md, isBenchmarking } }));

  // Viewer state setters
  const setViewerPdbPath = (pdbPath: string | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, pdbPath } }));

  const setViewerPdbQueue = (pdbQueue: ViewerQueueItem[]) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, pdbQueue, pdbQueueIndex: 0 } }));

  const setViewerPdbQueueIndex = (pdbQueueIndex: number) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, pdbQueueIndex, pdbPath: s.viewer.pdbQueue[pdbQueueIndex]?.pdbPath || s.viewer.pdbPath } }));

  const setViewerLigandPath = (ligandPath: string | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandPath } }));

  const setViewerDetectedLigands = (detectedLigands: DetectedLigand[]) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, detectedLigands } }));

  const setViewerSelectedLigandId = (selectedLigandId: string | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, selectedLigandId } }));

  const setViewerProteinRep = (proteinRep: ProteinRepresentation) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, proteinRep } }));

  const setViewerProteinSurface = (proteinSurface: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, proteinSurface } }));

  const setViewerProteinSurfaceOpacity = (proteinSurfaceOpacity: number) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, proteinSurfaceOpacity } }));

  const setViewerShowPocketResidues = (showPocketResidues: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, showPocketResidues } }));

  const setViewerShowPocketLabels = (showPocketLabels: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, showPocketLabels } }));

  const setViewerHideWaterIons = (hideWaterIons: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, hideWaterIons } }));

  const setViewerSurfaceColorScheme = (surfaceColorScheme: SurfaceColorScheme) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, surfaceColorScheme } }));

  const setViewerProteinCarbonColor = (proteinCarbonColor: string) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, proteinCarbonColor } }));

  const setViewerLigandCarbonColor = (ligandCarbonColor: string) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandCarbonColor } }));

  const setViewerLigandRep = (ligandRep: LigandRepresentation) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandRep } }));

  const setViewerLigandSurface = (ligandSurface: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandSurface } }));

  const setViewerLigandSurfaceOpacity = (ligandSurfaceOpacity: number) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandSurfaceOpacity } }));

  const setViewerShowInteractions = (showInteractions: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, showInteractions } }));

  const setViewerLigandVisible = (ligandVisible: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandVisible } }));

  const setViewerLigandPolarHOnly = (ligandPolarHOnly: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, ligandPolarHOnly } }));

  const setViewerTrajectoryPath = (trajectoryPath: string | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, trajectoryPath } }));

  const setViewerTrajectoryInfo = (trajectoryInfo: TrajectoryInfo | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, trajectoryInfo } }));

  const setViewerCurrentFrame = (currentFrame: number) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, currentFrame } }));

  const setViewerIsPlaying = (isPlaying: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, isPlaying } }));

  const setViewerPlaybackSpeed = (playbackSpeed: PlaybackSpeed) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, playbackSpeed } }));

  const setViewerSmoothing = (smoothing: number) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, smoothing } }));

  const setViewerLoopPlayback = (loopPlayback: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, loopPlayback } }));

  const setViewerCenterTarget = (centerTarget: CenterTarget) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, centerTarget } }));

  const setViewerClusteringConfig = (config: Partial<ClusteringConfig>) =>
    setState((s) => ({
      ...s,
      viewer: { ...s.viewer, clusteringConfig: { ...s.viewer.clusteringConfig, ...config } },
    }));

  const setViewerClusteringResults = (clusteringResults: ClusteringResults | null) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, clusteringResults } }));

  const setViewerIsClustering = (isClustering: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, isClustering } }));

  const setViewerLoadedClusters = (loadedClusters: LoadedCluster[]) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, loadedClusters } }));

  const setViewerIsLoadingClusters = (isLoadingClusters: boolean) =>
    setState((s) => ({ ...s, viewer: { ...s.viewer, isLoadingClusters } }));

  const setViewerClusterVisibility = (clusterId: number, visible: boolean) =>
    setState((s) => ({
      ...s,
      viewer: {
        ...s.viewer,
        loadedClusters: s.viewer.loadedClusters.map((c) =>
          c.clusterId === clusterId ? { ...c, visible } : c
        ),
      },
    }));

  const resetViewer = () =>
    setState((s) => ({
      ...s,
      viewer: { ...defaultViewerState },
    }));

  const resetMd = () =>
    setState((s) => ({
      ...s,
      mdStep: 'md-load',
      logs: '',
      errorMessage: null,
      isRunning: false,
      md: { ...defaultMDState },
    }));

  const reset = () =>
    setState((s) => ({
      mode: s.mode,
      mdStep: 'md-load',
      pdbFile: null,
      customOutputDir: null,
      jobName: '',
      isRunning: false,
      currentPhase: 'idle',
      logs: '',
      errorMessage: null,
      md: { ...defaultMDState },
      viewer: { ...defaultViewerState },
    }));

  return {
    state,
    setMode,
    setMdStep,
    setPdbFile,
    setCustomOutputDir,
    setJobName,
    regenerateJobName,
    setIsRunning,
    setCurrentPhase,
    appendLog,
    clearLogs,
    setError,
    // MD state
    setMdInputMode,
    setMdSingleMoleculeInput,
    setMdSingleMoleculeThumbnail,
    setMdGninaOutputDir,
    setMdLoadedLigands,
    setMdSelectedLigandIndex,
    setMdReceptorPdb,
    setMdLigandSdf,
    setMdLigandName,
    setMdJobName,
    setMdConfig,
    setMdOutputDir,
    setMdResult,
    setMdCurrentStage,
    setMdStageProgress,
    setMdSystemInfo,
    setMdBenchmarkResult,
    setMdIsBenchmarking,
    // Viewer state
    setViewerPdbPath,
    setViewerPdbQueue,
    setViewerPdbQueueIndex,
    setViewerLigandPath,
    setViewerDetectedLigands,
    setViewerSelectedLigandId,
    setViewerProteinRep,
    setViewerProteinSurface,
    setViewerProteinSurfaceOpacity,
    setViewerSurfaceColorScheme,
    setViewerProteinCarbonColor,
    setViewerShowPocketResidues,
    setViewerShowPocketLabels,
    setViewerHideWaterIons,
    setViewerLigandVisible,
    setViewerLigandRep,
    setViewerLigandSurface,
    setViewerLigandSurfaceOpacity,
    setViewerLigandCarbonColor,
    setViewerLigandPolarHOnly,
    setViewerShowInteractions,
    setViewerTrajectoryPath,
    setViewerTrajectoryInfo,
    setViewerCurrentFrame,
    setViewerIsPlaying,
    setViewerPlaybackSpeed,
    setViewerSmoothing,
    setViewerLoopPlayback,
    setViewerCenterTarget,
    setViewerClusteringConfig,
    setViewerClusteringResults,
    setViewerIsClustering,
    setViewerLoadedClusters,
    setViewerIsLoadingClusters,
    setViewerClusterVisibility,
    // Resets
    reset,
    resetMd,
    resetViewer,
  };
}

export const workflowStore = createRoot(createWorkflowStore);
