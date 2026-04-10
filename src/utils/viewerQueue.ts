// Copyright (c) 2026 Ember Contributors. MIT License.
import type { ProjectJobPose, ProjectJob } from '../../shared/types/ipc';
import type { DockResult } from '../../shared/types/dock';
import type {
  ViewerProjectColumn,
  ViewerProjectFamily,
  ViewerProjectJobType,
  ViewerProjectRow,
  ViewerProjectTableState,
  ViewerQueueItem,
} from '../stores/workflow';

export function formatDockingQueueLabel(pose: Pick<ProjectJobPose, 'name' | 'affinity'>): string {
  return `${pose.name}${pose.affinity != null ? ` (${pose.affinity.toFixed(1)} kcal/mol)` : ''}`;
}

export function buildDockingViewerQueue(
  receptorPdb: string,
  poses: Array<Pick<ProjectJobPose, 'name' | 'path' | 'affinity'>>,
): ViewerQueueItem[] {
  return poses.map((pose) => ({
    pdbPath: receptorPdb,
    ligandPath: pose.path,
    label: formatDockingQueueLabel(pose),
  }));
}

export function buildConformerViewerQueue(paths: string[]): ViewerQueueItem[] {
  return paths.map((sdfPath, index) => ({
    pdbPath: sdfPath,
    label: `Conformer ${index + 1}`,
    type: 'conformer' as const,
  }));
}

const percent = (value: number | null | undefined): string | number | null =>
  value == null ? null : value;

export function buildDockingProjectTable(options: {
  familyId: string;
  title: string;
  poses: DockResult[];
  poseQueue: ViewerQueueItem[];
  selectedQueueIndex: number;
}): ViewerProjectTableState {
  const {
    familyId,
    title,
    poses,
    poseQueue,
    selectedQueueIndex,
  } = options;

  const rows = poses.map<ViewerProjectRow>((pose, index) => ({
    id: `${familyId}:pose:${index}`,
    familyId,
    label: formatDockingQueueLabel({
      name: pose.ligandName,
      affinity: pose.vinaAffinity ?? pose.vinaScoreOnlyAffinity ?? undefined,
    }),
    rowKind: 'pose',
    jobType: 'docking',
    item: poseQueue[index],
    loadKind: 'queue',
    queueIndex: index,
    metrics: {
      vinaAffinity: pose.vinaAffinity ?? pose.vinaScoreOnlyAffinity ?? null,
      cordialPHighAffinity: percent(pose.cordialPHighAffinity),
      qed: pose.qed,
      xtbEnergyKcal: pose.xtbEnergyKcal ?? null,
    },
  }));

  const columns: ViewerProjectColumn[] = [];
  if (rows.some((row) => row.metrics.vinaAffinity != null)) {
    columns.push({ key: 'vinaAffinity', label: 'Vina', kind: 'number', priority: 0, minPanelWidth: 0 });
  }
  if (rows.some((row) => row.metrics.cordialPHighAffinity != null)) {
    columns.push({ key: 'cordialPHighAffinity', label: 'P(<1uM)', kind: 'percent', priority: 1, minPanelWidth: 360 });
  }
  if (rows.some((row) => row.metrics.qed != null)) {
    columns.push({ key: 'qed', label: 'QED', kind: 'number', priority: 2, minPanelWidth: 420 });
  }
  if (rows.some((row) => row.metrics.xtbEnergyKcal != null)) {
    columns.push({ key: 'xtbEnergyKcal', label: 'xTB', kind: 'number', priority: 3, minPanelWidth: 500 });
  }

  const families: ViewerProjectFamily[] = [
    {
      id: familyId,
      title,
      jobType: 'docking',
      collapsed: true,
      rowIds: rows.map((row) => row.id),
      columns,
      sortKey: rows.some((row) => row.metrics.cordialPHighAffinity != null) ? 'cordialPHighAffinity' : 'vinaAffinity',
      sortDirection: rows.some((row) => row.metrics.cordialPHighAffinity != null) ? 'desc' : 'asc',
    },
  ];

  return {
    families,
    rows,
    activeRowId: rows[selectedQueueIndex]?.id ?? rows[0]?.id ?? null,
    selectedRowIds: [rows[selectedQueueIndex]?.id ?? rows[0]?.id].filter(Boolean) as string[],
    hiddenFamilyIds: [],
    hiddenRowIds: [],
  };
}

export function buildConformerProjectTable(options: {
  familyId: string;
  title: string;
  conformerPaths: string[];
  conformerEnergies: Record<string, number>;
}): ViewerProjectTableState {
  const { familyId, title, conformerPaths, conformerEnergies } = options;
  const rows: ViewerProjectRow[] = [];

  const conformerRows = conformerPaths.map<ViewerProjectRow>((sdfPath, index) => {
    const energy = sdfPath in conformerEnergies
      ? conformerEnergies[sdfPath]
      : (Object.entries(conformerEnergies).find(([key]) => key.endsWith(`/${sdfPath.split('/').pop()}`))?.[1] ?? null);

    return {
      id: `${familyId}:conformer:${index}`,
      familyId,
      label: `Conformer ${index + 1}`,
      rowKind: 'conformer',
      jobType: 'conformer',
      item: { pdbPath: sdfPath, label: `Conformer ${index + 1}`, type: 'conformer' },
      loadKind: 'queue',
      queueIndex: index,
      metrics: {
        relativeEnergy: energy,
      },
    };
  });

  rows.push(...conformerRows);

  return {
    families: [{
      id: familyId,
      title,
      jobType: 'conformer',
      collapsed: true,
      rowIds: rows.map((row) => row.id),
      columns: [{ key: 'relativeEnergy', label: 'Rel E', kind: 'number', priority: 0, minPanelWidth: 0 }],
      sortKey: 'relativeEnergy',
      sortDirection: 'asc',
    }],
    rows,
    activeRowId: conformerRows[0]?.id ?? rows[0]?.id ?? null,
    selectedRowIds: [conformerRows[0]?.id ?? rows[0]?.id].filter(Boolean) as string[],
    hiddenFamilyIds: [],
    hiddenRowIds: [],
  };
}

export function buildMdProjectTable(options: {
  familyId: string;
  title: string;
  trajectoryPath?: string | null;
  queueBackedClusters?: boolean;
  clusters: Array<{
    clusterId: number;
    population: number;
    centroidPdbPath?: string;
    vinaRescore?: number;
    cordialPHighAffinity?: number;
  }>;
}): ViewerProjectTableState {
  const { familyId, title, trajectoryPath, clusters, queueBackedClusters = true } = options;
  const rows: ViewerProjectRow[] = [];

  rows.push(...clusters
    .filter((cluster) => cluster.centroidPdbPath)
    .map<ViewerProjectRow>((cluster, index) => ({
      id: `${familyId}:cluster:${cluster.clusterId}`,
      familyId,
      label: `Cluster ${cluster.clusterId + 1}`,
      rowKind: 'cluster',
      jobType: 'simulation',
      item: {
        pdbPath: cluster.centroidPdbPath!,
        label: `Cluster ${cluster.clusterId + 1} (${cluster.population.toFixed(0)}%)`,
      },
      loadKind: queueBackedClusters ? 'queue' : 'structure',
      queueIndex: queueBackedClusters ? index : undefined,
      metrics: {
        population: cluster.population / 100,
        vinaRescore: cluster.vinaRescore ?? null,
        cordialPHighAffinity: percent(cluster.cordialPHighAffinity),
      },
    })));

  return {
    families: [{
      id: familyId,
      title,
      jobType: 'simulation',
      collapsed: true,
      rowIds: rows.map((row) => row.id),
      columns: [
        { key: 'population', label: 'Pop%', kind: 'percent', priority: 0, minPanelWidth: 0 },
        ...(rows.some((row) => row.metrics.vinaRescore != null)
          ? [{ key: 'vinaRescore', label: 'Vina', kind: 'number', priority: 1, minPanelWidth: 360 } satisfies ViewerProjectColumn]
          : []),
        ...(rows.some((row) => row.metrics.cordialPHighAffinity != null)
          ? [{ key: 'cordialPHighAffinity', label: 'P(<1uM)', kind: 'percent', priority: 2, minPanelWidth: 420 } satisfies ViewerProjectColumn]
          : []),
      ],
      sortKey: 'population',
      sortDirection: 'desc',
      trajectoryPath: trajectoryPath ?? null,
    }],
    rows,
    activeRowId: rows[0]?.id ?? null,
    selectedRowIds: [rows[0]?.id].filter(Boolean) as string[],
    hiddenFamilyIds: [],
    hiddenRowIds: [],
  };
}

const IMPORT_FAMILY_ID = 'imports';

export function buildImportFamily(options: {
  filePaths: string[];
  fileTypes: Array<'protein' | 'ligand'>;
  labels?: string[];
}): { family: ViewerProjectFamily; rows: ViewerProjectRow[] } {
  const { filePaths, fileTypes, labels } = options;
  const familyId = IMPORT_FAMILY_ID;

  const rows: ViewerProjectRow[] = filePaths.map((filePath, index) => {
    const fileName = filePath.split('/').pop() ?? filePath;
    const rowLabel = labels?.[index]?.trim() || fileName;
    // Use a hash of the path for stable, deduplicate-safe row IDs
    const pathHash = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
    const isLigand = fileTypes[index] === 'ligand';
    return {
      id: `${familyId}:${pathHash}`,
      familyId,
      label: rowLabel,
      rowKind: isLigand ? 'ligand' as const : 'apo' as const,
      jobType: 'import' as const,
      item: {
        pdbPath: filePath,
        label: rowLabel,
        ...(isLigand ? { type: 'ligand' as const } : {}),
      },
      loadKind: isLigand ? 'standalone-ligand' as const : 'structure' as const,
      metrics: {},
    };
  });

  const family: ViewerProjectFamily = {
    id: familyId,
    title: 'Imports',
    jobType: 'import',
    collapsed: false,
    rowIds: rows.map((r) => r.id),
    columns: [],
  };

  return { family, rows };
}

/**
 * Build a complete project table from all scanned jobs + imported structures.
 * Creates one family per job, all collapsed. Used to auto-populate the viewer
 * project table when a project is selected.
 */
export function buildProjectTableFromJobs(
  jobs: ProjectJob[],
  importedFiles?: string[],
): ViewerProjectTableState {
  const allFamilies: ViewerProjectFamily[] = [];
  const allRows: ViewerProjectRow[] = [];

  const jobTypeMap: Record<string, ViewerProjectJobType> = {
    docking: 'docking',
    simulation: 'simulation',
    conformer: 'conformer',
    scoring: 'scoring',
  };

  for (const job of jobs) {
    // Skip x-ray jobs (PDFs, not viewable in the 3D viewer)
    if (job.type === 'xray') continue;

    const familyId = `job:${job.type}:${job.folder}`;
    const jobType = jobTypeMap[job.type];
    if (!jobType) continue;
    const rows: ViewerProjectRow[] = [];

    // Build summary row for each job
    const summaryLabel = job.label || job.folder;
    const summaryRow: ViewerProjectRow = {
      id: `${familyId}:summary`,
      familyId,
      label: summaryLabel,
      rowKind: 'apo',
      jobType,
      item: { pdbPath: job.path, label: summaryLabel },
      loadKind: 'structure',
      metrics: {},
    };

    if (job.type === 'docking' && job.poses) {
      for (let i = 0; i < job.poses.length; i++) {
        const pose = job.poses[i];
        rows.push({
          id: `${familyId}:pose:${i}`,
          familyId,
          label: formatDockingQueueLabel(pose),
          rowKind: 'pose',
          jobType: 'docking',
          item: { pdbPath: pose.path, label: pose.name },
          loadKind: 'structure',
          metrics: { vinaAffinity: pose.affinity ?? null },
        });
      }
    } else if (job.type === 'conformer' && job.conformerPaths) {
      for (let i = 0; i < job.conformerPaths.length; i++) {
        const p = job.conformerPaths[i];
        const name = p.split('/').pop() || `Conformer ${i + 1}`;
        rows.push({
          id: `${familyId}:conf:${i}`,
          familyId,
          label: name,
          rowKind: 'conformer',
          jobType: 'conformer',
          item: { pdbPath: p, label: name, type: 'conformer' },
          loadKind: 'standalone-ligand',
          metrics: {},
        });
      }
    } else if (job.type === 'simulation' && job.systemPdb) {
      rows.push({
        id: `${familyId}:system`,
        familyId,
        label: 'Initial complex',
        rowKind: 'initial-complex',
        jobType: 'simulation',
        item: { pdbPath: job.systemPdb, label: 'Initial complex' },
        loadKind: 'structure',
        metrics: {},
        trajectoryPath: job.trajectoryDcd || null,
      });
      // Add cluster centroid rows when clustering data exists
      if (job.clusterDir && job.clusterCount && job.clusterCount > 0) {
        for (let i = 0; i < job.clusterCount; i++) {
          const centroidPath = `${job.clusterDir}/cluster_${i}_centroid.pdb`;
          rows.push({
            id: `${familyId}:cluster:${i}`,
            familyId,
            label: `Cluster ${i + 1}`,
            rowKind: 'cluster',
            jobType: 'simulation',
            item: { pdbPath: centroidPath, label: `Cluster ${i + 1}` },
            loadKind: rows.length > 1 ? 'queue' : 'structure',
            queueIndex: i,
            metrics: {},
          });
        }
      }
    } else {
      rows.push(summaryRow);
    }

    const columns: ViewerProjectColumn[] = [];
    if (job.type === 'docking') {
      columns.push({ key: 'vinaAffinity', label: 'Vina', kind: 'number', priority: 0 });
    }

    allFamilies.push({
      id: familyId,
      title: job.metadata.descriptor || job.folder,
      jobType,
      collapsed: true,
      rowIds: rows.map((r) => r.id),
      columns,
      trajectoryPath: job.trajectoryDcd || null,
    });
    allRows.push(...rows);
  }

  // Add imported structures
  if (importedFiles && importedFiles.length > 0) {
    const importFamily = buildImportFamily({
      filePaths: importedFiles,
      fileTypes: importedFiles.map((f) => {
        const lower = f.toLowerCase();
        return (lower.endsWith('.sdf') || lower.endsWith('.mol') || lower.endsWith('.mol2'))
          ? 'ligand' : 'protein';
      }),
    });
    importFamily.family.collapsed = true;
    allFamilies.push(importFamily.family);
    allRows.push(...importFamily.rows);
  }

  return {
    families: allFamilies,
    rows: allRows,
    activeRowId: null,
    selectedRowIds: [],
    hiddenFamilyIds: [],
    hiddenRowIds: [],
  };
}
