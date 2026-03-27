// Copyright (c) 2026 Ember Contributors. MIT License.
import { Component, For, Show, createSignal, createMemo, onCleanup, onMount } from 'solid-js';
import type { ViewerProjectColumn, ViewerProjectFamily, ViewerProjectJobType, ViewerProjectTableState } from '../../stores/workflow';
import { getSortedRowsForFamily, getVisibleColumnsForFamily } from '../../utils/projectTable';
import ImportInputPanel from '../shared/ImportInputPanel';

const SECTION_ORDER: ViewerProjectJobType[] = ['import', 'conformer', 'docking', 'scoring', 'simulation'];
const SECTION_LABELS: Record<ViewerProjectJobType, string> = {
  import: 'Imported Structures',
  conformer: 'Conformer Searches',
  docking: 'Docking Jobs',
  scoring: 'Scoring Jobs',
  simulation: 'Dynamic Simulations',
};

interface ProjectTableProps {
  projectTable: ViewerProjectTableState;
  panelWidth: number;
  onSelectRow: (rowId: string) => void;
  onToggleRowSelection: (rowId: string) => void;
  onToggleFamilyCollapsed: (familyId: string) => void;
  onToggleSectionCollapsed: (jobType: ViewerProjectJobType) => void;
  onSortFamily: (familyId: string, columnKey: string) => void;
  onPlayTrajectory: (familyId: string) => void;
  onRemoveFamily: (familyId: string) => void;
  onHideFamily: (familyId: string) => void;
  onUnhideFamily: (familyId: string) => void;
  onHideRow: (rowId: string) => void;
  onUnhideRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onRenameRow: (rowId: string, newLabel: string) => void;
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  canTransfer: boolean;
  transferTooltip?: string;
  canExport: boolean;
  canTransferDock: boolean;
  transferDockTooltip?: string;
  canTransferMcmm: boolean;
  transferMcmmTooltip?: string;
  canTransferSimulate: boolean;
  transferSimulateTooltip?: string;
  onTransferDock: () => void;
  onTransferMcmm: () => void;
  onTransferSimulate: () => void;
  onExport: () => void;
  onBrowseImport: () => void;
  importPdbIdValue: string;
  onImportPdbIdInput: (value: string) => void;
  onFetchImportPdb: () => void;
  importPdbFetchDisabled: boolean;
  importPdbFetchLoading: boolean;
  importSmilesValue: string;
  onImportSmilesInput: (value: string) => void;
  onSubmitImportSmiles: () => void;
  importSmilesDisabled: boolean;
  importSmilesLoading: boolean;
  importSmilesCount: number;
  importDisabled: boolean;
  importLoading: boolean;
  canAlignProtein: boolean;
  canAlignLigand: boolean;
  canAlignSubstructure: boolean;
  onAlignProtein: () => void;
  onAlignLigand: () => void;
  onAlignSubstructure: () => void;
  alignSubstructureLabel: string | null;
  hasAlignment: boolean;
  onResetAlignment: () => void;
  onViewResults?: () => void;
  viewResultsDisabled?: boolean;
  viewResultsTooltip?: string;
}

const ChevronRight: Component = () => (
  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
  </svg>
);

const ChevronLeft: Component = () => (
  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronDown: Component = () => (
  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
  </svg>
);

// Phosphor Eye Slash (regular weight, 256 viewBox)
const EyeSlashIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class || 'w-3.5 h-3.5'} viewBox="0 0 256 256" fill="currentColor">
    <path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.29A162.09,162.09,0,0,1,25,128,162.09,162.09,0,0,1,48.07,97.29l22.53,24.79a48,48,0,0,0,65,55.29l19.07,21A111.18,111.18,0,0,1,128,192Zm119.31-60.76c-.35.79-8.82,19.57-27.65,38.4A8,8,0,0,1,208,158.62a8,8,0,0,1,0-11.31,162.09,162.09,0,0,0,23-30.31A162.09,162.09,0,0,0,207.93,86.7C185.67,64.56,158.78,53.37,128,53.37a128.37,128.37,0,0,0-21.44,1.79,8,8,0,1,1-2.68-15.77A144.36,144.36,0,0,1,128,37.37c34.88,0,66.57,13.26,91.65,38.35,18.83,18.83,27.3,37.62,27.65,38.41A8,8,0,0,1,247.31,131.24Z" />
  </svg>
);

const formatMetric = (value: string | number | null | undefined, column: ViewerProjectColumn): string => {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  if (column.kind === 'percent') return `${(value * 100).toFixed(0)}%`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
};

const ProjectTable: Component<ProjectTableProps> = (props) => {
  const [editingRowId, setEditingRowId] = createSignal<string | null>(null);
  const [editText, setEditText] = createSignal('');
  const [showImportPopover, setShowImportPopover] = createSignal(false);
  const [showUnhideModal, setShowUnhideModal] = createSignal(false);

  const hiddenFamilyIds = () => new Set(props.projectTable.hiddenFamilyIds || []);
  const hiddenRowIds = () => new Set(props.projectTable.hiddenRowIds || []);
  const visibleFamilies = createMemo(() =>
    props.projectTable.families.filter((f) => !hiddenFamilyIds().has(f.id)),
  );
  const hiddenFamilies = createMemo(() =>
    props.projectTable.families.filter((f) => hiddenFamilyIds().has(f.id)),
  );
  const hiddenRowCount = () => (props.projectTable.hiddenRowIds || []).length;
  const totalHiddenCount = () => hiddenFamilies().length + hiddenRowCount();
  const isRowHidden = (rowId: string) => hiddenRowIds().has(rowId);
  let importButtonRef: HTMLButtonElement | undefined;
  let importPopoverRef: HTMLDivElement | undefined;

  onMount(() => {
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (importPopoverRef?.contains(target)) return;
      if (importButtonRef?.contains(target)) return;
      setShowImportPopover(false);
    };
    document.addEventListener('mousedown', handleClickAway);
    onCleanup(() => document.removeEventListener('mousedown', handleClickAway));
  });

  const startRenameRow = (rowId: string, currentLabel: string) => {
    setEditingRowId(rowId);
    setEditText(currentLabel);
  };

  const commitRename = () => {
    const rowId = editingRowId();
    const text = editText().trim();
    if (rowId && text) {
      const current = props.projectTable.rows.find((r) => r.id === rowId);
      if (current && current.label !== text) {
        props.onRenameRow(rowId, text);
      }
    }
    setEditingRowId(null);
  };

  const cancelRename = () => {
    setEditingRowId(null);
  };

  const sortIndicator = (family: ViewerProjectFamily, columnKey: string) => {
    if (family.sortKey !== columnKey) return '';
    return family.sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const isSelected = (rowId: string) =>
    (props.projectTable.selectedRowIds || []).includes(rowId);

  const isActive = (rowId: string) =>
    props.projectTable.activeRowId === rowId;

  const handleRowClick = (rowId: string, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      props.onToggleRowSelection(rowId);
    } else {
      props.onSelectRow(rowId);
    }
  };

  return (
    <div class="card bg-base-200 h-full overflow-hidden" data-testid="project-table">
      <div class="px-3 py-2 border-b border-base-300 flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">Project Table</div>
          <Show when={totalHiddenCount() > 0}>
            <button
              class="text-[10px] text-base-content/60 hover:text-primary cursor-pointer"
              onClick={() => setShowUnhideModal(true)}
            >
              {totalHiddenCount()} hidden
            </button>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="btn btn-ghost btn-xs btn-square"
            onClick={() => props.onNavigatePrevious()}
            disabled={!props.canNavigatePrevious}
            title="Previous structure"
            data-testid="project-table-nav-prev"
          >
            <ChevronLeft />
          </button>
          <button
            class="btn btn-ghost btn-xs btn-square"
            onClick={() => props.onNavigateNext()}
            disabled={!props.canNavigateNext}
            title="Next structure"
            data-testid="project-table-nav-next"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <Show
          when={visibleFamilies().length > 0}
          fallback={
            <div class="h-full flex items-center justify-center px-5 text-center">
              <div class="space-y-1.5">
                <p class="text-sm font-semibold">No project rows yet</p>
                <p class="text-xs text-base-content/60">
                  Import a structure or run a job to populate the project table.
                </p>
              </div>
            </div>
          }
        >
          <For each={SECTION_ORDER}>
            {(sectionType) => {
              const sectionFamilies = () => visibleFamilies().filter((f) => f.jobType === sectionType);
              const firstFamily = () => sectionFamilies()[0];
              const sectionCollapsed = () => firstFamily()?.collapsed ?? true;
              const toggleSection = () => props.onToggleSectionCollapsed(sectionType);
              return (
                <Show when={sectionFamilies().length > 0}>
              <div class="border-b border-base-300 last:border-b-0">
                <div class="px-2 py-1.5 flex items-center gap-2 bg-base-100/60">
                  <button
                    class="btn btn-ghost btn-xs btn-square"
                    onClick={toggleSection}
                    title={sectionCollapsed() ? 'Expand' : 'Collapse'}
                  >
                    {sectionCollapsed() ? <ChevronRight /> : <ChevronDown />}
                  </button>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold truncate">{SECTION_LABELS[sectionType]}</div>
                  </div>
                  <Show when={sectionFamilies().length === 1 && firstFamily()?.trajectoryPath}>
                    <button
                      class="btn btn-primary btn-xs"
                      onClick={() => props.onPlayTrajectory(firstFamily()!.id)}
                    >
                      Play
                    </button>
                  </Show>
                  <Show when={sectionFamilies().length === 1}>
                    <button
                      class="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content/70"
                      onClick={(e) => { e.stopPropagation(); props.onHideFamily(firstFamily()!.id); }}
                      title="Hide"
                    >
                      <EyeSlashIcon class="w-3.5 h-3.5" />
                    </button>
                  </Show>
                </div>

                <Show when={!sectionCollapsed()}>
                  <div class="overflow-hidden">
                    {/* Sub-family headers when multiple jobs in section */}
                    <Show when={sectionFamilies().length > 1}>
                      <For each={sectionFamilies()}>
                        {(subFamily) => (
                          <div class="border-b border-base-300">
                            <div class="px-4 py-1 flex items-center gap-2 bg-base-200/40">
                              <button
                                class="btn btn-ghost btn-xs btn-square"
                                onClick={() => props.onToggleFamilyCollapsed(subFamily.id)}
                              >
                                {subFamily.collapsed ? <ChevronRight /> : <ChevronDown />}
                              </button>
                              <span class="text-[11px] font-medium truncate flex-1">{subFamily.title}</span>
                              <button
                                class="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content/70"
                                onClick={(e) => { e.stopPropagation(); props.onHideFamily(subFamily.id); }}
                                title="Hide"
                              >
                                <EyeSlashIcon class="w-3 h-3" />
                              </button>
                            </div>
                            <Show when={!subFamily.collapsed}>
                              <table class="table table-xs table-fixed w-full">
                                <tbody>
                                  <For each={getSortedRowsForFamily(subFamily, props.projectTable.rows, getVisibleColumnsForFamily(subFamily, props.panelWidth))}>
                                    {(row) => (
                                      <tr
                                        class={`cursor-pointer hover:bg-base-200 ${isActive(row.id) ? 'bg-primary/10' : isSelected(row.id) ? 'bg-primary/5' : ''}`}
                                        onClick={(e) => handleRowClick(row.id, e)}
                                      >
                                        <td class="w-6">
                                          <div class={`w-2 h-2 rounded-full mx-auto ${isActive(row.id) ? 'bg-primary' : isSelected(row.id) ? 'bg-primary/40' : 'bg-base-300'}`} />
                                        </td>
                                        <td class="font-medium truncate">{row.label}</td>
                                        <For each={getVisibleColumnsForFamily(subFamily, props.panelWidth)}>
                                          {(column) => (
                                            <td class="text-right font-mono truncate">{formatMetric(row.metrics[column.key], column)}</td>
                                          )}
                                        </For>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </Show>
                          </div>
                        )}
                      </For>
                    </Show>
                    {/* Single family — show rows directly */}
                    <Show when={sectionFamilies().length === 1 && firstFamily()}>
                    <table class="table table-xs table-fixed w-full">
                      <thead>
                        <tr class="bg-base-200/70">
                          <th class="w-6" />
                          <th class="w-[11rem]">Structure</th>
                          <For each={getVisibleColumnsForFamily(firstFamily()!, props.panelWidth)}>
                            {(column) => (
                              <th
                                class="cursor-pointer select-none text-right"
                                onClick={() => props.onSortFamily(firstFamily()!.id, column.key)}
                              >
                                {column.label}{sortIndicator(firstFamily()!, column.key)}
                              </th>
                            )}
                          </For>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={getSortedRowsForFamily(
                          firstFamily()!,
                          props.projectTable.rows,
                          getVisibleColumnsForFamily(firstFamily()!, props.panelWidth),
                        ).filter((r) => !isRowHidden(r.id))}>
                          {(row) => (
                            <tr
                              class={`cursor-pointer hover:bg-base-200 group/row ${
                                isActive(row.id)
                                  ? 'bg-primary/10'
                                  : isSelected(row.id)
                                    ? 'bg-primary/5'
                                    : ''
                              }`}
                              onClick={(e) => handleRowClick(row.id, e)}
                              data-testid={`project-row-${row.id}`}
                            >
                              <td>
                                <div
                                  class={`w-2 h-2 rounded-full mx-auto ${
                                    isActive(row.id)
                                      ? 'bg-primary'
                                      : isSelected(row.id)
                                        ? 'bg-primary/40'
                                        : 'bg-base-300'
                                  }`}
                                />
                              </td>
                              <td class="font-medium truncate">
                                <div class="flex items-center gap-1">
                                  <Show when={editingRowId() === row.id} fallback={
                                    <span
                                      class="truncate flex-1"
                                      title={row.label}
                                      onDblClick={(e) => { e.stopPropagation(); startRenameRow(row.id, row.label); }}
                                    >
                                      {row.label}
                                    </span>
                                  }>
                                    <input
                                      type="text"
                                      class="input input-xs input-bordered w-full font-medium"
                                      value={editText()}
                                      onInput={(e) => setEditText(e.currentTarget.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                                        else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                                      }}
                                      onBlur={commitRename}
                                      onClick={(e) => e.stopPropagation()}
                                      ref={(el) => requestAnimationFrame(() => { el.focus(); el.select(); })}
                                    />
                                  </Show>
                                  <button
                                    class="btn btn-ghost btn-xs btn-square opacity-0 group-hover/row:opacity-100 text-base-content/30 hover:text-base-content/60 flex-shrink-0 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); props.onHideRow(row.id); }}
                                    title="Hide row"
                                  >
                                    <EyeSlashIcon class="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                              <For each={getVisibleColumnsForFamily(firstFamily()!, props.panelWidth)}>
                                {(column) => (
                                  <td class="text-right font-mono truncate">
                                    {formatMetric(row.metrics[column.key], column)}
                                  </td>
                                )}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                    </Show>
                  </div>
                </Show>
              </div>
                </Show>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Unhide modal */}
      <Show when={showUnhideModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/50" onClick={() => setShowUnhideModal(false)} />
          <div class="relative bg-base-100 rounded-lg shadow-xl w-full max-w-sm mx-4 max-h-[60vh] flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
              <h3 class="text-sm font-bold">Hidden Items</h3>
              <button class="btn btn-ghost btn-sm btn-circle" onClick={() => setShowUnhideModal(false)}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <For each={SECTION_ORDER}>
                {(sectionType) => {
                  const sectionHidden = () => hiddenFamilies().filter((f) => f.jobType === sectionType);
                  return (
                    <Show when={sectionHidden().length > 0}>
                      <div>
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1">
                          {SECTION_LABELS[sectionType]}
                        </p>
                        <For each={sectionHidden()}>
                          {(family) => (
                            <div class="flex items-center justify-between py-1">
                              <span class="text-xs truncate">{family.title}</span>
                              <button
                                class="btn btn-ghost btn-xs"
                                onClick={() => props.onUnhideFamily(family.id)}
                              >
                                Unhide
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  );
                }}
              </For>
              <Show when={hiddenRowCount() > 0}>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1">
                    Individual Rows
                  </p>
                  <For each={props.projectTable.rows.filter((r) => isRowHidden(r.id))}>
                    {(row) => (
                      <div class="flex items-center justify-between py-1">
                        <span class="text-xs truncate">{row.label}</span>
                        <button
                          class="btn btn-ghost btn-xs"
                          onClick={() => props.onUnhideRow(row.id)}
                        >
                          Unhide
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Alignment toolbar — always visible, buttons enabled per selection */}
        <div class="px-3 py-1.5 border-t border-base-300">
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-base-content/55 mr-1">Align</span>
            <div class="btn-group">
              <button
                class={`btn btn-xs ${props.canAlignProtein ? 'btn-outline' : 'btn-disabled'}`}
                disabled={!props.canAlignProtein}
                onClick={() => props.onAlignProtein()}
                title="Align proteins by backbone (C-alpha)"
                data-testid="project-table-align-protein"
              >
                P
              </button>
              <button
                class={`btn btn-xs ${props.canAlignLigand ? 'btn-outline' : 'btn-disabled'}`}
                disabled={!props.canAlignLigand}
                onClick={() => props.onAlignLigand()}
                title="Align ligands by maximum common substructure"
                data-testid="project-table-align-ligand"
              >
                L
              </button>
              <button
                class={`btn btn-xs ${props.canAlignSubstructure ? 'btn-outline' : 'btn-disabled'}`}
                disabled={!props.canAlignSubstructure}
                onClick={() => props.onAlignSubstructure()}
                title={props.alignSubstructureLabel
                  ? `Align by ${props.alignSubstructureLabel}`
                  : 'Align by shared rigid substructure'}
                data-testid="project-table-align-substructure"
              >
                SS
              </button>
            </div>
            <Show when={props.hasAlignment}>
              <button
                class="btn btn-ghost btn-xs btn-square"
                onClick={() => props.onResetAlignment()}
                title="Reset alignment"
                data-testid="project-table-align-reset"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </Show>
            <Show when={props.alignSubstructureLabel}>
              <span class="text-[10px] text-base-content/55 ml-1">{props.alignSubstructureLabel}</span>
            </Show>
          </div>
        </div>

      <div class="relative px-3 py-2 border-t border-base-300 flex flex-col gap-1.5">
        <Show when={props.onViewResults}>
          <button
            class="btn btn-primary btn-sm w-full"
            onClick={() => props.onViewResults?.()}
            disabled={props.viewResultsDisabled}
            title={props.viewResultsTooltip || undefined}
            data-testid="project-table-view-results"
          >
            View Results
          </button>
        </Show>
        <div class="flex items-center gap-1.5">
        <div class="dropdown dropdown-top dropdown-start">
          <button
            type="button"
            class={`btn btn-outline btn-sm whitespace-nowrap ${props.canTransfer ? '' : 'btn-disabled'}`}
            disabled={!props.canTransfer}
            title={props.transferTooltip || undefined}
            data-testid="project-table-transfer"
          >
            Add to
            <svg class="w-3 h-3 ml-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <ul tabindex="0" class="dropdown-content menu menu-sm bg-base-100 rounded-box shadow-lg z-30 w-full mb-1">
            <li>
              <button
                onClick={() => props.onTransferDock()}
                disabled={!props.canTransferDock}
                title={props.transferDockTooltip || undefined}
                data-testid="project-table-transfer-dock"
              >
                Dock
              </button>
            </li>
            <li>
              <button
                onClick={() => props.onTransferMcmm()}
                disabled={!props.canTransferMcmm}
                title={props.transferMcmmTooltip || undefined}
                data-testid="project-table-transfer-mcmm"
              >
                MCMM
              </button>
            </li>
            <li>
              <button
                onClick={() => props.onTransferSimulate()}
                disabled={!props.canTransferSimulate}
                title={props.transferSimulateTooltip || undefined}
                data-testid="project-table-transfer-simulate"
              >
                Dynamics
              </button>
            </li>
          </ul>
        </div>
        <button
          ref={(el) => { importButtonRef = el; }}
          class={`btn btn-outline btn-sm flex-1 min-w-0 px-2 ${showImportPopover() ? 'btn-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setShowImportPopover((open) => !open);
          }}
          data-testid="project-table-import"
        >
          Import
        </button>
        <button
          class="btn btn-outline btn-sm flex-1 min-w-0 px-2"
          onClick={() => props.onExport()}
          disabled={!props.canExport}
          data-testid="project-table-export"
        >
          Export
        </button>
        </div>
        <Show when={showImportPopover()}>
          <div
            ref={(el) => { importPopoverRef = el; }}
            class="absolute bottom-full left-3 right-3 mb-2 z-40 rounded-lg border border-base-300 bg-base-100 shadow-xl"
          >
            <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
              <div>
                <div class="text-xs font-semibold">Import Into View</div>
                <div class="text-[10px] text-base-content/55">Browse files, fetch a PDB, or load SMILES</div>
              </div>
              <button
                class="btn btn-ghost btn-xs btn-square"
                onClick={() => setShowImportPopover(false)}
                title="Close import popover"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="p-3">
              <ImportInputPanel
                compact
                importButtonLabel="Browse structures"
                onImport={props.onBrowseImport}
                importDisabled={props.importDisabled}
                importLoading={props.importLoading}
                showPdbFetch={true}
                pdbIdValue={props.importPdbIdValue}
                onPdbIdInput={props.onImportPdbIdInput}
                onFetchPdb={props.onFetchImportPdb}
                fetchDisabled={props.importPdbFetchDisabled}
                fetchLoading={props.importPdbFetchLoading}
                showSmiles={true}
                smilesValue={props.importSmilesValue}
                onSmilesInput={props.onImportSmilesInput}
                onSubmitSmiles={props.onSubmitImportSmiles}
                smilesDisabled={props.importSmilesDisabled}
                smilesLoading={props.importSmilesLoading}
                smilesCount={props.importSmilesCount}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ProjectTable;
