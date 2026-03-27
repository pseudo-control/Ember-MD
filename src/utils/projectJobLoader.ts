// Copyright (c) 2026 Ember Contributors. MIT License.
import type { ElectronAPI } from '../../shared/types/electron-api';
import type { ClusteringResult, ProjectJob, ScoredClusterResult } from '../../shared/types/ipc';
import { workflowStore } from '../stores/workflow';
import { buildDockingViewerQueue } from './viewerQueue';

type StoredScoreEntry = {
  id: string;
  pdbPath: string;
  name: string;
  ligandId: string | null;
  isPrepared: boolean;
  preparedReceptorPath: string | null;
  extractedLigandSdfPath: string | null;
  vinaScore: number | null;
  cordialExpectedPkd: number | null;
  cordialPHighAffinity: number | null;
  qed: number | null;
  status: 'pending' | 'detecting' | 'preparing' | 'scoring' | 'done' | 'error';
  errorMessage: string | null;
};

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
    setMdClusteringResultsFromIpc,
    setMdClusterScores,
    setMdTorsionAnalysis,
    setConformOutputDir,
    setConformPaths,
    setConformOutputName,
    setConformLigandName,
    setConformStep,
    setScoreEntries,
    setScoreOutputDir,
    setScoreCordialAvailable,
    setScoreStep,
    setXrayOutputDir,
    setXrayResult,
    setXrayStep,
  } = workflowStore;

  const loadClusterScores = async () => {
    const candidatePaths = [`${job.path}/analysis/scored_clusters/cluster_scores.json`];
    for (const candidatePath of candidatePaths) {
      const scoreData = await api.readJsonFile(candidatePath) as { clusters?: unknown[] } | null;
      if (scoreData && Array.isArray(scoreData.clusters)) {
        return scoreData.clusters as ScoredClusterResult[];
      }
    }
    return [];
  };

  const loadClusteringResults = async () => {
    const candidatePaths = [
      job.clusteringResultsPath,
      `${job.path}/analysis/clustering/clustering_results.json`,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidatePath of candidatePaths) {
      const clusteringData = await api.readJsonFile(candidatePath) as {
        clusters?: unknown[];
        frameAssignments?: unknown[];
        requestedClusters?: unknown;
        actualClusters?: unknown;
      } | null;
      if (!clusteringData || !Array.isArray(clusteringData.clusters) || !Array.isArray(clusteringData.frameAssignments)) {
        continue;
      }
      return {
        clusters: clusteringData.clusters as ClusteringResult['clusters'],
        frameAssignments: clusteringData.frameAssignments as number[],
        outputDir: candidatePath.replace(/\/clustering_results\.json$/, ''),
        requestedClusters: typeof clusteringData.requestedClusters === 'number' ? clusteringData.requestedClusters : undefined,
        actualClusters: typeof clusteringData.actualClusters === 'number' ? clusteringData.actualClusters : undefined,
      };
    }

    return null;
  };

  const loadMdTorsionAnalysis = async () => {
    return api.loadMdTorsionAnalysis({ analysisDir: `${job.path}/analysis` });
  };

  if (job.type === 'docking') {
    try {
      const parseResult = await api.parseDockResults(job.path);
      if (parseResult.ok) {
        setDockOutputDir(job.path);
        setDockResults(parseResult.value);
        if (job.receptorPdb) setDockReceptorPdbPath(job.receptorPdb);
        setDockCordialScored(parseResult.value.some((r) => r.cordialExpectedPkd != null));
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
    const trajectoryName = trajectoryDcd.split('/').pop() || '';
    const energyCsvPath = trajectoryName.endsWith('_trajectory.dcd')
      ? trajectoryDcd.replace(/_trajectory\.dcd$/, '_energy.csv')
      : trajectoryDcd.replace(/trajectory\.dcd$/, 'energy.csv');

    if (systemPdb && trajectoryDcd) {
      const [clusteringResults, clusterScores, torsionAnalysis] = await Promise.all([
        loadClusteringResults(),
        loadClusterScores(),
        loadMdTorsionAnalysis(),
      ]);
      setMdClusteringResultsFromIpc(clusteringResults);
      setMdClusterScores(clusterScores as ScoredClusterResult[]);
      setMdTorsionAnalysis(torsionAnalysis.ok ? torsionAnalysis.value : null);
      setMdResult({
        systemPdbPath: systemPdb,
        trajectoryPath: trajectoryDcd,
        equilibratedPdbPath: systemPdb,
        finalPdbPath: finalPdb,
        energyCsvPath,
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
    setConformOutputName(job.metadata.descriptor || job.folder);
    setConformLigandName(job.metadata.descriptor || job.folder);
    setMode('conform');
    setConformStep('conform-results');
    return;
  }

  if (job.type === 'scoring') {
    const scoreData = job.scoreResultsJson
      ? await api.readJsonFile(job.scoreResultsJson) as { entries?: StoredScoreEntry[] } | null
      : null;
    const entries = Array.isArray(scoreData?.entries) ? scoreData!.entries! : [];
    setScoreEntries(entries.map((entry) => ({
      id: entry.id,
      pdbPath: entry.pdbPath,
      name: entry.name,
      detectedLigands: [],
      selectedLigandId: entry.ligandId,
      isPrepared: entry.isPrepared,
      preparedReceptorPath: entry.preparedReceptorPath,
      extractedLigandSdfPath: entry.extractedLigandSdfPath,
      vinaScore: entry.vinaScore,
      cordialExpectedPkd: entry.cordialExpectedPkd,
      cordialPHighAffinity: entry.cordialPHighAffinity,
      qed: entry.qed,
      status: entry.status,
      errorMessage: entry.errorMessage,
    })));
    setScoreCordialAvailable(entries.some((entry) => entry.cordialExpectedPkd != null));
    setScoreOutputDir(job.path);
    setMode('score');
    setScoreStep('score-results');
    return;
  }

  if (job.type === 'xray') {
    setXrayOutputDir(job.path);
    setXrayResult({
      inputDir: `${job.path}/inputs`,
      outputDir: `${job.path}/results`,
      pdfPaths: job.xrayReportPaths || [],
    });
    setMode('xray');
    setXrayStep('xray-results');
  }
}
