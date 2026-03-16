import { Component, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { workflowStore } from '../../stores/workflow';
import { useElectronApi } from '../../hooks/useElectronApi';
import { useMdOutput } from '../../hooks/useElectronApi';
import { MD_COMMON_PARAMS, MD_PRESET_PARAMS } from '../../../shared/types/md';
import { buildMdFolderName } from '../../utils/jobName';

const MDStepConfigure: Component = () => {
  const {
    state,
    setMdConfig,
    setMdStep,
    setMdBenchmarkResult,
    setMdIsBenchmarking,
    setMdSystemInfo,
  } = workflowStore;
  const api = useElectronApi();
  const [benchmarkStatus, setBenchmarkStatus] = createSignal<string | null>(null);
  const [showProtocol, setShowProtocol] = createSignal(false);
  // Track inputs used for last benchmark to enable caching
  const [lastBenchmarkInputs, setLastBenchmarkInputs] = createSignal<{
    ligandSdf: string;
    receptorPdb: string | null;
    preset: string;
    ligandOnly: boolean;
  } | null>(null);

  // Listen for MD output during benchmarking to show progress
  useMdOutput((data) => {
    // Always log MD output to console for debugging
    console.log(`[MD ${data.type}]`, data.data.trim());

    if (!state().md.isBenchmarking) return;
    const text = data.data;

    // Parse PROGRESS lines for user-friendly status
    const progressMatch = text.match(/PROGRESS:(\w+):(\S+)/);
    if (progressMatch) {
      const stage = progressMatch[1];
      if (stage === 'building') setBenchmarkStatus('Building system...');
      else if (stage === 'parameterizing') {
        // Parse atom count from PROGRESS:parameterizing:0:59
        const atomMatch = text.match(/PROGRESS:parameterizing:\d+:(\d+)/);
        const atoms = atomMatch ? parseInt(atomMatch[1]) : 0;
        const est = atoms <= 20 ? '< 10s' : atoms <= 30 ? '~10-30s' : atoms <= 40 ? '~30s-2min' : atoms <= 50 ? '~1-4min' : atoms <= 65 ? '~2-6min' : '~5min+';
        setBenchmarkStatus(atoms ? `Computing AM1-BCC charges (${atoms} atoms, est. ${est})...` : 'Computing AM1-BCC charges...');
      }
      else if (stage === 'benchmark') setBenchmarkStatus('Running benchmark...');
    }

    // Parse SYSTEM_INFO
    const sysMatch = text.match(/SYSTEM_INFO:(\d+):(\d+)/);
    if (sysMatch) {
      setBenchmarkStatus(`System: ${parseInt(sysMatch[1]).toLocaleString()} atoms`);
    }
  });

  // Compute the output folder name reactively
  const outputFolderName = createMemo(() => {
    return buildMdFolderName(state().jobName, {
      forceFieldPreset: state().md.config.forceFieldPreset,
      temperatureK: MD_COMMON_PARAMS.temperature,
      productionNs: state().md.config.productionNs,
    });
  });

  const isLigandOnly = () => state().md.inputMode === 'ligand_only';

  const handleRunBenchmark = async () => {
    if (!state().md.ligandSdf) return;
    if (!isLigandOnly() && !state().md.receptorPdb) return;

    // Check if we already have a cached benchmark for the same inputs
    const currentInputs = {
      ligandSdf: state().md.ligandSdf!,
      receptorPdb: state().md.receptorPdb,
      preset: state().md.config.forceFieldPreset,
      ligandOnly: isLigandOnly(),
    };
    const cached = lastBenchmarkInputs();
    if (cached && state().md.benchmarkResult &&
        cached.ligandSdf === currentInputs.ligandSdf &&
        cached.receptorPdb === currentInputs.receptorPdb &&
        cached.preset === currentInputs.preset &&
        cached.ligandOnly === currentInputs.ligandOnly) {
      // Inputs unchanged — just recalculate estimate from cached ns/day
      const nsPerDay = state().md.benchmarkResult!.nsPerDay;
      const productionNs = state().md.config.productionNs;
      const estimatedHours = (productionNs / nsPerDay) * 24;
      setMdBenchmarkResult({
        nsPerDay,
        estimatedHours,
        systemInfo: state().md.benchmarkResult!.systemInfo,
      });
      return;
    }

    setMdIsBenchmarking(true);
    setMdBenchmarkResult(null);
    setBenchmarkStatus('Initializing...');

    try {
      // Create temp output dir for benchmark using working directory
      const defaultDir = await api.getDefaultOutputDir();
      const baseOutputDir = state().customOutputDir || defaultDir;
      const benchmarkDir = `${baseOutputDir}/.md_benchmark_temp`;

      console.log('[Benchmark] Starting with:', {
        receptorPdb: state().md.receptorPdb,
        ligandSdf: state().md.ligandSdf,
        benchmarkDir,
        preset: state().md.config.forceFieldPreset,
        ligandOnly: isLigandOnly(),
        inputMode: state().md.inputMode,
      });

      const result = await api.runMdBenchmark(
        state().md.receptorPdb,
        state().md.ligandSdf!,
        benchmarkDir,
        state().md.config.forceFieldPreset,
        isLigandOnly()
      );

      console.log('[Benchmark] Result:', JSON.stringify(result));

      if (result.ok) {
        const nsPerDay = result.value.nsPerDay;
        const productionNs = state().md.config.productionNs;
        const estimatedHours = (productionNs / nsPerDay) * 24;

        setMdBenchmarkResult({
          nsPerDay,
          estimatedHours,
          systemInfo: result.value.systemInfo,
        });
        setMdSystemInfo(result.value.systemInfo);
        setLastBenchmarkInputs(currentInputs);
      } else {
        setBenchmarkStatus(`Error: ${result.error.message}`);
        // Keep status visible for 5 seconds on error
        setTimeout(() => setBenchmarkStatus(null), 5000);
        return;
      }
    } finally {
      setMdIsBenchmarking(false);
      setBenchmarkStatus(null);
    }
  };

  const handleBack = () => {
    setMdStep('md-load');
  };

  const handleContinue = () => {
    setMdStep('md-progress');
  };

  const formatDuration = (hours: number): string => {
    if (hours < 1) {
      return `${Math.round(hours * 60)} min`;
    } else if (hours < 24) {
      return `${hours.toFixed(1)} hours`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours.toFixed(0)}h`;
    }
  };

  // Recalculate estimated time when production duration changes
  const estimatedTime = createMemo(() => {
    const benchmark = state().md.benchmarkResult;
    if (!benchmark) return null;
    const productionNs = state().md.config.productionNs;
    const hours = (productionNs / benchmark.nsPerDay) * 24;
    return formatDuration(hours);
  });

  return (
    <div class="h-full flex flex-col">
      {/* Title */}
      <div class="text-center mb-3">
        <h2 class="text-xl font-bold gradient-text">
          {isLigandOnly() ? 'Configure Ligand MD' : 'Configure MD Simulation'}
        </h2>
        <p class="text-sm text-base-content/90">
          {isLigandOnly() ? 'Small molecule in solvent' : 'Set simulation parameters and estimate runtime'}
        </p>
      </div>

      {/* Main content */}
      <div class="flex-1 min-h-0 overflow-auto grid grid-cols-2 gap-4 content-start">
        {/* Left column - Output preview + benchmark */}
        <div class="flex flex-col gap-3">
          {/* Output Preview */}
          <div class="card bg-base-200 shadow-lg">
            <div class="card-body p-4">
              <h3 class="text-sm font-semibold mb-2">Output Preview</h3>
              <div class="bg-base-300 rounded-lg p-3">
                <span class="text-[10px] text-base-content/80 block mb-1">Output folder</span>
                <span class="text-xs font-mono text-base-content/80 break-all">{outputFolderName()}</span>
              </div>
              <p class="text-[10px] text-base-content/80 mt-2">
                Folder name updates based on force field and duration
              </p>
            </div>
          </div>

          {/* Production Duration + Benchmark */}
          <div class="card bg-base-200 shadow-lg flex-1">
            <div class="card-body p-4">
              <h3 class="text-sm font-semibold mb-3">Production Duration</h3>
              <div class="form-control mb-3">
                <div class="flex gap-2 items-end">
                  <div class="flex-1">
                    <label class="label py-1">
                      <span class="label-text text-xs">Duration (ns)</span>
                    </label>
                    <input
                      type="number"
                      class="input input-bordered input-sm w-full"
                      value={state().md.config.productionNs}
                      min={1}
                      step={1}
                      onInput={(e) => setMdConfig({ productionNs: Number(e.currentTarget.value) || 10 })}
                    />
                  </div>
                  <button
                    class="btn btn-secondary btn-sm"
                    onClick={handleRunBenchmark}
                    disabled={state().md.isBenchmarking}
                  >
                    {state().md.isBenchmarking ? (
                      <>
                        <span class="loading loading-spinner loading-xs"></span>
                        Estimating...
                      </>
                    ) : (
                      'Estimate Runtime'
                    )}
                  </button>
                </div>
                <Show when={benchmarkStatus()}>
                  <p class="text-[10px] text-base-content/60 mt-1">
                    {benchmarkStatus()}
                  </p>
                </Show>
              </div>

              {/* Benchmark Results */}
              <Show when={state().md.benchmarkResult}>
                <div class="bg-success/10 border border-success rounded-lg p-3">
                  <h4 class="font-semibold text-success text-xs mb-2">Benchmark Results</h4>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <span class="text-base-content/85">Throughput:</span>
                    <span class="font-mono font-bold">{state().md.benchmarkResult!.nsPerDay.toFixed(1)} ns/day</span>
                    <span class="text-base-content/85">Est. Runtime:</span>
                    <span class="font-mono font-bold">{estimatedTime()}</span>
                    <span class="text-base-content/85">Atom Count:</span>
                    <span class="font-mono">{state().md.benchmarkResult!.systemInfo.atomCount.toLocaleString()}</span>
                    <span class="text-base-content/85">Box Volume:</span>
                    <span class="font-mono">{state().md.benchmarkResult!.systemInfo.boxVolumeA3.toLocaleString()} A^3</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right column - Fixed parameters */}
        <div class="card bg-base-200 shadow-lg">
          <div class="card-body p-4">
            {/* Force Field Preset Toggle */}
            <div class="mb-4">
              <h3 class="text-sm font-semibold mb-2">Force Field Preset</h3>
              <div class="join w-full">
                <button
                  class={`join-item btn btn-sm flex-1 ${state().md.config.forceFieldPreset === 'fast' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setMdConfig({ forceFieldPreset: 'fast' })}
                >
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Fast
                </button>
                <button
                  class={`join-item btn btn-sm flex-1 ${state().md.config.forceFieldPreset === 'accurate' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setMdConfig({ forceFieldPreset: 'accurate' })}
                >
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Accurate
                </button>
              </div>
              <p class="text-[10px] text-base-content/85 mt-1">
                {MD_PRESET_PARAMS[state().md.config.forceFieldPreset].description}
              </p>
            </div>

            <h3 class="text-sm font-semibold mb-3">Simulation Parameters</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Protein FF</span>
                <span class="font-mono">
                  {isLigandOnly() ? 'None (ligand only)' : MD_PRESET_PARAMS[state().md.config.forceFieldPreset].forceFieldProtein}
                </span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Water Model</span>
                <span class="font-mono">{MD_PRESET_PARAMS[state().md.config.forceFieldPreset].forceFieldWater}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Ligand FF</span>
                <span class="font-mono">{MD_COMMON_PARAMS.forceFieldLigand}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Timestep</span>
                <span class="font-mono">{MD_COMMON_PARAMS.timestepFs} fs (HMR)</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Temperature</span>
                <span class="font-mono">{MD_COMMON_PARAMS.temperature} K</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Salt</span>
                <span class="font-mono">{MD_COMMON_PARAMS.saltConcentration * 1000} mM NaCl</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Box Shape</span>
                <span class="font-mono">{isLigandOnly() ? 'Cubic' : 'Rhombic dodecahedron'}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Padding</span>
                <span class="font-mono">{MD_COMMON_PARAMS.paddingNm} nm</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-base-300">
                <span class="text-base-content/90">Integrator</span>
                <span class="font-mono">{MD_COMMON_PARAMS.integrator}</span>
              </div>
              <div class="flex justify-between py-1.5">
                <span class="text-base-content/90">Equilibration</span>
                <span class="font-mono">~{isLigandOnly() ? '170' : MD_COMMON_PARAMS.equilibrationPs} ps</span>
              </div>
            </div>

            {/* Equilibration protocol - collapsible */}
            <button
              class="mt-2 flex items-center gap-1 text-[10px] text-base-content/60 hover:text-base-content/80"
              onClick={() => setShowProtocol(!showProtocol())}
            >
              <svg class={`w-3 h-3 transition-transform ${showProtocol() ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              Equilibration protocol (~{isLigandOnly() ? '170' : '270'} ps)
            </button>
            <Show when={showProtocol()}>
              <div class="mt-1 p-2 bg-base-300 rounded text-[10px] text-base-content/85">
                <Show
                  when={!isLigandOnly()}
                  fallback={
                    <ol class="list-decimal list-inside space-y-0.5">
                      <li>Restrained minimization (heavy atoms, 10 kcal/mol/A^2)</li>
                      <li>Unrestrained minimization</li>
                      <li>NVT→NPT heating: 10K→300K (70 ps)</li>
                      <li>NPT equilibration (50 ps)</li>
                      <li>Unrestrained NPT equilibration (50 ps)</li>
                    </ol>
                  }
                >
                  <ol class="list-decimal list-inside space-y-0.5">
                    <li>Restrained minimization (heavy atoms, 10 kcal/mol/A^2)</li>
                    <li>Unrestrained minimization</li>
                    <li>NVT→NPT heating: 10K→300K with backbone restraints (70 ps)</li>
                    <li>NPT equilibration with backbone restraints (50 ps)</li>
                    <li>Gradual restraint release (100 ps)</li>
                    <li>Unrestrained NPT equilibration (50 ps)</li>
                  </ol>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div class="flex justify-between mt-3 flex-shrink-0">
        <button class="btn btn-ghost btn-sm" onClick={handleBack}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>
        <button
          class="btn btn-primary"
          onClick={handleContinue}
        >
          Start Simulation
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MDStepConfigure;
