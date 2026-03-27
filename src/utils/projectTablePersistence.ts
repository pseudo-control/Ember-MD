// Copyright (c) 2026 Ember Contributors. MIT License.
import type {
  ViewerProjectFamily,
  ViewerProjectRow,
  ViewerProjectTableState,
  ViewerQueueItem,
} from '../stores/workflow';

const TABLE_FILENAME = 'project-table.json';

type PersistedRow = Record<string, unknown> & {
  id?: string;
  familyId?: string;
  label?: string;
  rowKind?: ViewerProjectRow['rowKind'];
  jobType?: ViewerProjectRow['jobType'];
  item?: Record<string, unknown> & {
    pdbPath?: string;
    ligandPath?: string;
    label?: string;
    type?: ViewerQueueItem['type'];
  };
  loadKind?: ViewerProjectTableState['rows'][number]['loadKind'];
  queueIndex?: number;
  metrics?: ViewerProjectTableState['rows'][number]['metrics'];
  trajectoryPath?: string | null;
  pocketLigandPath?: string | null;
  pocketSourcePdbPath?: string | null;
};

type PersistedFamily = Record<string, unknown> & {
  id?: string;
  title?: string;
  jobType?: ViewerProjectTableState['families'][number]['jobType'];
  collapsed?: boolean;
  rowIds?: string[];
  columns?: ViewerProjectTableState['families'][number]['columns'];
  sortKey?: string | null;
  sortDirection?: ViewerProjectTableState['families'][number]['sortDirection'];
  trajectoryPath?: string | null;
};

const ROW_KINDS = new Set<ViewerProjectRow['rowKind']>([
  'apo',
  'holo',
  'ligand',
  'prepared-ligand',
  'pose',
  'input',
  'conformer',
  'initial-complex',
  'cluster',
]);

const JOB_TYPES = new Set<ViewerProjectRow['jobType']>([
  'import',
  'docking',
  'conformer',
  'simulation',
  'scoring',
]);

const LOAD_KINDS = new Set<ViewerProjectRow['loadKind']>([
  'structure',
  'standalone-ligand',
  'queue',
]);

const SORT_DIRECTIONS = new Set<NonNullable<ViewerProjectFamily['sortDirection']>>([
  'asc',
  'desc',
]);

export function serializeProjectTable(table: ViewerProjectTableState): string {
  return JSON.stringify(table);
}

/**
 * Parse and validate a persisted project table. Checks that referenced files
 * still exist on disk — rows with dead paths are silently removed.
 * Returns null if nothing survives validation.
 */
export async function deserializeAndValidateProjectTable(
  raw: unknown,
  fileExists: (path: string) => Promise<boolean>,
): Promise<ViewerProjectTableState | null> {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.families) || !Array.isArray(data.rows)) return null;

  // Collect all unique paths to check in parallel
  const rows = data.rows as PersistedRow[];
  const pathSet = new Map<string, boolean>();
  for (const row of rows) {
    if (!row?.id || !row?.item?.pdbPath) continue;
    pathSet.set(row.item.pdbPath, false);
    if (row.item.ligandPath) pathSet.set(row.item.ligandPath, false);
  }

  // Parallel file existence checks
  const paths = [...pathSet.keys()];
  const results = await Promise.all(paths.map((p) => fileExists(p)));
  for (let i = 0; i < paths.length; i++) {
    pathSet.set(paths[i], results[i]);
  }

  // Filter rows using precomputed existence map
  const validRows: ViewerProjectTableState['rows'] = [];
  for (const row of rows) {
    if (!row?.id || !row?.item?.pdbPath) continue;
    if (!pathSet.get(row.item.pdbPath)) continue;
    if (typeof row.familyId !== 'string' || typeof row.label !== 'string') continue;
    if (!ROW_KINDS.has(row.rowKind as ViewerProjectRow['rowKind'])) continue;
    if (!JOB_TYPES.has(row.jobType as ViewerProjectRow['jobType'])) continue;
    if (typeof row.item.label !== 'string') continue;
    const rowKind = row.rowKind as ViewerProjectRow['rowKind'];
    const jobType = row.jobType as ViewerProjectRow['jobType'];
    const ligandOk = !row.item.ligandPath || pathSet.get(row.item.ligandPath);
    const item: ViewerQueueItem = {
      pdbPath: row.item.pdbPath,
      label: row.item.label,
      ...(ligandOk && row.item.ligandPath ? { ligandPath: row.item.ligandPath } : {}),
      ...(row.item.type === 'protein' || row.item.type === 'ligand' || row.item.type === 'conformer'
        ? { type: row.item.type }
        : {}),
    };
    const normalized: ViewerProjectRow = {
      id: row.id,
      familyId: row.familyId,
      label: row.label,
      rowKind,
      jobType,
      item,
      loadKind: LOAD_KINDS.has(row.loadKind as ViewerProjectRow['loadKind'])
        ? row.loadKind as ViewerProjectRow['loadKind']
        : 'structure',
      ...(typeof row.queueIndex === 'number' ? { queueIndex: row.queueIndex } : {}),
      metrics: row.metrics && typeof row.metrics === 'object' ? row.metrics : {},
      ...(typeof row.trajectoryPath === 'string' || row.trajectoryPath === null ? { trajectoryPath: row.trajectoryPath } : {}),
      ...(typeof row.pocketLigandPath === 'string' || row.pocketLigandPath === null ? { pocketLigandPath: row.pocketLigandPath } : {}),
      ...(typeof row.pocketSourcePdbPath === 'string' || row.pocketSourcePdbPath === null ? { pocketSourcePdbPath: row.pocketSourcePdbPath } : {}),
    };
    validRows.push(normalized);
  }

  if (validRows.length === 0) return null;

  const validRowIds = new Set(validRows.map((r) => r.id));

  // Prune families — remove dead rowIds, drop empty families, default missing fields
  const validFamilies: ViewerProjectTableState['families'] = [];
  for (const fam of data.families as PersistedFamily[]) {
    if (!fam?.id || !Array.isArray(fam.rowIds)) continue;
    const liveRowIds = fam.rowIds.filter((id: string) => validRowIds.has(id));
    if (liveRowIds.length === 0) continue;
    validFamilies.push({
      id: fam.id,
      title: typeof fam.title === 'string' ? fam.title : '',
      jobType: JOB_TYPES.has(fam.jobType as ViewerProjectFamily['jobType'])
        ? fam.jobType as ViewerProjectFamily['jobType']
        : 'docking',
      collapsed: typeof fam.collapsed === 'boolean' ? fam.collapsed : false,
      rowIds: liveRowIds,
      columns: Array.isArray(fam.columns) ? fam.columns : [],
      sortKey: fam.sortKey ?? null,
      sortDirection: SORT_DIRECTIONS.has(fam.sortDirection as NonNullable<ViewerProjectFamily['sortDirection']>)
        ? fam.sortDirection as ViewerProjectFamily['sortDirection']
        : undefined,
      trajectoryPath: fam.trajectoryPath ?? null,
    });
  }

  if (validFamilies.length === 0) return null;

  const validFamilyIds = new Set(validFamilies.map((f) => f.id));

  const activeRowId = validRowIds.has(data.activeRowId as string)
    ? (data.activeRowId as string)
    : null;

  const selectedRowIds = Array.isArray(data.selectedRowIds)
    ? (data.selectedRowIds as string[]).filter((id) => validRowIds.has(id))
    : [];

  // Filter hiddenFamilyIds against surviving families (prune orphaned refs from deleted families)
  const hiddenFamilyIds = Array.isArray(data.hiddenFamilyIds)
    ? (data.hiddenFamilyIds as string[]).filter((id) => validFamilyIds.has(id))
    : [];

  const hiddenRowIds = Array.isArray(data.hiddenRowIds)
    ? (data.hiddenRowIds as string[]).filter((id) => validRowIds.has(id))
    : [];

  return { families: validFamilies, rows: validRows, activeRowId, selectedRowIds, hiddenFamilyIds, hiddenRowIds };
}

/**
 * Create a debounced saver that writes the project table to disk.
 * Uses existing writeTextFile IPC — no new channels needed.
 */
export function createProjectTableSaver(
  getProjectDir: () => string | null,
  writeTextFile: (path: string, content: string) => Promise<unknown>,
  debounceMs = 500,
): (table: ViewerProjectTableState | null) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (table: ViewerProjectTableState | null) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const dir = getProjectDir();
      if (!dir) return;
      const filePath = `${dir}/${TABLE_FILENAME}`;
      if (!table || table.families.length === 0) {
        await writeTextFile(filePath, '{}').catch(() => {});
        return;
      }
      await writeTextFile(filePath, serializeProjectTable(table)).catch(() => {});
    }, debounceMs);
  };
}
