import { Component, onMount, createEffect, createSignal, createMemo, For, Show } from 'solid-js';
import path from 'path';
import { workflowStore } from '../../stores/workflow';
import { useMdOutput } from '../../hooks/useElectronApi';
import { MDStage, MD_COMMON_PARAMS } from '../../../shared/types/md';
import { buildMdFolderName } from '../../utils/jobName';

interface StageInfo {
  id: MDStage;
  label: string;
  description: string;
}

const STAGES: StageInfo[] = [
  { id: 'building', label: 'Building', description: 'Setting up system topology' },
  { id: 'parameterizing', label: 'AM1-BCC', description: 'Computing partial charges (sqm)' },
  { id: 'min_restrained', label: 'Min (restr)', description: 'Restrained minimization (heavy atoms)' },
  { id: 'min_unrestrained', label: 'Min (free)', description: 'Unrestrained minimization' },
  { id: 'heating', label: 'Heating', description: 'NVT→NPT heating with backbone restraints' },
  { id: 'npt_restrained', label: 'NPT Equil', description: 'NPT equilibration with backbone restraints' },
  { id: 'release', label: 'Release', description: 'Gradual restraint release' },
  { id: 'equilibration', label: 'Free Equil', description: 'Unrestrained NPT equilibration' },
  { id: 'production', label: 'Production', description: 'Running production MD' },
];

const MDStepProgress: Component = () => {
  const {
    state,
    appendLog,
    setMdStep,
    setMdCurrentStage,
    setMdStageProgress,
    setMdSystemInfo,
    setMdResult,
    setIsRunning,
    setCurrentPhase,
    setError,
    clearLogs,
  } = workflowStore;

  const [copied, setCopied] = createSignal(false);
  const [hasStarted, setHasStarted] = createSignal(false);
  const [productionNs, setProductionNs] = createSignal<{ current: number; total: number } | null>(null);
  const [chargeEstimate, setChargeEstimate] = createSignal<string | null>(null);
  let outputRef: HTMLPreElement | undefined;

  const api = window.electronAPI;

  // Parse progress from MD output
  useMdOutput((data) => {
    appendLog(data.data);

    // Parse PROGRESS:stage:value lines
    // Production format: PROGRESS:production:1.5/10.0 (current_ns/total_ns)
    // Parameterizing format: PROGRESS:parameterizing:0:59 (progress:atom_count)
    // Other stages: PROGRESS:stage:percentage
    const progressMatch = data.data.match(/PROGRESS:(\w+):(\S+)/);
    if (progressMatch) {
      const stage = progressMatch[1] as MDStage;
      const value = progressMatch[2];
      setMdCurrentStage(stage);

      if (stage === 'production' && value.includes('/')) {
        // Parse ns format: current/total
        const [current, total] = value.split('/').map(parseFloat);
        setProductionNs({ current, total });
        // Convert to percentage for progress bar
        setMdStageProgress(total > 0 ? (current / total) * 100 : 0);
      } else if (stage === 'parameterizing' && value.includes(':')) {
        // Parse parameterizing format: progress:atom_count
        // Full match is PROGRESS:parameterizing:0:59
        const fullMatch = data.data.match(/PROGRESS:parameterizing:(\d+):(\d+)/);
        if (fullMatch) {
          setMdStageProgress(parseFloat(fullMatch[1]));
          const atoms = parseInt(fullMatch[2]);
          // Estimate based on empirical sqm profiling
          const est = atoms <= 20 ? '< 10s' : atoms <= 30 ? '~10-30s' : atoms <= 40 ? '~30s-2min' : atoms <= 50 ? '~1-4min' : atoms <= 65 ? '~2-6min' : '~5min+';
          setChargeEstimate(`${atoms} atoms, est. ${est}`);
        } else {
          setMdStageProgress(parseFloat(value));
        }
      } else {
        // Regular percentage format
        setMdStageProgress(parseFloat(value));
        if (stage !== 'production') {
          setProductionNs(null);
        }
      }
    }

    // Parse SYSTEM_INFO:atomCount:volume lines
    const systemMatch = data.data.match(/SYSTEM_INFO:(\d+):(\d+)/);
    if (systemMatch) {
      setMdSystemInfo({
        atomCount: parseInt(systemMatch[1]),
        boxVolumeA3: parseInt(systemMatch[2]),
      });
    }

    // Parse SUCCESS:path line
    const successMatch = data.data.match(/SUCCESS:(.+)/);
    if (successMatch) {
      const trajectoryPath = successMatch[1].trim();
      // The output dir is the parent of the trajectory file
      const outputDir = path.dirname(trajectoryPath);
      // File prefix matches the folder name (set by run_md_simulation.py)
      const jobPrefix = path.basename(outputDir);
      setMdResult({
        systemPdbPath: path.join(outputDir, `${jobPrefix}_system.pdb`),
        trajectoryPath: trajectoryPath,
        equilibratedPdbPath: path.join(outputDir, `${jobPrefix}_equilibrated.pdb`),
        finalPdbPath: path.join(outputDir, `${jobPrefix}_final.pdb`),
        energyCsvPath: path.join(outputDir, `${jobPrefix}_energy.csv`),
      });
      setCurrentPhase('complete');
      setIsRunning(false);
    }
  });

  const runSimulation = async () => {
    const isLigandOnly = state().md.inputMode === 'ligand_only';
    if (!isLigandOnly && !state().md.receptorPdb) return;
    if (!state().md.ligandSdf) return;

    setIsRunning(true);
    setCurrentPhase('generation');
    clearLogs();
    setMdCurrentStage('building');
    setMdStageProgress(0);

    // Use global job name and build folder name
    const globalJobName = state().jobName.trim();
    const defaultDir = await api.getDefaultOutputDir();
    const baseOutputDir = state().customOutputDir || defaultDir;

    // Build folder name: {jobName}-{ff}-MD_{temp}K_{ns}ns
    const folderName = buildMdFolderName(globalJobName, {
      forceFieldPreset: state().md.config.forceFieldPreset,
      temperatureK: MD_COMMON_PARAMS.temperature,
      productionNs: state().md.config.productionNs,
    });
    const outputDir = path.join(baseOutputDir, folderName);

    try {
      const result = await api.runMdSimulation(
        state().md.receptorPdb,
        state().md.ligandSdf!,
        outputDir,
        state().md.config,
        isLigandOnly
      );

      if (!result.ok) {
        setError(result.error.message);
        setCurrentPhase('error');
        setIsRunning(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setCurrentPhase('error');
      setIsRunning(false);
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(state().logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  createEffect(() => {
    const _ = state().logs;
    if (outputRef) outputRef.scrollTop = outputRef.scrollHeight;
  });

  onMount(() => {
    if (!state().isRunning && !hasStarted()) {
      setHasStarted(true);
      runSimulation();
    }
  });

  const handleBack = () => {
    if (!state().isRunning) setMdStep('md-configure');
  };

  const currentStageIndex = createMemo(() => {
    const current = state().md.currentStage;
    if (!current) return -1;
    return STAGES.findIndex(s => s.id === current);
  });

  const getStageStatus = (index: number): 'done' | 'active' | 'pending' => {
    const currentIdx = currentStageIndex();
    if (currentIdx === -1) return 'pending';
    if (index < currentIdx) return 'done';
    if (index === currentIdx) return 'active';
    return 'pending';
  };

  const overallProgress = createMemo(() => {
    const currentIdx = currentStageIndex();
    if (currentIdx === -1) return 0;
    const stageProgress = state().md.stageProgress;
    // Each stage contributes equally (except production which might be longer)
    const baseProgress = (currentIdx / STAGES.length) * 100;
    const stageContribution = (stageProgress / 100) * (100 / STAGES.length);
    return Math.min(100, baseProgress + stageContribution);
  });

  return (
    <div class="h-full flex flex-col">
      {/* Title + Status */}
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-xl font-bold gradient-text">
            {state().currentPhase === 'complete' ? 'Simulation Complete' : 'Running MD Simulation'}
          </h2>
          <p class="text-sm text-base-content/90">
            {state().currentPhase === 'complete'
              ? `${state().md.config.productionNs} ns simulation finished`
              : state().md.currentStage === 'production' && productionNs()
                ? `Production: ${productionNs()!.current.toFixed(1)} / ${productionNs()!.total.toFixed(1)} ns`
                : state().md.currentStage === 'parameterizing' && chargeEstimate()
                  ? `Computing AM1-BCC charges (${chargeEstimate()})`
                  : state().md.currentStage
                    ? STAGES.find(s => s.id === state().md.currentStage)?.description || 'Processing...'
                    : 'Initializing...'}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <Show when={state().md.systemInfo}>
            <div class="text-right text-xs">
              <span class="text-base-content/80">{state().md.systemInfo!.atomCount.toLocaleString()} atoms</span>
            </div>
          </Show>
          {state().isRunning && (
            <span class="loading loading-spinner loading-sm text-primary"></span>
          )}
          {state().currentPhase === 'complete' && (
            <span class="badge badge-success gap-1">Done</span>
          )}
          {state().currentPhase === 'error' && (
            <span class="badge badge-error">Error</span>
          )}
        </div>
      </div>

      {/* Stage progress indicator */}
      <div class="mb-3 p-3 bg-base-200 rounded-lg">
        <div class="flex justify-between mb-2">
          <For each={STAGES}>
            {(stage, index) => {
              const status = () => getStageStatus(index());
              return (
                <div class="flex flex-col items-center" style={{ width: `${100 / STAGES.length}%` }}>
                  <div
                    class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      status() === 'done'
                        ? 'bg-success text-success-content'
                        : status() === 'active'
                        ? 'bg-primary text-primary-content'
                        : 'bg-base-300 text-base-content/90'
                    }`}
                  >
                    {status() === 'done' ? (
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index() + 1
                    )}
                  </div>
                  <span
                    class={`text-[9px] mt-1 text-center ${
                      status() === 'active' ? 'text-primary font-semibold' : 'text-base-content/80'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
        {/* Progress bar */}
        <progress
          class={`progress w-full h-2 ${
            state().currentPhase === 'error'
              ? 'progress-error'
              : state().currentPhase === 'complete'
              ? 'progress-success'
              : 'progress-primary'
          }`}
          value={overallProgress()}
          max="100"
        ></progress>
        <div class="flex justify-between text-[10px] text-base-content/80 mt-1">
          <Show
            when={state().md.currentStage === 'production' && productionNs()}
            fallback={
              <>
                <span>0%</span>
                <span>{overallProgress().toFixed(0)}%</span>
                <span>100%</span>
              </>
            }
          >
            <span>0 ns</span>
            <span class="font-semibold text-primary">{productionNs()!.current.toFixed(1)} ns</span>
            <span>{productionNs()!.total.toFixed(1)} ns</span>
          </Show>
        </div>
      </div>

      {/* Error message */}
      {state().errorMessage && (
        <div class="alert alert-error py-2 mb-2">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm">{state().errorMessage}</span>
        </div>
      )}

      {/* Terminal output */}
      <div class="flex-1 card bg-base-300 overflow-hidden relative">
        <div class="flex items-center justify-between px-3 py-1.5 bg-base-200 border-b border-base-100">
          <span class="font-mono text-xs text-base-content/90">OpenMM Output</span>
          <div class="flex gap-1">
            <div class="w-2.5 h-2.5 rounded-full bg-error/60"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-warning/60"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-success/60"></div>
          </div>
        </div>
        {/* Copy button */}
        <button
          class={`absolute top-10 right-2 btn btn-xs ${copied() ? 'btn-success' : 'btn-ghost'} gap-1`}
          onClick={handleCopyLogs}
          title="Copy logs"
        >
          {copied() ? (
            <>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
        <pre
          ref={outputRef}
          class="terminal-output flex-1 p-3 overflow-auto text-info whitespace-pre-wrap"
        >
          {state().logs || 'Waiting for output...'}
        </pre>
      </div>

      {/* Navigation */}
      <div class="flex justify-between mt-3">
        <button class="btn btn-ghost btn-sm" onClick={handleBack} disabled={state().isRunning}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>

        {state().currentPhase === 'complete' && (
          <button class="btn btn-primary" onClick={() => setMdStep('md-results')}>
            View Results
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        )}

        {state().currentPhase === 'error' && (
          <button
            class="btn btn-error btn-sm"
            onClick={() => {
              setCurrentPhase('idle');
              clearLogs();
              setError(null);
              setHasStarted(false);
              runSimulation();
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default MDStepProgress;
