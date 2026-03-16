import { Component, Show, For, createSignal } from 'solid-js';
import { workflowStore, ViewerQueueItem } from '../../stores/workflow';
import { useElectronApi } from '../../hooks/useElectronApi';
import { ClusterResultData } from '../../../shared/types/ipc';
import path from 'path';

const MDStepResults: Component = () => {
  const { state, setMode, setViewerPdbPath, setViewerPdbQueue, setViewerTrajectoryPath, resetMd, resetViewer } = workflowStore;
  const api = useElectronApi();

  const [isClustering, setIsClustering] = createSignal(false);
  const [clusterResults, setClusterResults] = createSignal<ClusterResultData[]>([]);
  const [clusterError, setClusterError] = createSignal<string | null>(null);

  const result = () => state().md.result;
  const systemInfo = () => state().md.systemInfo;
  const jobName = () => state().jobName.trim() || 'job';
  const isLigandOnly = () => state().md.inputMode === 'ligand_only';

  const runClustering = async () => {
    if (!result()) return;

    setIsClustering(true);
    setClusterError(null);

    const outputDir = path.dirname(result()!.trajectoryPath);
    const clusterDir = path.join(outputDir, 'clustering');

    try {
      const clusterResult = await api.clusterTrajectory({
        topologyPath: result()!.systemPdbPath,
        trajectoryPath: result()!.trajectoryPath,
        numClusters: 5,
        method: 'kmeans',
        rmsdSelection: isLigandOnly() ? 'all' : 'ligand',
        stripWaters: true,
        outputDir: clusterDir,
      });

      if (clusterResult.ok) {
        setClusterResults(clusterResult.value.clusters);
        console.log('[MD Results] Clustering complete:', clusterResult.value.clusters.length, 'clusters');
      } else {
        setClusterError(clusterResult.error.message);
        console.error('[MD Results] Clustering failed:', clusterResult.error.message);
      }
    } catch (err) {
      setClusterError((err as Error).message);
    } finally {
      setIsClustering(false);
    }
  };

  const openInViewer = (pdbPath: string) => {
    setViewerPdbQueue([]);
    setViewerTrajectoryPath(null);
    setViewerPdbPath(pdbPath);
    setMode('viewer');
  };

  const openClustersInViewer = () => {
    const clusters = clusterResults().filter(c => c.centroidPdbPath);
    if (clusters.length === 0) return;

    const queue: ViewerQueueItem[] = clusters.map(c => ({
      pdbPath: c.centroidPdbPath!,
      label: `Cluster ${c.clusterId + 1} (${c.population.toFixed(0)}%)`,
    }));

    setViewerTrajectoryPath(null);
    setViewerPdbQueue(queue);
    setViewerPdbPath(queue[0].pdbPath);
    setMode('viewer');
  };

  const openTrajectoryInViewer = () => {
    if (!result()) return;
    setViewerPdbQueue([]);
    setViewerPdbPath(result()!.systemPdbPath);
    setViewerTrajectoryPath(result()!.trajectoryPath);
    setMode('viewer');
  };

  const handleOpenFolder = () => {
    if (result()) {
      const dir = path.dirname(result()!.trajectoryPath);
      api.openFolder(dir);
    }
  };

  const handleNewSimulation = () => {
    resetMd();
  };

  return (
    <div class="h-full flex flex-col">
      {/* Title */}
      <div class="text-center mb-3">
        <h2 class="text-xl font-bold">Simulation Complete</h2>
        <p class="text-sm text-base-content/90">
          {isLigandOnly() ? 'Ligand-only' : 'Protein-ligand'} MD simulation finished
        </p>
      </div>

      {/* Main content */}
      <div class="flex-1 grid grid-cols-3 gap-3 min-h-0">
        {/* Left column - Summary */}
        <div class="card bg-base-200 shadow-lg">
          <div class="card-body p-4">
            <h3 class="text-sm font-semibold mb-2">Summary</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between py-1 border-b border-base-300">
                <span class="text-base-content/85">Duration</span>
                <span class="font-mono font-medium">{state().md.config.productionNs} ns</span>
              </div>
              <Show when={systemInfo()}>
                <div class="flex justify-between py-1 border-b border-base-300">
                  <span class="text-base-content/85">Atoms</span>
                  <span class="font-mono">{systemInfo()!.atomCount.toLocaleString()}</span>
                </div>
              </Show>
              <div class="flex justify-between py-1 border-b border-base-300">
                <span class="text-base-content/85">Ligand</span>
                <span class="font-mono">{state().md.ligandName || 'Unknown'}</span>
              </div>
              <Show when={state().md.benchmarkResult}>
                <div class="flex justify-between py-1">
                  <span class="text-base-content/85">Performance</span>
                  <span class="font-mono">{state().md.benchmarkResult!.nsPerDay.toFixed(1)} ns/day</span>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Middle column - Output files */}
        <div class="card bg-base-200 shadow-lg overflow-y-auto">
          <div class="card-body p-4">
            <h3 class="text-sm font-semibold mb-2">Output Files</h3>
            <Show when={result()}>
              <div class="space-y-1.5">
                {/* System PDB */}
                <div class="flex items-center gap-2 p-1.5 bg-base-300 rounded">
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-medium truncate">{jobName()}_system.pdb</p>
                    <p class="text-[9px] text-base-content/60">Full solvated system</p>
                  </div>
                  <button
                    class="btn btn-ghost btn-xs"
                    onClick={() => openInViewer(result()!.systemPdbPath)}
                    title="Open in 3D Viewer"
                  >
                    View
                  </button>
                </div>

                {/* Final PDB */}
                <div class="flex items-center gap-2 p-1.5 bg-base-300 rounded">
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-medium truncate">{jobName()}_final.pdb</p>
                    <p class="text-[9px] text-base-content/60">Final production frame</p>
                  </div>
                  <button
                    class="btn btn-ghost btn-xs"
                    onClick={() => openInViewer(result()!.finalPdbPath)}
                    title="Open in 3D Viewer"
                  >
                    View
                  </button>
                </div>

                {/* Trajectory */}
                <div class="flex items-center gap-2 p-1.5 bg-base-300 rounded">
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-medium truncate">{jobName()}_trajectory.dcd</p>
                    <p class="text-[9px] text-base-content/60">Full trajectory</p>
                  </div>
                  <button
                    class="btn btn-ghost btn-xs"
                    onClick={openTrajectoryInViewer}
                    title="Play in 3D Viewer"
                  >
                    Play
                  </button>
                </div>

                {/* Energy CSV */}
                <div class="flex items-center gap-2 p-1.5 bg-base-300 rounded">
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-medium truncate">{jobName()}_energy.csv</p>
                    <p class="text-[9px] text-base-content/60">Energy, temperature, volume</p>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Right column - Cluster analysis */}
        <div class="card bg-base-200 shadow-lg overflow-y-auto">
          <div class="card-body p-4">
            <h3 class="text-sm font-semibold mb-2">Conformer Clusters</h3>

            {/* Run clustering button (not auto) */}
            <Show when={!isClustering() && clusterResults().length === 0 && !clusterError()}>
              <div class="flex-1 flex items-center justify-center">
                <button class="btn btn-primary btn-sm" onClick={runClustering}>
                  Run Clustering
                </button>
              </div>
            </Show>

            <Show when={isClustering()}>
              <div class="flex-1 flex items-center justify-center">
                <div class="text-center">
                  <span class="loading loading-spinner loading-sm text-primary"></span>
                  <p class="text-[10px] text-base-content/60 mt-2">Clustering trajectory...</p>
                </div>
              </div>
            </Show>

            <Show when={clusterError()}>
              <div class="text-[10px] text-error p-2 bg-error/10 rounded mb-2">
                {clusterError()}
              </div>
              <button class="btn btn-ghost btn-xs" onClick={runClustering}>
                Retry
              </button>
            </Show>

            <Show when={clusterResults().length > 0}>
              <div class="space-y-1.5">
                <For each={clusterResults()}>
                  {(cluster) => (
                    <div class="flex items-center gap-2 p-1.5 bg-base-300 rounded">
                      <div class="w-6 h-6 rounded bg-primary text-primary-content flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {cluster.clusterId + 1}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-medium">
                          Cluster {cluster.clusterId + 1}
                          <span class="text-base-content/60 font-normal ml-1">
                            ({cluster.population.toFixed(0)}%)
                          </span>
                        </p>
                        <p class="text-[9px] text-base-content/60">
                          {cluster.frameCount} frames
                        </p>
                      </div>
                    </div>
                  )}
                </For>

                {/* Single view button for all clusters */}
                <button
                  class="btn btn-primary btn-sm w-full mt-2"
                  onClick={openClustersInViewer}
                >
                  View All Clusters
                </button>

                <p class="text-[9px] text-base-content/60 mt-1">
                  K-means clustering by {isLigandOnly() ? 'all atom' : 'ligand'} RMSD. Use arrows in viewer to browse centroids.
                </p>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div class="flex justify-between mt-3">
        <button class="btn btn-outline btn-sm" onClick={handleOpenFolder}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          Open Folder
        </button>

        <button class="btn btn-primary btn-sm" onClick={handleNewSimulation}>
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
