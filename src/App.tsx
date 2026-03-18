import { Component, Match, Switch } from 'solid-js';
import WizardLayout from './components/layout/WizardLayout';
import MDStepHome from './components/steps/MDStepHome';
import MDStepLoad from './components/steps/MDStepLoad';
import MDStepConfigure from './components/steps/MDStepConfigure';
import MDStepProgress from './components/steps/MDStepProgress';
import MDStepResults from './components/steps/MDStepResults';
import DockStepLoad from './components/steps/DockStepLoad';
import DockStepConfigure from './components/steps/DockStepConfigure';
import DockStepProgress from './components/steps/DockStepProgress';
import DockStepResults from './components/steps/DockStepResults';
import ViewerMode from './components/viewer/ViewerMode';
import { workflowStore } from './stores/workflow';

const App: Component = () => {
  const { state } = workflowStore;

  return (
    <WizardLayout>
      <Switch>
        {/* Dock mode steps */}
        <Match when={state().mode === 'dock' && state().dockStep === 'dock-load'}>
          <DockStepLoad />
        </Match>
        <Match when={state().mode === 'dock' && state().dockStep === 'dock-configure'}>
          <DockStepConfigure />
        </Match>
        <Match when={state().mode === 'dock' && state().dockStep === 'dock-progress'}>
          <DockStepProgress />
        </Match>
        <Match when={state().mode === 'dock' && state().dockStep === 'dock-results'}>
          <DockStepResults />
        </Match>

        {/* MD mode steps */}
        <Match when={state().mode === 'md' && state().mdStep === 'md-home'}>
          <MDStepHome />
        </Match>
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
