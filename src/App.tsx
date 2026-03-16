import { Component, Match, Switch } from 'solid-js';
import WizardLayout from './components/layout/WizardLayout';
import MDStepLoad from './components/steps/MDStepLoad';
import MDStepConfigure from './components/steps/MDStepConfigure';
import MDStepProgress from './components/steps/MDStepProgress';
import MDStepResults from './components/steps/MDStepResults';
import ViewerMode from './components/viewer/ViewerMode';
import { workflowStore } from './stores/workflow';

const App: Component = () => {
  const { state } = workflowStore;

  return (
    <WizardLayout>
      <Switch>
        {/* MD mode steps */}
        <Match when={state().mode === 'md' && state().mdStep === 'md-load'}>
          <MDStepLoad />
        </Match>
        <Match when={state().mode === 'md' && state().mdStep === 'md-configure'}>
          <MDStepConfigure />
        </Match>
        <Match when={state().mode === 'md' && state().mdStep === 'md-progress'}>
          <MDStepProgress />
        </Match>
        <Match when={state().mode === 'md' && state().mdStep === 'md-results'}>
          <MDStepResults />
        </Match>

        {/* Viewer mode (single view, no steps) */}
        <Match when={state().mode === 'viewer'}>
          <ViewerMode />
        </Match>
      </Switch>
    </WizardLayout>
  );
};

export default App;
