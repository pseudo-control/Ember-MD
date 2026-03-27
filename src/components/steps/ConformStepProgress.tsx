// Copyright (c) 2026 Ember Contributors. MIT License.
import { Component, onMount, onCleanup, createSignal, Show } from 'solid-js';
import { workflowStore } from '../../stores/workflow';
import { projectPathsFromProjectDir } from '../../utils/projectPaths';
import { buildConformRunFolderName } from '../../utils/jobName';
import TerminalOutput from '../shared/TerminalOutput';
import StopConfirmModal from '../shared/StopConfirmModal';

const ConformStepProgress: Component = () => {
  const {
    state,
    appendLog,
    setConformStep,
    setConformOutputDir,
    setConformPaths,
    setConformEnergies,
    setConformRunning,
    setCurrentPhase,
    setError,
    clearLogs,
  } = workflowStore;

  const [hasStarted, setHasStarted] = createSignal(false);
  const [showStopConfirm, setShowStopConfirm] = createSignal(false);
  const api = window.electronAPI;

  onMount(() => {
    const cleanup = api.onConformOutput((data) => {
      appendLog(data.data);
    });
    onCleanup(cleanup);
  });

  const runConformers = async () => {
    const conform = state().conform;
    if (!conform.ligandSdfPath) return;

    setConformRunning(true);
    setCurrentPhase('generation');
    clearLogs();

    // Build output directory
    const projectDir = state().projectDir;
    if (!projectDir) {
      setError('No project selected');
      setCurrentPhase('error');
      return;
    }
    const paths = projectPathsFromProjectDir(projectDir);
    const activeMethod = conform.config.method === 'none' ? 'etkdg' : conform.config.method;
    const runFolder = buildConformRunFolderName({
      method: activeMethod,
      maxConformers: conform.config.maxConformers,
      outputName: conform.outputName,
      ligandName: conform.ligandName,
      protonation: conform.protonationConfig,
    });
    const jobDir = paths.conformers(runFolder).root;
    const resultsDir = paths.conformers(runFolder).results;
    setConformOutputDir(jobDir);

    try {
      await api.createDirectory(resultsDir);

      let ligandPath = conform.ligandSdfPath;

      if (conform.protonationConfig.enabled) {
        appendLog('--- Enumerating protonation states... ---\n');
        const protonDir = `${jobDir}/inputs/protonated`;
        const protonResult = await api.enumerateProtonation(
          [ligandPath],
          protonDir,
          conform.protonationConfig.phMin,
          conform.protonationConfig.phMax
        );

        if (!protonResult.ok) {
          setError(protonResult.error.message);
          setCurrentPhase('error');
          return;
        }

        ligandPath = protonResult.value.protonatedPaths[0];
        appendLog(`  ${protonResult.value.protonatedPaths.length} protonation variants generated\n\n`);
      }

      const mcmmOpts = conform.config.method === 'mcmm' ? {
        steps: conform.config.mcmmSteps,
        temperature: conform.config.mcmmTemperature,
        sampleAmides: conform.config.sampleAmides,
        xtbRerank: conform.config.xtbRerank,
      } : undefined;

      const result = await api.runConformGeneration(
        ligandPath,
        resultsDir,
        conform.config.maxConformers,
        conform.config.rmsdCutoff,
        conform.config.energyWindow,
        conform.config.method,
        mcmmOpts
      );

      if (result.ok) {
        setConformPaths(result.value.conformerPaths);
        setConformEnergies(result.value.conformerEnergies || {});
        setCurrentPhase('complete');
        appendLog(`\n${result.value.conformerPaths.length} conformers generated\n`);
      } else {
        setError(result.error.message);
        setCurrentPhase('error');
      }
    } catch (err) {
      setError((err as Error).message);
      setCurrentPhase('error');
    }

    setConformRunning(false);
  };

  onMount(() => {
    const phase = state().currentPhase;
    if (!state().conform.isRunning && !hasStarted() && phase !== 'complete') {
      setHasStarted(true);
      void runConformers();
    }
  });

  const handleBack = () => {
    if (!state().conform.isRunning) {
      setCurrentPhase('idle');
      setError(null);
      clearLogs();
      setConformStep('conform-configure');
    }
  };

  return (
    <div class="h-full flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-xl font-bold">
            {state().currentPhase === 'complete' ? 'Search Complete' : 'Running Conformer Search'}
          </h2>
          <p class="text-sm text-base-content/90">
            {state().currentPhase === 'complete'
              ? `${state().conform.conformerPaths.length} conformers found`
              : `${state().conform.config.method.toUpperCase()} — ${state().conform.outputName || state().conform.ligandName}`}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Show when={state().conform.isRunning}>
            <button
              class="btn btn-circle btn-xs btn-ghost text-error"
              title="Cancel"
              onClick={() => setShowStopConfirm(true)}
            >
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>
            <span class="loading loading-spinner loading-sm text-primary" />
          </Show>
          <Show when={state().currentPhase === 'complete'}>
            <span class="badge badge-success badge-sm">Done</span>
          </Show>
          <Show when={state().currentPhase === 'error'}>
            <span class="badge badge-error badge-sm">Error</span>
          </Show>
        </div>
      </div>

      <Show when={state().errorMessage}>
        <div class="alert alert-error py-2 mb-2">
          <span class="text-sm">{state().errorMessage}</span>
        </div>
      </Show>

      <TerminalOutput title="Conformer Search Output" logs={state().logs} />

      <div class="flex justify-between mt-3">
        <button class="btn btn-ghost btn-sm" onClick={handleBack} disabled={state().conform.isRunning}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back
        </button>
        <Show when={state().currentPhase === 'complete'}>
          <button class="btn btn-primary" onClick={() => setConformStep('conform-results')}>
            View Results
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </Show>
      </div>

      <StopConfirmModal
        isOpen={showStopConfirm()}
        title="Stop Conformer Search?"
        message="Are you sure you want to cancel? Partial results will not be available."
        onConfirm={() => {
          setShowStopConfirm(false);
          void (async () => {
            await api.cancelConformGeneration();
            setConformRunning(false);
            setCurrentPhase('idle');
            appendLog('\n--- Conformer search cancelled by user ---\n');
          })();
        }}
        onCancel={() => setShowStopConfirm(false)}
      />
    </div>
  );
};

export default ConformStepProgress;
