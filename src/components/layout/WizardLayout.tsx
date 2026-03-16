import { Component, JSX, Show, Switch, Match, createSignal } from 'solid-js';
import { workflowStore, WorkflowMode, MDStep } from '../../stores/workflow';
import { useElectronApi } from '../../hooks/useElectronApi';
import HelpModal from '../HelpModal';
import AboutModal from '../AboutModal';
import path from 'path';

interface StepInfo {
  id: MDStep;
  label: string;
  icon: string;
}

const mdSteps: StepInfo[] = [
  { id: 'md-load', label: 'Load', icon: '1' },
  { id: 'md-configure', label: 'Configure', icon: '2' },
  { id: 'md-progress', label: 'Simulate', icon: '3' },
  { id: 'md-results', label: 'Results', icon: '4' },
];

const mdStepOrder = mdSteps.map((s) => s.id);

interface WizardLayoutProps {
  children: JSX.Element;
}

const WizardLayout: Component<WizardLayoutProps> = (props) => {
  const { state, setMode, setCustomOutputDir, setJobName, regenerateJobName } = workflowStore;
  const [showHelp, setShowHelp] = createSignal(false);
  const [showAbout, setShowAbout] = createSignal(false);
  const [isEditingJobName, setIsEditingJobName] = createSignal(false);
  const api = useElectronApi();

  const handleSelectWorkingDir = async () => {
    const folderPath = await api.selectOutputFolder();
    if (folderPath) {
      setCustomOutputDir(folderPath);
    }
  };

  const getDisplayPath = () => {
    const dir = state().customOutputDir;
    if (!dir) return 'Desktop (default)';
    const basename = path.basename(dir);
    return basename.length > 20 ? basename.slice(0, 17) + '...' : basename;
  };

  const getStepStatus = (stepId: string): 'done' | 'active' | 'pending' => {
    const currentStep = state().mdStep;
    const currentIndex = mdStepOrder.indexOf(currentStep);
    const stepIndex = mdStepOrder.indexOf(stepId as MDStep);

    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const canSwitchMode = () => {
    return !state().isRunning;
  };

  const handleModeSwitch = (newMode: WorkflowMode) => {
    if (canSwitchMode() && newMode !== state().mode) {
      setMode(newMode);
    }
  };

  return (
    <div class="h-screen flex flex-col bg-base-100 overflow-hidden">
      {/* Draggable title bar area for macOS traffic lights */}
      <div class="h-6 bg-base-200 flex-shrink-0" style={{ "-webkit-app-region": "drag" }} />
      {/* Header + Steps combined */}
      <header class="bg-base-200 border-b border-base-300 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-3">
          {/* Mode selector segmented control */}
          <div class="tabs tabs-boxed bg-base-300 p-0.5">
            <button
              class={`tab tab-sm ${state().mode === 'md' ? 'tab-active' : ''}`}
              onClick={() => handleModeSwitch('md')}
              disabled={!canSwitchMode()}
            >
              Simulate
            </button>
            <button
              class={`tab tab-sm ${state().mode === 'viewer' ? 'tab-active' : ''}`}
              onClick={() => handleModeSwitch('viewer')}
              disabled={!canSwitchMode()}
            >
              Viewer
            </button>
          </div>
          {/* Help button */}
          <button
            class="btn btn-ghost btn-xs btn-circle"
            onClick={() => setShowHelp(true)}
            title="Help"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {/* About button */}
          <button
            class="btn btn-ghost btn-xs btn-circle"
            onClick={() => setShowAbout(true)}
            title="About Ember"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        {/* Working Directory + Job Name */}
        <Show when={state().mode !== 'viewer'}>
          <div class="flex items-center gap-4">
            {/* Working Directory */}
            <div class="flex flex-col items-center">
              <span class="text-[10px] text-base-content/85 mb-0.5">Working Directory</span>
              <button
                class="btn btn-ghost btn-xs gap-1 h-auto py-1"
                onClick={handleSelectWorkingDir}
                title={state().customOutputDir || 'Desktop (default)'}
                disabled={state().isRunning}
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span class="text-xs font-normal">{getDisplayPath()}</span>
              </button>
            </div>

            {/* Job Name */}
            <div class="flex flex-col items-center">
              <span class="text-[10px] text-base-content/85 mb-0.5">Job Name</span>
              <div class="flex items-center gap-1">
                {isEditingJobName() ? (
                  <input
                    type="text"
                    class="input input-xs input-bordered w-36 text-xs"
                    value={state().jobName}
                    onInput={(e) => setJobName(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    onBlur={() => setIsEditingJobName(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingJobName(false)}
                    autofocus
                  />
                ) : (
                  <button
                    class="btn btn-ghost btn-xs gap-1 h-auto py-1 font-mono"
                    onClick={() => setIsEditingJobName(true)}
                    disabled={state().isRunning}
                    title="Click to edit job name"
                  >
                    {state().jobName}
                  </button>
                )}
                <button
                  class="btn btn-ghost btn-xs btn-circle"
                  onClick={regenerateJobName}
                  disabled={state().isRunning}
                  title="Generate new random name"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </Show>

        <Show when={state().mode !== 'viewer'}>
          <ul class="steps steps-horizontal">
            {mdSteps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <li
                  class={`step step-sm ${status === 'done' || status === 'active' ? 'step-primary' : ''}`}
                  data-content={status === 'done' ? '✓' : step.icon}
                >
                  <span class={`text-xs ${status === 'active' ? 'font-semibold' : 'text-base-content/90'}`}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Show>
      </header>

      {/* Main content */}
      <main class="flex-1 min-h-0 overflow-auto">
        <div class="h-full max-w-4xl mx-auto px-4 py-3">{props.children}</div>
      </main>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp()}
        onClose={() => setShowHelp(false)}
        initialTab="md"
      />
      {/* About Modal */}
      <AboutModal
        isOpen={showAbout()}
        onClose={() => setShowAbout(false)}
      />
    </div>
  );
};

export default WizardLayout;
