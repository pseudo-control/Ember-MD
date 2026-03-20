import type { ElectronAPI } from '../../shared/types/electron-api';
import type { ProjectJob } from '../../shared/types/ipc';
import { workflowStore } from '../stores/workflow';
import { buildDockingViewerQueue } from './viewerQueue';

export async function loadProjectJob(job: ProjectJob, api: ElectronAPI): Promise<void> {
  const {
    clearViewerSession,
    openViewerSession,
    setMode,
    setDockOutputDir,
    setDockResults,
    setDockReceptorPdbPath,
    setDockStep,
    setDockCordialScored,
    setMdResult,
    setMdOutputDir,
    setMdStep,
    setConformOutputDir,
    setConformPaths,
    setConformOutputName,
    setConformLigandName,
    setConformStep,
  } = workflowStore;

  if (job.type === 'docking-pose') {
    if (!job.receptorPdb || !job.poses || job.poses.length === 0) return;

    const queue = buildDockingViewerQueue(job.receptorPdb, job.poses);
    const selectedPoseIndex = Math.min(Math.max(job.poseIndex ?? 0, 0), queue.length - 1);
    const selectedPose = job.poses[selectedPoseIndex];

    openViewerSession({
      pdbPath: job.receptorPdb,
      ligandPath: selectedPose?.path || job.ligandPath || null,
      pdbQueue: queue,
      pdbQueueIndex: selectedPoseIndex,
    });
    return;
  }

  if (job.type === 'docking') {
    try {
      const parseResult = await api.parseDockResults(job.path);
      if (parseResult.ok) {
        setDockOutputDir(job.path);
        setDockResults(parseResult.value);
        if (job.receptorPdb) setDockReceptorPdbPath(job.receptorPdb);
        setDockCordialScored(parseResult.value.some((r: any) => r.cordialExpectedPkd != null));
        setMode('dock');
        setDockStep('dock-results');
      } else if (job.poses && job.poses.length > 0 && job.receptorPdb) {
        const queue = buildDockingViewerQueue(job.receptorPdb, job.poses);
        openViewerSession({
          pdbPath: queue[0].pdbPath,
          ligandPath: queue[0].ligandPath || null,
          pdbQueue: queue,
          pdbQueueIndex: 0,
        });
      } else {
        clearViewerSession();
        setMode('viewer');
      }
    } catch {
      clearViewerSession();
      setMode('viewer');
    }
    return;
  }

  if (job.type === 'simulation') {
    const systemPdb = job.systemPdb || '';
    const trajectoryDcd = job.trajectoryDcd || '';
    const finalPdb = job.finalPdb || systemPdb;

    if (systemPdb && trajectoryDcd) {
      setMdResult({
        systemPdbPath: systemPdb,
        trajectoryPath: trajectoryDcd,
        equilibratedPdbPath: systemPdb,
        finalPdbPath: finalPdb,
        energyCsvPath: trajectoryDcd.replace('trajectory.dcd', 'energy.csv'),
      });
      setMdOutputDir(job.path);
      setMode('md');
      setMdStep('md-results');
    } else {
      openViewerSession({
        pdbPath: finalPdb || null,
      });
    }
    return;
  }

  if (job.type === 'conformer') {
    const conformerPaths = job.conformerPaths || [];
    setConformOutputDir(job.path);
    setConformPaths(conformerPaths);
    setConformOutputName(job.folder);
    setConformLigandName(job.folder);
    setMode('conform');
    setConformStep('conform-results');
  }
}
