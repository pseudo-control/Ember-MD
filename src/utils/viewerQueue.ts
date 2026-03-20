import type { ProjectJobPose } from '../../shared/types/ipc';
import type { ViewerQueueItem } from '../stores/workflow';

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
