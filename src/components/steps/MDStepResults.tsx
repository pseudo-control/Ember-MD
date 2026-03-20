import { Component, Show, For, createSignal } from 'solid-js';
import { workflowStore, ViewerQueueItem } from '../../stores/workflow';
import { ClusterResultData } from '../../../shared/types/ipc';
import path from 'path';

const MDStepResults: Component = () => {
  const { state, openViewerSession, resetMd } = workflowStore;
  const api = window.electronAPI;

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = createSignal(false);
  const [analysisProgress, setAnalysisProgress] = createSignal(0);
  const [analysisStep, setAnalysisStep] = createSignal('');
  const [reportPath, setReportPath] = createSignal<string | null>(null);
  const [analysisDir, setAnalysisDir] = createSignal<string | null>(null);
  const [analysisError, setAnalysisError] = createSignal<string | null>(null);
  const [clusterResults, setClusterResults] = createSignal<ClusterResultData[]>([]);

  const result = () => state().md.result;
  const systemInfo = () => state().md.systemInfo;
  const jobName = () => state().jobName.trim() || 'job';

  const stepNames: Record<string, string> = {
    'analyze_contacts': 'Computing contacts...',
    'analyze_rmsd': 'RMSD analysis...',
    'analyze_rmsf': 'RMSF analysis...',
    'analyze_sse': 'Secondary structure...',
    'analyze_hbonds': 'H-bond analysis...',
    'analyze_ligand_props': 'Ligand properties...',
    'analyze_torsions': 'Torsion analysis...',
    'clustering': 'Clustering trajectory...',
    'compile_pdf': 'Compiling report...',
    'done': 'Complete',
  };

  const runAnalysis = async () => {
    if (!result()) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(0);
    setAnalysisStep('Starting analysis...');
    setReportPath(null);
    setClusterResults([]);

    const outputDir = path.dirname(result()!.trajectoryPath);
    const analysisOutputDir = path.join(outputDir, 'analysis');

    const cleanup = api.onMdOutput((data) => {
      const text = data.data;
      const progressMatch = text.match(/PROGRESS:(\w+):(\d+)/);
      if (progressMatch) {
        const step = progressMatch[1];
        const pct = parseInt(progressMatch[2], 10);
        setAnalysisProgress(pct);
        setAnalysisStep(stepNames[step] || step);
      }
    });

    try {
      const simInfo: Record<string, string> = {};
      const si = systemInfo();
      if (si) simInfo.atoms = si.atomCount.toLocaleString();
      simInfo.temperature = `${state().md.config.temperatureK} K`;
      simInfo.duration = `${state().md.config.productionNs} ns`;
      simInfo.forceField = state().md.config.forceFieldPreset || 'ff19SB/OPC';
      if (state().md.benchmarkResult) {
        simInfo.performance = `${state().md.benchmarkResult!.nsPerDay.toFixed(1)} ns/day`;
      }
      simInfo.jobName = jobName();

      const reportResult = await api.generateMdReport({
        topologyPath: result()!.systemPdbPath,
        trajectoryPath: result()!.trajectoryPath,
        outputDir: analysisOutputDir,
        ligandSelection: undefined,
        simInfo,
      });

      if (reportResult.ok) {
        setReportPath(reportResult.value.reportPath);
        setAnalysisDir(reportResult.value.analysisDir);
        if (reportResult.value.clusteringResults) {
          setClusterResults(reportResult.value.clusteringResults);
        }
        setAnalysisProgress(100);
        setAnalysisStep('Complete');
      } else {
        setAnalysisError(reportResult.error.message);
      }
    } catch (err) {
      setAnalysisError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
      cleanup();
    }
  };

  const openReport = () => {
    const rp = reportPath();
    if (rp) api.openFolder(rp);
  };

  const openTrajectoryInViewer = () => {
    if (!result()) return;
    openViewerSession({
      pdbPath: result()!.systemPdbPath,
      trajectoryPath: result()!.trajectoryPath,
    });
  };

  const openClustersInViewer = () => {
    const clusters = clusterResults().filter(c => c.centroidPdbPath);
    if (clusters.length === 0) return;
    const queue: ViewerQueueItem[] = clusters.map(c => ({
      pdbPath: c.centroidPdbPath!,
      label: `Cluster ${c.clusterId + 1} (${c.population.toFixed(0)}%)`,
    }));
    openViewerSession({
      pdbPath: queue[0].pdbPath,
      pdbQueue: queue,
      pdbQueueIndex: 0,
    });
  };

  const handleOpenFolder = () => {
    if (result()) {
      const dir = path.dirname(result()!.trajectoryPath);
      api.openFolder(dir);
    }
  };

  return (
    <div class="h-full flex flex-col">
      {/* Title */}
      <div class="text-center mb-4">
        <h2 class="text-xl font-bold">Simulation Complete</h2>
        <div class="flex justify-center gap-3 mt-1 text-xs text-base-content/70">
          <span>{state().md.config.productionNs} ns</span>
          <Show when={systemInfo()}>
            <span>{systemInfo()!.atomCount.toLocaleString()} atoms</span>
          </Show>
          <Show when={state().md.benchmarkResult}>
            <span>{state().md.benchmarkResult!.nsPerDay.toFixed(1)} ns/day</span>
          </Show>
        </div>
      </div>

      {/* Main content: two rows */}
      <div class="flex-1 flex flex-col gap-3 min-h-0">
        {/* Row 1: Quick actions */}
        <div class="flex gap-2 justify-center">
          <button class="btn btn-primary btn-sm" onClick={openTrajectoryInViewer}>
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Play Trajectory
          </button>
          <Show when={!reportPath() && !isAnalyzing()}>
            <button class="btn btn-outline btn-sm" onClick={runAnalysis}>
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Run Analysis
            </button>
          </Show>
          <Show when={reportPath()}>
            <button class="btn btn-outline btn-sm" onClick={openReport}>
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Open Report
            </button>
          </Show>
        </div>

        {/* Analysis progress */}
        <Show when={isAnalyzing()}>
          <div class="flex items-center gap-3 px-4">
            <span class="loading loading-spinner loading-xs text-primary" />
            <progress class="progress progress-primary flex-1" value={analysisProgress()} max="100" />
            <span class="text-xs text-base-content/60 min-w-[120px] text-right">{analysisStep()}</span>
          </div>
        </Show>

        {/* Analysis error */}
        <Show when={analysisError() && !isAnalyzing()}>
          <div class="alert alert-error py-2 mx-4">
            <span class="text-xs">{analysisError()}</span>
            <button class="btn btn-ghost btn-xs" onClick={runAnalysis}>Retry</button>
          </div>
        </Show>

        {/* Cluster results (shown after analysis) */}
        <Show when={clusterResults().length > 0}>
          <div class="px-4">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-semibold">Clusters</span>
              <button class="btn btn-outline btn-xs" onClick={openClustersInViewer}>
                View in 3D
              </button>
            </div>
            <div class="flex gap-1.5 flex-wrap">
              <For each={clusterResults()}>
                {(cluster) => (
                  <div class="badge badge-lg gap-1.5">
                    <div class="w-3 h-3 rounded-full bg-primary" />
                    <span class="text-xs font-mono">{cluster.population.toFixed(0)}%</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      {/* Bottom actions */}
      <div class="flex justify-between mt-3">
        <button class="btn btn-ghost btn-sm" onClick={handleOpenFolder}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          Open Folder
        </button>
        <button class="btn btn-primary btn-sm" onClick={() => resetMd()}>
          New Simulation
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MDStepResults;
