// Copyright (c) 2026 Ember Contributors. MIT License.
import { Component, Show, For, createSignal } from 'solid-js';
import { workflowStore, ScoreComplexEntry } from '../../stores/workflow';
import { buildScoreRunFolderName, sanitizeConformOutputName } from '../../utils/jobName';
import DropZone from '../shared/DropZone';

const makeScoreEntryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatLigandLabel = (ligand: { resname: string; chain: string; resnum: string }) =>
  ligand.chain ? `${ligand.resname} ${ligand.chain}:${ligand.resnum}` : `${ligand.resname} ${ligand.resnum}`;

const ScoreStepLoad: Component = () => {
  const {
    state,
    addScoreEntries,
    removeScoreEntry,
    setScoreEntries,
    setScoreDescriptor,
    setScoreStep,
    setScoreTrajectoryConfig,
    setError,
  } = workflowStore;
  const api = window.electronAPI;
  const [isScanning, setIsScanning] = createSignal(false);
  const [pdbIdInput, setPdbIdInput] = createSignal('');
  const [isFetching, setIsFetching] = createSignal(false);
  const [numClusters, setNumClusters] = createSignal(10);
  const PREVIEW_DATE = new Date('2026-01-02T03:04:05');
  const runFolderPreview = () =>
    buildScoreRunFolderName(
      state().score.descriptor,
      hasTrajectory() ? 'trajectory' : 'batch',
      PREVIEW_DATE,
    ).replace('20260102-030405', 'YYYYMMDD-HHMMSS');

  const createScoreEntry = (
    filePath: string,
    name: string,
    ligandId: string | null,
    detectedLigands: ScoreComplexEntry['detectedLigands'],
    isPrepared: boolean,
    status: ScoreComplexEntry['status'],
    errorMessage: string | null,
  ): ScoreComplexEntry => ({
    id: makeScoreEntryId(),
    pdbPath: filePath,
    name,
    detectedLigands,
    selectedLigandId: ligandId,
    isPrepared,
    preparedReceptorPath: null,
    extractedLigandSdfPath: null,
    vinaScore: null,
    cordialExpectedPkd: null,
    cordialPHighAffinity: null,
    qed: null,
    status,
    errorMessage,
  });

  const scanFile = async (filePath: string) => {
    const parts = filePath.split('/');
    const baseName = (parts[parts.length - 1] || '').replace(/\.(pdb|cif)$/i, '');
    // Skip if already loaded
    if (state().score.entries.some((e) => e.pdbPath === filePath)) return;

    const placeholderEntry = createScoreEntry(
      filePath,
      baseName,
      null,
      [],
      false,
      'detecting',
      null,
    );

    addScoreEntries([placeholderEntry]);

    try {
      const result = await api.detectPdbLigands(filePath);
      if (result.ok) {
        const ligands = result.value.ligands || [];
        const isPrepared = result.value.structureInfo?.isPrepared ?? false;
        removeScoreEntry(placeholderEntry.id);

        if (ligands.length === 0) {
          addScoreEntries([
            createScoreEntry(filePath, baseName, null, [], isPrepared, 'error', 'No ligand detected'),
          ]);
          return;
        }

        const expandedEntries = ligands.map((ligand) =>
            createScoreEntry(
            filePath,
            ligands.length === 1 ? baseName : `${baseName} - ${formatLigandLabel(ligand)}`,
            ligand.id,
            [ligand],
            isPrepared,
            'pending',
            null,
          ),
        );
        addScoreEntries(expandedEntries);
      } else {
        workflowStore.updateScoreEntry(placeholderEntry.id, {
          status: 'error',
          errorMessage: result.error.message,
        });
      }
    } catch (err) {
      workflowStore.updateScoreEntry(placeholderEntry.id, {
        status: 'error',
        errorMessage: (err as Error).message,
      });
    }
  };

  const handleDcdImport = async (dcdPath: string) => {
    setIsScanning(true);
    setError(null);

    const dir = dcdPath.substring(0, dcdPath.lastIndexOf('/'));
    const parentDir = dir.substring(0, dir.lastIndexOf('/'));

    // Probe for topology (system.pdb)
    let topologyPath: string | null = null;
    for (const candidate of [`${dir}/system.pdb`, `${parentDir}/system.pdb`]) {
      const exists = await api.fileExists(candidate);
      if (exists) { topologyPath = candidate; break; }
    }

    // Probe for ligand SDF
    let ligandSdfPath: string | null = null;
    for (const candidate of [`${parentDir}/inputs/ligand.sdf`, `${dir}/ligand.sdf`]) {
      const exists = await api.fileExists(candidate);
      if (exists) { ligandSdfPath = candidate; break; }
    }

    // If not found, ask user to pick
    if (!topologyPath) {
      topologyPath = await api.selectPdbFile();
      if (!topologyPath) { setIsScanning(false); setError('Topology PDB required for trajectory scoring'); return; }
    }
    if (!ligandSdfPath) {
      const sdfPath = await api.selectSdfFile();
      if (!sdfPath) { setIsScanning(false); setError('Ligand SDF required for trajectory scoring'); return; }
      ligandSdfPath = sdfPath;
    }

    // Validate trajectory
    try {
      const info = await api.getTrajectoryInfo(topologyPath, dcdPath);
      if (!info.ok) { setError(info.error.message); setIsScanning(false); return; }

      setScoreTrajectoryConfig({
        trajectoryPath: dcdPath,
        topologyPath,
        ligandSdfPath,
        numClusters: numClusters(),
        frameCount: info.value.frameCount,
      });
    } catch (err) {
      setError(`Invalid trajectory: ${(err as Error).message}`);
    }
    setIsScanning(false);
  };

  const handleFileDrop = async (paths: string[]) => {
    setIsScanning(true);
    setError(null);

    for (const p of paths) {
      const basename = p.substring(p.lastIndexOf('/') + 1);
      const isDcd = /\.dcd$/i.test(basename);
      const isPdbCif = /\.(pdb|cif)$/i.test(basename);

      if (isDcd) {
        await handleDcdImport(p);
      } else if (isPdbCif) {
        await scanFile(p);
      } else {
        // Assume directory — list PDB files
        try {
          const pdbFiles = await api.listPdbInDirectory(p);
          for (const pdbPath of pdbFiles) {
            await scanFile(pdbPath);
          }
        } catch (err) {
          setError(`Failed to scan directory: ${(err as Error).message}`);
        }
      }
    }
    setIsScanning(false);
  };

  const handleSelectFiles = async () => {
    const paths = await api.selectStructureFilesMulti();
    if (paths && paths.length > 0) {
      handleFileDrop(paths);
    }
  };

  const handleSelectFolder = async () => {
    const dirPath = await api.selectFolder();
    if (dirPath) {
      handleFileDrop([dirPath]);
    }
  };

  const handleFetchPdb = async () => {
    const pdbId = pdbIdInput().trim().toUpperCase();
    if (pdbId.length !== 4) return;
    setIsFetching(true);
    setError(null);
    try {
      const projectDir = state().projectDir;
      if (!projectDir) throw new Error('No project selected');
      const result = await api.fetchPdb(pdbId, projectDir);
      if (result.ok) {
        await scanFile(result.value);
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setIsFetching(false);
  };

  const handleClearAll = () => {
    setScoreEntries([]);
    setError(null);
  };

  const validEntries = () => state().score.entries.filter((e) => e.status !== 'error' && e.selectedLigandId);
  const hasEntries = () => state().score.entries.length > 0;
  const hasTrajectory = () => state().score.trajectoryConfig !== null;
  const canProceed = () => validEntries().length > 0 || hasTrajectory();

  return (
    <div class="h-full flex flex-col">
      <div class="text-center mb-3">
        <h2 class="text-xl font-bold">Score Protein-Ligand Complexes</h2>
        <p class="text-sm text-base-content/90">
          Import PDB complexes or DCD trajectories to score with Vina, CORDIAL, and QED.
        </p>
      </div>

      <div class="max-w-lg w-full self-center mb-3">
        <label class="block">
          <div class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Run descriptor</div>
          <input
            type="text"
            class="input input-bordered input-sm w-full mt-1 font-mono"
            placeholder={hasTrajectory() ? 'trajectory' : 'batch'}
            value={state().score.descriptor}
            onInput={(e) => setScoreDescriptor(sanitizeConformOutputName(e.currentTarget.value))}
          />
        </label>
        <p class="text-[11px] text-base-content/55 font-mono break-all mt-1">
          Run folder: {runFolderPreview()}
        </p>
      </div>

      <div class="flex-1 min-h-0 overflow-auto flex flex-col items-center gap-4">
        <DropZone
          accept={['.pdb', '.cif', '.dcd']}
          acceptFolders
          onFiles={handleFileDrop}
          hoverLabel="Drop PDB/CIF files, a DCD trajectory, or a folder"
        >
        <div class="card bg-base-200 shadow-lg w-full max-w-lg">
          <div class="card-body p-4">
            {/* Trajectory summary card */}
            <Show when={hasTrajectory()}>
              <div class="bg-primary/10 border border-primary/30 rounded-lg p-3 space-y-2 mb-3">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold">Trajectory Loaded</p>
                  <button class="btn btn-ghost btn-xs" onClick={() => setScoreTrajectoryConfig(null)}>Clear</button>
                </div>
                <p class="text-[10px] font-mono text-base-content/70 break-all">
                  {state().score.trajectoryConfig!.trajectoryPath.split('/').pop()}
                </p>
                <div class="flex gap-3 text-[10px] text-base-content/60">
                  <span>{state().score.trajectoryConfig!.frameCount} frames</span>
                  <span>Topology: {state().score.trajectoryConfig!.topologyPath.split('/').pop()}</span>
                  <span>Ligand: {state().score.trajectoryConfig!.ligandSdfPath.split('/').pop()}</span>
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-[10px] text-base-content/70">Clusters:</label>
                  <input
                    type="number"
                    class="input input-bordered input-xs w-16 font-mono"
                    min={2}
                    max={20}
                    value={numClusters()}
                    onInput={(e) => {
                      const v = parseInt(e.currentTarget.value, 10);
                      if (v >= 2 && v <= 20) {
                        setNumClusters(v);
                        setScoreTrajectoryConfig({ ...state().score.trajectoryConfig!, numClusters: v });
                      }
                    }}
                  />
                </div>
              </div>
            </Show>

            <Show
              when={!hasEntries() && !hasTrajectory()}
              fallback={
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-semibold">
                      {state().score.entries.length} target{state().score.entries.length === 1 ? '' : 's'} loaded
                    </p>
                    <div class="flex gap-1">
                      <button class="btn btn-ghost btn-xs" onClick={handleSelectFiles}>+ Files</button>
                      <button class="btn btn-ghost btn-xs" onClick={handleSelectFolder}>+ Folder</button>
                      <button class="btn btn-ghost btn-xs text-error" onClick={handleClearAll}>Clear</button>
                    </div>
                  </div>

                  <Show when={isScanning()}>
                    <div class="text-xs text-base-content/60 flex items-center gap-2">
                      <span class="loading loading-spinner loading-xs" />
                      Scanning for ligands...
                    </div>
                  </Show>

                  <div class="overflow-x-auto max-h-60 overflow-y-auto">
                    <table class="table table-xs table-zebra w-full">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Ligand</th>
                          <th>Atoms</th>
                          <th>Prepared</th>
                          <th class="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        <For each={state().score.entries}>{(entry, i) => {
                          const ligand = () => entry.detectedLigands.find((l) => l.id === entry.selectedLigandId);
                          return (
                            <tr class={entry.status === 'error' ? 'opacity-60' : ''}>
                              <td class="font-mono text-xs">{i() + 1}</td>
                              <td class="text-xs font-medium">{entry.name}</td>
                              <td class="text-xs">
                                <Show when={entry.status === 'detecting'}>
                                  <span class="loading loading-spinner loading-xs" />
                                </Show>
                                <Show when={entry.status === 'error'}>
                                  <span class="badge badge-error badge-xs">None</span>
                                </Show>
                                <Show when={entry.status !== 'detecting' && entry.status !== 'error'}>
                                  {ligand()?.resname || entry.selectedLigandId || '?'}
                                </Show>
                              </td>
                              <td class="text-xs font-mono">{ligand()?.num_atoms ?? '--'}</td>
                              <td class="text-xs">
                                <Show when={entry.isPrepared}>
                                  <span class="badge badge-success badge-xs">Yes</span>
                                </Show>
                                <Show when={!entry.isPrepared && entry.status !== 'error'}>
                                  <span class="badge badge-warning badge-xs">No</span>
                                </Show>
                              </td>
                              <td>
                                <button
                                  class="btn btn-ghost btn-xs btn-square"
                                  onClick={() => removeScoreEntry(entry.id)}
                                  title="Remove"
                                >
                                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        }}</For>
                      </tbody>
                    </table>
                  </div>
                </div>
              }
            >
              <div class="space-y-3">
                <div class="flex gap-2">
                  <button class="btn btn-outline btn-sm flex-1" onClick={handleSelectFiles}>
                    Import PDB Files
                  </button>
                  <button class="btn btn-outline btn-sm flex-1" onClick={handleSelectFolder}>
                    Import Folder
                  </button>
                </div>

                <div class="divider my-0 text-[10px]">OR</div>

                <div class="flex gap-2 items-center">
                  <input
                    class="input input-bordered input-sm flex-1 font-mono uppercase"
                    type="text"
                    placeholder="PDB ID (e.g. 8TCE)"
                    maxLength={4}
                    value={pdbIdInput()}
                    onInput={(e) => setPdbIdInput(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleFetchPdb(); }}
                  />
                  <button
                    class="btn btn-sm btn-outline"
                    onClick={handleFetchPdb}
                    disabled={pdbIdInput().trim().length !== 4 || isFetching()}
                  >
                    {isFetching() ? <span class="loading loading-spinner loading-xs" /> : 'Fetch'}
                  </button>
                </div>

                <p class="text-[10px] text-base-content/60 leading-relaxed">
                  Import PDB or CIF files containing protein-ligand complexes, or fetch by PDB ID from the RCSB.
                </p>
              </div>
            </Show>
          </div>
        </div>
        </DropZone>

        <Show when={state().errorMessage}>
          <div class="alert alert-error py-2 w-full max-w-lg">
            <span class="text-sm">{state().errorMessage}</span>
          </div>
        </Show>
      </div>

      <div class="mt-4 flex items-center gap-3 flex-shrink-0">
        <div class="flex-1 flex items-center gap-2 text-xs text-base-content/85 bg-base-200 rounded-lg px-3 py-2">
          <svg class="w-4 h-4 text-info flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Drop PDB complexes for single-pose scoring, or a DCD trajectory to cluster and score ensemble centroids.
          </span>
        </div>
        <button
          class="btn btn-primary"
          onClick={() => setScoreStep('score-progress')}
          disabled={!canProceed() || isScanning()}
        >
          {hasTrajectory() ? 'Score Trajectory' : `Score ${validEntries().length > 0 ? `(${validEntries().length})` : ''}`}
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ScoreStepLoad;
