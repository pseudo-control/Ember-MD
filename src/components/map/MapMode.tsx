import { Component, Show, For, createSignal, onCleanup } from 'solid-js';
import type { MapMethod } from '../../stores/workflow';
import { workflowStore } from '../../stores/workflow';
import type { DetectedLigand } from '../../../shared/types/dock';

interface MethodCard {
  id: MapMethod;
  name: string;
  subtitle: string;
  description: string;
  requires: string;
  time: string;
  needsMd: boolean;
}

const METHODS: MethodCard[] = [
  {
    id: 'static',
    name: 'Pocket Properties',
    subtitle: 'SiteMap-style',
    description:
      'Energy-based scoring of the binding pocket surface. Computes Lennard-Jones + electrostatic potential at each grid point to determine hydrophobic, H-bond donor, and acceptor character. Single unified map colored by dominant interaction type.',
    requires: 'PDB with bound ligand',
    time: '~5 seconds',
    needsMd: false,
  },
  {
    id: 'solvation',
    name: 'Water Thermodynamics',
    subtitle: 'WaterMap / GIST',
    description:
      'Analyzes water molecule behavior from an MD trajectory using Grid Inhomogeneous Solvation Theory. Identifies thermodynamically unfavorable hydration sites where ligand expansion would gain binding affinity. Shows both what to put where and how much you would gain.',
    requires: 'MD trajectory (or runs 2-5 ns simulation)',
    time: '~2-10 min (analysis) or ~30-60 min (with MD)',
    needsMd: true,
  },
  {
    id: 'probe',
    name: 'Fragment Mapping',
    subtitle: 'SILCS-style',
    description:
      'Competitive probe saturation: runs MD with the protein soaked in a mixture of small probe molecules (benzene, methanol, formamide, etc.). Probes compete for binding sites, generating Grid Free Energy maps that show where each functional group type prefers to bind.',
    requires: 'Runs dedicated ~2 ns probe simulation',
    time: '~2-4 hours',
    needsMd: true,
  },
];

const MapMode: Component = () => {
  const {
    state,
    setMapMethod,
    setMapIsComputing,
    setMapProgress,
    setMapError,
    setMapShowMdConfirm,
    openViewerSession,
  } = workflowStore;

  const [hoveredMethod, setHoveredMethod] = createSignal<MapMethod | null>(null);

  // Local structure state — fully independent of viewer
  const [localPdbPath, setLocalPdbPath] = createSignal<string | null>(null);
  const [localLigands, setLocalLigands] = createSignal<DetectedLigand[]>([]);
  const [localSelectedLigandId, setLocalSelectedLigandId] = createSignal<string | null>(null);
  const [isDetecting, setIsDetecting] = createSignal(false);

  // Track active listener cleanup to prevent leaks on unmount or rapid re-invocation
  let activeListenerCleanup: (() => void) | null = null;
  onCleanup(() => { activeListenerCleanup?.(); activeListenerCleanup = null; });

  const map = () => state().map;
  // Use viewer trajectory if available (loaded from a prior simulation)
  const hasTrajectory = () => !!state().viewer.trajectoryPath;

  const hasPdb = () => !!localPdbPath();
  const hasLigand = () => !!localSelectedLigandId();

  const pdbName = () => {
    const p = localPdbPath();
    if (!p) return null;
    return p.split('/').pop() || p;
  };

  const selectedLigand = () =>
    localLigands().find((l) => l.id === localSelectedLigandId()) ?? null;

  const handleSelectPdb = async () => {
    const api = window.electronAPI;
    const path = await api.selectPdbFile();
    if (!path) return;

    setLocalPdbPath(path);
    setLocalLigands([]);
    setLocalSelectedLigandId(null);
    setIsDetecting(true);
    setMapError(null);

    try {
      const result = await api.detectPdbLigands(path);
      if (result.ok && result.value.length > 0) {
        setLocalLigands(result.value);
        setLocalSelectedLigandId(result.value[0].id);
      }
    } catch (err) {
      console.error('[Map] Failed to detect ligands:', err);
    } finally {
      setIsDetecting(false);
    }
  };

  const canCompute = (method: MapMethod) => {
    if (!hasPdb() || !hasLigand()) return false;
    return true;
  };

  /** Derive output dir from the PDB path (~/Ember/{project}/...) */
  const getOutputDir = (method: MapMethod): string => {
    const pdb = localPdbPath();
    if (!pdb) return '';
    const emberIdx = pdb.indexOf('/Ember/');
    if (emberIdx >= 0) {
      const afterEmber = pdb.substring(emberIdx + 7);
      const projectName = afterEmber.split('/')[0];
      const projectRoot = pdb.substring(0, emberIdx + 7) + projectName;
      return `${projectRoot}/surfaces/pocket_map_${method}`;
    }
    const dir = pdb.replace(/\/[^/]+$/, '');
    return `${dir}/pocket_map_${method}`;
  };

  const estimateMdTime = (): number => {
    const info = state().md.systemInfo;
    if (info?.atomCount) {
      return Math.max(5, Math.round((info.atomCount / 20000) * 30));
    }
    return 30;
  };

  const handleCompute = (method: MapMethod) => {
    setMapMethod(method);
    setMapError(null);

    if (method !== 'static' && !hasTrajectory()) {
      const est = method === 'probe' ? estimateMdTime() * 4 : estimateMdTime();
      setMapShowMdConfirm(true, est);
      return;
    }

    runComputation(method);
  };

  const handleConfirmMd = () => {
    setMapShowMdConfirm(false);
    const method = map().method;
    if (method === 'solvation') {
      runMdThenComputation(method);
    } else {
      runComputation(method);
    }
  };

  const handleCancelMd = () => {
    setMapShowMdConfirm(false);
  };

  const runMdThenComputation = async (method: MapMethod) => {
    const api = window.electronAPI;
    const pdb = localPdbPath();
    const lig = selectedLigand();
    if (!lig || !pdb) return;

    setMapIsComputing(true);
    setMapProgress('Running short MD simulation for water analysis...', 5);

    activeListenerCleanup?.();
    const cleanup = api.onMdOutput((data) => {
      if (data.data.includes('PROGRESS:')) {
        const msg = data.data.replace(/.*PROGRESS:\s*/, '').trim();
        const pctMatch = msg.match(/(\d+)%/);
        if (pctMatch) {
          setMapProgress(msg, Math.min(50, parseInt(pctMatch[1]) / 2));
        } else {
          setMapProgress(msg);
        }
      }
    });
    activeListenerCleanup = cleanup;

    try {
      const outputDir = getOutputDir(method);
      const mdOutputDir = outputDir + '/md_temp';

      const mdResult = await api.runMdSimulation(
        pdb,
        lig.id,
        mdOutputDir,
        { productionNs: 2, forceFieldPreset: 'ff14sb-tip3p' } as any,
      );

      if (!mdResult.ok) {
        setMapError(`MD simulation failed: ${mdResult.error.message}`);
        return;
      }

      setMapProgress('Running GIST analysis on trajectory...', 55);
      const trajectoryPath = `${mdOutputDir}/trajectory.dcd`;
      const systemPdb = `${mdOutputDir}/system.pdb`;

      const result = await api.computePocketMap({
        method: 'solvation',
        pdbPath: systemPdb,
        ligandResname: lig.resname,
        ligandResnum: parseInt(lig.resnum as string),
        outputDir,
        trajectoryPath,
      });

      if (result.ok) {
        loadMapResult(result.value, method);
      } else {
        setMapError(result.error.message);
      }
    } catch (err) {
      setMapError((err as Error).message);
    } finally {
      cleanup();
      activeListenerCleanup = null;
      setMapIsComputing(false);
    }
  };

  const runComputation = async (method: MapMethod) => {
    const api = window.electronAPI;
    const pdb = localPdbPath();
    const lig = selectedLigand();

    if (!lig || !pdb) {
      setMapError('No PDB or ligand selected');
      return;
    }

    setMapIsComputing(true);
    setMapProgress('Initializing...', 0);

    activeListenerCleanup?.();
    const cleanup = api.onMdOutput((data) => {
      if (data.data.includes('PROGRESS:')) {
        const msg = data.data.replace(/.*PROGRESS:\s*/, '').trim();
        const pctMatch = msg.match(/(\d+)%/);
        if (pctMatch) {
          setMapProgress(msg, parseInt(pctMatch[1]));
        } else {
          setMapProgress(msg);
        }
      }
    });
    activeListenerCleanup = cleanup;

    try {
      const outputDir = getOutputDir(method);
      const trajectoryPath = state().viewer.trajectoryPath || undefined;

      const result = await api.computePocketMap({
        method,
        pdbPath: pdb,
        ligandResname: lig.resname,
        ligandResnum: parseInt(lig.resnum as string),
        outputDir,
        trajectoryPath: method === 'solvation' ? trajectoryPath : undefined,
      });

      if (result.ok) {
        loadMapResult(result.value, method);
      } else {
        setMapError(result.error.message);
      }
    } catch (err) {
      setMapError((err as Error).message);
    } finally {
      cleanup();
      activeListenerCleanup = null;
      setMapIsComputing(false);
    }
  };

  const loadMapResult = (result: any, method: MapMethod) => {
    openViewerSession({
      pdbPath: localPdbPath(),
      bindingSiteMap: {
      hydrophobic: { visible: true, isolevel: 0.3, opacity: 0.7 },
      hbondDonor: { visible: true, isolevel: 0.3, opacity: 0.7 },
      hbondAcceptor: { visible: true, isolevel: 0.3, opacity: 0.7 },
      hydrophobicDx: result.hydrophobicDx,
      hbondDonorDx: result.hbondDonorDx,
      hbondAcceptorDx: result.hbondAcceptorDx,
      hotspots: result.hotspots || [],
      method,
      },
    });
    setMapProgress('Done', 100);
  };

  return (
    <div class="h-full flex flex-col gap-4">

      {/* Structure loader */}
      <div class="flex items-center gap-3 flex-wrap">
        <Show
          when={hasPdb()}
          fallback={
            <button class="btn btn-primary btn-sm gap-2" onClick={handleSelectPdb}>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Load Structure
            </button>
          }
        >
          <button
            class="btn btn-ghost btn-sm gap-2 font-mono"
            onClick={handleSelectPdb}
            title="Load a different structure"
          >
            <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {pdbName()}
          </button>

          {/* Ligand selector */}
          <Show when={isDetecting()} fallback={
            <Show when={localLigands().length > 0}>
              <div class="flex items-center gap-2">
                <span class="text-xs text-base-content/50 font-semibold">Ligand</span>
                <Show
                  when={localLigands().length === 1}
                  fallback={
                    <select
                      class="select select-bordered select-sm font-mono text-xs"
                      value={localSelectedLigandId() ?? ''}
                      onChange={(e) => setLocalSelectedLigandId(e.currentTarget.value)}
                    >
                      <For each={localLigands()}>
                        {(lig) => (
                          <option value={lig.id}>
                            {lig.resname} {lig.resnum} ({lig.num_atoms} atoms)
                          </option>
                        )}
                      </For>
                    </select>
                  }
                >
                  <span class="badge badge-ghost font-mono">
                    {selectedLigand()?.resname} {selectedLigand()?.resnum}
                  </span>
                </Show>
              </div>
            </Show>
          }>
            <span class="flex items-center gap-1.5 text-xs text-base-content/50">
              <span class="loading loading-spinner loading-xs" />
              Detecting ligands...
            </span>
          </Show>

          <Show when={!isDetecting() && localLigands().length === 0 && hasPdb()}>
            <span class="text-xs text-warning">No ligands detected in this structure</span>
          </Show>

          <Show when={hasTrajectory()}>
            <span class="badge badge-sm badge-success badge-outline gap-1 ml-auto">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              MD trajectory available
            </span>
          </Show>
        </Show>
      </div>

      {/* Method cards */}
      <div class="grid grid-cols-3 gap-3 flex-1 min-h-0">
        <For each={METHODS}>
          {(method) => {
            const isSelected = () => map().method === method.id;
            const isHovered = () => hoveredMethod() === method.id;
            const disabled = () => !canCompute(method.id) || map().isComputing;

            return (
              <div
                class={`card bg-base-200 border-2 transition-all cursor-pointer flex flex-col ${
                  isSelected()
                    ? 'border-primary shadow-lg'
                    : isHovered() && !disabled()
                      ? 'border-base-content/20'
                      : 'border-transparent'
                } ${disabled() ? 'opacity-50 cursor-not-allowed' : ''}`}
                onMouseEnter={() => !disabled() && setHoveredMethod(method.id)}
                onMouseLeave={() => setHoveredMethod(null)}
                onClick={() => !disabled() && setMapMethod(method.id)}
              >
                <div class="card-body p-4 flex flex-col gap-3 flex-1">
                  {/* Header */}
                  <div>
                    <h3 class="text-sm font-bold">{method.name}</h3>
                    <p class="text-[10px] text-primary font-medium">
                      {method.subtitle}
                    </p>
                  </div>

                  {/* Description */}
                  <p class="text-xs text-base-content/70 flex-1 leading-relaxed">
                    {method.description}
                  </p>

                  {/* Requirements */}
                  <div class="space-y-1.5">
                    <div class="flex items-start gap-1.5">
                      <Show
                        when={
                          !method.needsMd ||
                          (method.id === 'solvation' && hasTrajectory())
                        }
                        fallback={
                          <svg class="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        }
                      >
                        <svg class="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                      </Show>
                      <span class="text-[11px] text-base-content/60">
                        {method.requires}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <svg class="w-3.5 h-3.5 text-base-content/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span class="text-[11px] text-base-content/60">
                        {method.time}
                      </span>
                    </div>
                  </div>

                  {/* Compute button */}
                  <button
                    class={`btn btn-sm w-full mt-auto ${
                      isSelected() ? 'btn-primary' : 'btn-ghost'
                    }`}
                    disabled={disabled()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompute(method.id);
                    }}
                  >
                    <Show
                      when={!(map().isComputing && isSelected())}
                      fallback={
                        <>
                          <span class="loading loading-spinner loading-xs" />
                          Computing...
                        </>
                      }
                    >
                      {method.needsMd && !hasTrajectory()
                        ? 'Run Simulation + Map'
                        : 'Compute Map'}
                    </Show>
                  </button>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* Progress bar */}
      <Show when={map().isComputing}>
        <div class="flex items-center gap-3">
          <progress
            class="progress progress-primary flex-1"
            value={map().progressPct}
            max="100"
          />
          <span class="text-xs text-base-content/60 min-w-[100px] text-right">
            {map().progress}
          </span>
        </div>
      </Show>

      {/* Error */}
      <Show when={map().error}>
        <div class="alert alert-error py-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-xs">{map().error}</span>
        </div>
      </Show>

      {/* MD Confirmation Modal */}
      <Show when={map().showMdConfirm}>
        <div class="modal modal-open">
          <div class="modal-box max-w-sm">
            <h3 class="font-bold text-sm mb-3">Run MD Simulation?</h3>
            <p class="text-xs text-base-content/70 mb-3">
              <Show
                when={map().method === 'probe'}
                fallback={
                  <>
                    Water thermodynamics analysis requires an MD trajectory.
                    No trajectory is currently loaded, so a short <strong>2-5 ns</strong> explicit-water
                    simulation will be run first.
                  </>
                }
              >
                Fragment mapping requires a dedicated simulation with probe molecules
                soaked around the protein. This runs a <strong>~2 ns</strong> SILCS-style
                competitive saturation MD.
              </Show>
            </p>

            <div class="bg-base-200 rounded-lg p-3 mb-4">
              <div class="flex items-center justify-between">
                <span class="text-xs text-base-content/60">Estimated time</span>
                <span class="text-sm font-mono font-bold">
                  ~{map().estimatedTimeMin} min
                </span>
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xs text-base-content/60">GPU</span>
                <span class="text-xs font-mono">
                  Metal / OpenCL (Apple Silicon)
                </span>
              </div>
            </div>

            <p class="text-xs text-base-content/50 mb-4">
              The simulation will use the same force field and parameters as
              Simulate mode. Results are saved to the project's surfaces/ directory.
            </p>

            <div class="modal-action">
              <button class="btn btn-sm" onClick={handleCancelMd}>
                Cancel
              </button>
              <button class="btn btn-sm btn-primary" onClick={handleConfirmMd}>
                Run Simulation
              </button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={handleCancelMd} />
        </div>
      </Show>
    </div>
  );
};

export default MapMode;
