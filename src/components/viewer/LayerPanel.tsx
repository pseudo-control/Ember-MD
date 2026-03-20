import { Component, For, Show } from 'solid-js';
import type { ViewerLayer, ViewerLayerGroup } from '../../stores/workflow';
import type { ProjectJob } from '../../../shared/types/ipc';

interface LayerPanelProps {
  layers: ViewerLayer[];
  layerGroups: ViewerLayerGroup[];
  selectedLayerId: string | null;
  proteinCount: number;
  canClear: boolean;
  recentJobs: ProjectJob[];
  selectedRecentJobId: string | null;
  isLoadingRecentJobs: boolean;
  isLoadingSelectedJob: boolean;
  onImportFiles: () => void;
  onAlignAll: () => void;
  onClearAll: () => void;
  onSelectRecentJob: (jobId: string) => void;
  onLoadRecentJob: () => void;
  onToggleVisibility: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onToggleGroupVisible: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

const EyeIcon: Component = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon: Component = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 014.636-5.662m1.838-.96A9.956 9.956 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-3.27 4.768M3 3l18 18" />
  </svg>
);

const XIcon: Component = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronRight: Component = () => (
  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
  </svg>
);

const ChevronDown: Component = () => (
  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
  </svg>
);

/** Shared row for both grouped and standalone layers */
const LayerRow: Component<{
  layer: ViewerLayer;
  isSelected: boolean;
  indent: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}> = (props) => (
  <div
    class={`h-7 ${props.indent ? 'pl-5 pr-2' : 'px-2'} flex items-center gap-2 hover:bg-base-200 cursor-pointer ${
      props.isSelected ? '!bg-primary/20 hover:!bg-primary/25' : ''
    }`}
    onClick={props.onSelect}
  >
    <span class="flex-1 min-w-0 text-xs font-medium truncate" title={props.layer.filePath}>
      {props.layer.label}
      <Show when={props.layer.affinity !== undefined}>
        <span class="text-base-content/60 ml-1">({props.layer.affinity?.toFixed(1)})</span>
      </Show>
    </span>
    <button
      class="opacity-70 hover:opacity-100"
      onClick={(e) => { e.stopPropagation(); props.onToggleVisibility(); }}
      title={props.layer.visible ? 'Hide' : 'Show'}
    >
      {props.layer.visible ? <EyeIcon /> : <EyeOffIcon />}
    </button>
    <button
      class="opacity-70 hover:opacity-100"
      onClick={(e) => { e.stopPropagation(); props.onRemove(); }}
      title="Remove"
    >
      <XIcon />
    </button>
  </div>
);

const LayerPanel: Component<LayerPanelProps> = (props) => {
  // Single-pass grouping: build Map<groupId, ViewerLayer[]> + standalone list
  const grouped = () => {
    const byGroup = new Map<string, ViewerLayer[]>();
    const standalone: ViewerLayer[] = [];
    for (const l of props.layers) {
      if (l.groupId) {
        const arr = byGroup.get(l.groupId);
        if (arr) arr.push(l); else byGroup.set(l.groupId, [l]);
      } else {
        standalone.push(l);
      }
    }
    return { byGroup, standalone };
  };

  const jobTypeLabel = (job: ProjectJob) => {
    if (job.type === 'docking') return 'Dock';
    if (job.type === 'simulation') return 'MD';
    if (job.type === 'conformer') return 'MCMM';
    return 'Job';
  };

  return (
    <div class="card bg-base-200 p-2">
      <div class="grid grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-3">
        <div class="rounded border border-base-300 bg-base-100/60 p-3 flex flex-col gap-3 min-w-0">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-wider text-base-content/55 mb-1">
              Import Files
            </div>
            <p class="text-xs text-base-content/75 leading-relaxed">
              Open structures or one trajectory from a single file picker.
            </p>
            <div class="text-[11px] text-base-content/55 leading-relaxed mt-1">
              <p>Structures: `.pdb`, `.cif`, `.sdf`, `.sdf.gz`, `.mol`, `.mol2`</p>
              <p>Trajectory: `.dcd`</p>
            </div>
          </div>
          <button class="btn btn-sm btn-primary w-full" onClick={props.onImportFiles}>
            Import Files
          </button>
          <div class="flex gap-2">
            <Show when={props.proteinCount >= 2}>
              <button class="btn btn-xs btn-accent flex-1" onClick={props.onAlignAll}>
                Align Loaded Structures
              </button>
            </Show>
            <Show when={props.canClear}>
              <button class="btn btn-xs btn-ghost flex-1" onClick={props.onClearAll}>
                Close Viewer
              </button>
            </Show>
          </div>
        </div>
        <div class="rounded border border-base-300 bg-base-100/60 p-3 flex flex-col gap-2 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/55">
              Recent Jobs
            </span>
            <button
              class="btn btn-xs btn-primary"
              onClick={props.onLoadRecentJob}
              disabled={!props.selectedRecentJobId || props.isLoadingSelectedJob}
            >
              <Show when={props.isLoadingSelectedJob} fallback={'Load'}>
                <span class="loading loading-spinner loading-xs" />
              </Show>
            </button>
          </div>
          <Show when={!props.isLoadingRecentJobs} fallback={
            <div class="h-40 flex items-center justify-center">
              <span class="loading loading-spinner loading-sm text-primary" />
            </div>
          }>
            <Show when={props.recentJobs.length > 0} fallback={
              <div class="h-40 flex items-center justify-center text-xs text-base-content/55 text-center">
                No recent jobs in this project.
              </div>
            }>
              <div class="h-40 overflow-y-auto rounded border border-base-300 divide-y divide-base-300">
                <For each={props.recentJobs}>
                  {(job) => (
                    <button
                      class={`w-full px-2 py-2 text-left hover:bg-base-200 ${
                        props.selectedRecentJobId === job.id ? 'bg-primary/15' : ''
                      }`}
                      onClick={() => props.onSelectRecentJob(job.id)}
                    >
                      <div class="flex items-center gap-2">
                        <span class="badge badge-ghost badge-xs">{jobTypeLabel(job)}</span>
                        <span class="text-xs font-medium truncate flex-1">{job.label}</span>
                      </div>
                      <div class="text-[10px] text-base-content/55 mt-1 truncate">{job.path}</div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      {/* Layer list */}
      <Show when={props.layers.length > 0 || props.layerGroups.length > 0}>
        <div class="mt-2 border border-base-300 rounded divide-y divide-base-300 max-h-48 overflow-y-auto">
          {/* Groups */}
          <For each={props.layerGroups}>
            {(group) => {
              const children = () => grouped().byGroup.get(group.id) || [];
              return (
                <>
                  <div class="h-7 px-2 flex items-center gap-2 hover:bg-base-200 cursor-pointer">
                    <button class="flex items-center" onClick={() => props.onToggleGroupExpanded(group.id)}>
                      {group.expanded ? <ChevronDown /> : <ChevronRight />}
                    </button>
                    <span
                      class="flex-1 min-w-0 text-xs font-medium truncate"
                      onClick={() => props.onToggleGroupExpanded(group.id)}
                    >
                      {group.label}
                    </span>
                    <button
                      class="opacity-70 hover:opacity-100"
                      onClick={() => props.onToggleGroupVisible(group.id)}
                      title={group.visible ? 'Hide group' : 'Show group'}
                    >
                      {group.visible ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <button
                      class="opacity-70 hover:opacity-100"
                      onClick={() => props.onRemoveGroup(group.id)}
                      title="Remove group"
                    >
                      <XIcon />
                    </button>
                  </div>
                  <Show when={group.expanded}>
                    <For each={children()}>
                      {(layer) => (
                        <LayerRow
                          layer={layer}
                          isSelected={layer.id === props.selectedLayerId}
                          indent={true}
                          onSelect={() => props.onSelectLayer(layer.id)}
                          onToggleVisibility={() => props.onToggleVisibility(layer.id)}
                          onRemove={() => props.onRemoveLayer(layer.id)}
                        />
                      )}
                    </For>
                  </Show>
                </>
              );
            }}
          </For>

          {/* Standalone layers */}
          <For each={grouped().standalone}>
            {(layer) => (
              <LayerRow
                layer={layer}
                isSelected={layer.id === props.selectedLayerId}
                indent={false}
                onSelect={() => props.onSelectLayer(layer.id)}
                onToggleVisibility={() => props.onToggleVisibility(layer.id)}
                onRemove={() => props.onRemoveLayer(layer.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default LayerPanel;
