// Copyright (c) 2026 Ember Contributors. MIT License.
/**
 * Project scanning and management handlers.
 * Covers project creation, scanning, renaming, deletion, structure import,
 * and artifact discovery (docking poses, simulation runs, conformers, maps).
 */
import { app, dialog, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { Ok, Err, Result } from '../../shared/types/result';
import { AppError } from '../../shared/types/errors';
import { IpcChannels } from '../../shared/types/ipc';
import {
  getEmberBaseDir,
  getLastSeenVersion,
  setEmberBaseDir,
  setLastSeenVersion,
} from '../app-state';
import { childProcesses } from '../spawn';
import type {
  ImportProjectJobRequest,
  JobMetadata,
  JobType,
  ProjectJob,
  ProjectJobPose,
  ProjectRunInfo,
} from '../../shared/types/ipc';
import {
  createJobMetadata,
  getJobCollectionDir,
  jobMetadataPath,
  readJobMetadata,
  resolveArtifactPath,
  writeJobMetadata,
} from '../job-metadata';

// ---------------------------------------------------------------------------
// Local types (not in shared/types)
// ---------------------------------------------------------------------------

type MapJobMetadata = {
  method?: 'static' | 'solvation' | 'probe';
  sourcePdbPath?: string;
  sourceTrajectoryPath?: string;
  ligandResname?: string;
  ligandResnum?: number;
  computedAt?: string;
};

const normalizePath = (inputPath: string) => path.resolve(inputPath);

const readProjectNameFromMetadata = (projectDir: string): string => {
  const idFile = path.join(projectDir, '.ember-project');
  let projectName = path.basename(projectDir);
  try {
    const meta = JSON.parse(fs.readFileSync(idFile, 'utf-8'));
    if (typeof meta.name === 'string' && meta.name.trim().length > 0) {
      projectName = meta.name.trim();
    }
  } catch { /* fall back to folder name */ }
  return projectName;
};

const promptForImportDestinationName = async (
  rootDir: string,
  sourceName: string,
  title: string,
  buttonLabel: string,
): Promise<string | null> => {
  const suggestion = `${sourceName}-imported`;
  const saveResult = await dialog.showSaveDialog({
    title,
    defaultPath: path.join(rootDir, suggestion),
    buttonLabel,
    showsTagField: false,
  });
  if (saveResult.canceled || !saveResult.filePath) return null;
  const chosenName = path.basename(saveResult.filePath).trim();
  return chosenName.length > 0 ? chosenName : null;
};

// ---------------------------------------------------------------------------
// Shared helpers (also used by other IPC modules — importable from here)
// ---------------------------------------------------------------------------

export const readJsonIfExists = <T>(jsonPath: string): T | null => {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as T;
  } catch {
    return null;
  }
};

export const getCanonicalAnalysisRoot = (runPath: string) =>
  path.join(runPath, 'analysis');

export const getCanonicalClusteringDir = (runPath: string) =>
  path.join(getCanonicalAnalysisRoot(runPath), 'clustering');

export const getCanonicalScoredClustersDir = (runPath: string) =>
  path.join(getCanonicalAnalysisRoot(runPath), 'scored_clusters');

// ---------------------------------------------------------------------------
// MD run path resolver — single source of truth for legacy + canonical layouts
// ---------------------------------------------------------------------------

export interface MdRunPaths {
  runDir: string;
  resultsDir: string;
  analysisDir: string;
  systemPdb: string | null;
  trajectory: string | null;
  finalPdb: string | null;
  equilibratedPdb: string | null;
  energyCsv: string | null;
  seed: string | null;
  log: string | null;
  checkpoint: string | null;
}

/** Resolve an MD file through: results/{name} → root/{name} → root/*_{name} */
function resolveFile(runDir: string, resultsDir: string | null, name: string,
  runFiles: string[], resultsFiles: string[]): string | null {
  if (resultsFiles.includes(name)) return path.join(resultsDir!, name);
  if (runFiles.includes(name)) return path.join(runDir, name);
  const legacy = runFiles.find((f) => f.endsWith(`_${name}`));
  return legacy ? path.join(runDir, legacy) : null;
}

/** Resolve all MD run paths. Returns null if no trajectory or usable structure. */
export function resolveMdRun(runDir: string): MdRunPaths | null {
  let runFiles: string[];
  try { runFiles = fs.readdirSync(runDir); } catch { return null; }

  const resultsDir = path.join(runDir, 'results');
  const resultsFiles = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir) : [];
  const rDir = resultsFiles.length > 0 ? resultsDir : null;

  const systemPdb = resolveFile(runDir, rDir, 'system.pdb', runFiles, resultsFiles);
  const trajectory = resolveFile(runDir, rDir, 'trajectory.dcd', runFiles, resultsFiles);
  const finalPdb = resolveFile(runDir, rDir, 'final.pdb', runFiles, resultsFiles);

  // Must have at least one structure file and ideally a trajectory
  if (!systemPdb && !finalPdb) return null;

  return {
    runDir,
    resultsDir,
    analysisDir: path.join(runDir, 'analysis'),
    systemPdb,
    trajectory,
    finalPdb,
    equilibratedPdb: resolveFile(runDir, rDir, 'equilibrated.pdb', runFiles, resultsFiles),
    energyCsv: resolveFile(runDir, rDir, 'energy.csv', runFiles, resultsFiles),
    seed: resolveFile(runDir, rDir, 'seed.txt', runFiles, resultsFiles),
    log: runFiles.includes('simulation.log') ? path.join(runDir, 'simulation.log') : null,
    checkpoint: resolveFile(runDir, rDir, 'checkpoint.chk', runFiles, resultsFiles),
  };
}

export const getSimulationClusterArtifacts = (runPath: string): {
  clusterDirPath?: string;
  clusteringResultsPath?: string;
  clusterCount: number;
} => {
  const clusterDirCandidates = [
    getCanonicalClusteringDir(runPath),
    path.join(runPath, 'results', 'analysis', 'clustering'),
    getCanonicalScoredClustersDir(runPath),
    path.join(runPath, 'results', 'analysis', 'scored_clusters'),
    path.join(runPath, 'clustering'),
  ];

  for (const candidateDir of clusterDirCandidates) {
    if (!fs.existsSync(candidateDir)) continue;
    const clusterFiles = fs.readdirSync(candidateDir).filter((f: string) => f.match(/cluster_\d+_centroid\.pdb/));
    if (clusterFiles.length === 0) continue;
    const clusteringResultsPath = path.join(candidateDir, 'clustering_results.json');
    return {
      clusterDirPath: candidateDir,
      clusteringResultsPath: fs.existsSync(clusteringResultsPath) ? clusteringResultsPath : undefined,
      clusterCount: clusterFiles.length,
    };
  }

  return { clusterCount: 0 };
};

/** Extract Vina affinity from first model of an .sdf.gz file */
export const extractVinaAffinity = (sdfGzPath: string): number | undefined => {
  try {
    const gzData = fs.readFileSync(sdfGzPath);
    const text = zlib.gunzipSync(gzData).toString('utf-8');
    const dockedMatch = text.match(/>  <minimizedAffinity>\s*\n([\-\d.]+)/);
    if (dockedMatch) return parseFloat(dockedMatch[1]);
    const scoreOnlyMatch = text.match(/>  <vinaScoreOnlyAffinity>\s*\n([\-\d.]+)/);
    if (scoreOnlyMatch) return parseFloat(scoreOnlyMatch[1]);
  } catch { /* ignore */ }
  return undefined;
};

export const getBindingSiteResultFile = (outputDir: string, projectName?: string): string | null => {
  const prefixedPath = projectName ? path.join(outputDir, `${projectName}_binding_site_results.json`) : null;
  if (prefixedPath && fs.existsSync(prefixedPath)) return prefixedPath;

  const legacyPath = path.join(outputDir, 'binding_site_results.json');
  if (fs.existsSync(legacyPath)) return legacyPath;

  return null;
};

export const writeMapMetadata = (
  outputDir: string,
  metadata: MapJobMetadata,
) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const metadataPath = path.join(outputDir, 'map_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
};

const JOB_COLLECTIONS: Array<{ dirName: string; type: JobType }> = [
  { dirName: 'docking', type: 'docking' },
  { dirName: 'simulations', type: 'simulation' },
  { dirName: 'conformers', type: 'conformer' },
  { dirName: 'scoring', type: 'scoring' },
  { dirName: 'xray', type: 'xray' },
];

const getCanonicalJobDirs = (projectDir: string): Array<{ dirName: string; type: JobType; collectionPath: string }> =>
  JOB_COLLECTIONS.map(({ dirName, type }) => ({
    dirName,
    type,
    collectionPath: path.join(projectDir, dirName),
  }));

const buildProjectRunInfo = (job: ProjectJob): ProjectRunInfo => ({
  folderName: `${job.type}/${job.folder}`,
  path: job.path,
  lastModified: job.lastModified ?? 0,
  hasTrajectory: !!job.trajectoryDcd,
  hasFinalPdb: !!job.finalPdb,
  type: job.type,
});

const buildProjectJobFromMetadata = (jobDir: string, metadata: JobMetadata): ProjectJob | null => {
  if (!fs.existsSync(jobDir)) return null;
  const stat = fs.statSync(jobDir);
  const folder = path.basename(jobDir);
  const base: ProjectJob = {
    id: `${metadata.type}:${folder}`,
    type: metadata.type,
    folder,
    label: folder,
    path: jobDir,
    lastModified: stat.mtimeMs,
    metadata,
  };

  if (metadata.type === 'docking') {
    const posesDir = resolveArtifactPath(jobDir, (metadata.artifacts.posesDir as string) || 'results/poses');
    const poseFiles = posesDir && fs.existsSync(posesDir)
      ? fs.readdirSync(posesDir).filter((fileName) => fileName.endsWith('_docked.sdf.gz'))
      : [];
    const poses: ProjectJobPose[] = poseFiles.map((fileName) => {
      const posePath = path.join(posesDir!, fileName);
      return {
        name: fileName.replace('_docked.sdf.gz', ''),
        path: posePath,
        affinity: extractVinaAffinity(posePath),
      };
    }).sort((a, b) => (a.affinity ?? 0) - (b.affinity ?? 0));
    return {
      ...base,
      label: poses.length > 0 ? `${folder} (${poses.length} poses)` : folder,
      receptorPdb: resolveArtifactPath(jobDir, metadata.artifacts.receptorPdb as string),
      referenceLigandPath: resolveArtifactPath(jobDir, metadata.artifacts.referenceLigandPath as string),
      preparedLigandPath: resolveArtifactPath(jobDir, metadata.artifacts.preparedLigandPath as string),
      poses,
    };
  }

  if (metadata.type === 'simulation') {
    const resultsDir = resolveArtifactPath(jobDir, (metadata.artifacts.resultsDir as string) || 'results') || path.join(jobDir, 'results');
    const systemPdb = path.join(resultsDir, 'system.pdb');
    const trajectoryDcd = path.join(resultsDir, 'trajectory.dcd');
    const finalPdb = path.join(resultsDir, 'final.pdb');
    const { clusterCount, clusterDirPath, clusteringResultsPath } = getSimulationClusterArtifacts(jobDir);
    const parts = [];
    if (fs.existsSync(trajectoryDcd)) parts.push('trajectory');
    if (clusterCount > 0) parts.push(`${clusterCount} clusters`);
    return {
      ...base,
      label: parts.length > 0 ? `${folder} (${parts.join(', ')})` : folder,
      systemPdb: fs.existsSync(systemPdb) ? systemPdb : undefined,
      trajectoryDcd: fs.existsSync(trajectoryDcd) ? trajectoryDcd : undefined,
      finalPdb: fs.existsSync(finalPdb) ? finalPdb : undefined,
      hasTrajectory: fs.existsSync(trajectoryDcd),
      clusterCount,
      clusterDir: clusterDirPath,
      clusteringResultsPath,
    };
  }

  if (metadata.type === 'conformer') {
    const resultsDir = resolveArtifactPath(jobDir, (metadata.artifacts.resultsDir as string) || 'results') || path.join(jobDir, 'results');
    const conformerPaths = fs.existsSync(resultsDir)
      ? fs.readdirSync(resultsDir)
          .filter((fileName) => /\.(sdf|sdf\.gz|mol|mol2)$/i.test(fileName))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((fileName) => path.join(resultsDir, fileName))
      : [];
    return {
      ...base,
      label: conformerPaths.length > 0 ? `${folder} (${conformerPaths.length} conformers)` : folder,
      conformerPaths,
      conformerCount: conformerPaths.length,
    };
  }

  if (metadata.type === 'scoring') {
    const resultsJson = resolveArtifactPath(jobDir, (metadata.artifacts.scoreResultsJson as string) || 'results/score_results.json');
    const parsed = resultsJson ? readJsonIfExists<{ entries?: Array<unknown> }>(resultsJson) : null;
    const count = Array.isArray(parsed?.entries) ? parsed!.entries!.length : 0;
    return {
      ...base,
      label: count > 0 ? `${folder} (${count} scored)` : folder,
      scoreResultsJson: resultsJson,
    };
  }

  if (metadata.type === 'xray') {
    const resultsDir = resolveArtifactPath(jobDir, (metadata.artifacts.resultsDir as string) || 'results') || path.join(jobDir, 'results');
    const pdfPaths = fs.existsSync(resultsDir)
      ? fs.readdirSync(resultsDir)
          .filter((fileName) => /^xray_analysis_.*\.pdf$/i.test(fileName))
          .map((fileName) => path.join(resultsDir, fileName))
          .sort((a, b) => a.localeCompare(b))
      : [];
    return {
      ...base,
      label: pdfPaths.length > 0 ? `${folder} (${pdfPaths.length} reports)` : folder,
      xrayReportPaths: pdfPaths,
    };
  }

  return null;
};

const listCanonicalJobs = (projectDir: string): ProjectJob[] => {
  const jobs: ProjectJob[] = [];
  for (const { type, collectionPath } of getCanonicalJobDirs(projectDir)) {
    if (!fs.existsSync(collectionPath)) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(collectionPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const jobDir = path.join(collectionPath, entry.name);
      const metadata = readJobMetadata(jobDir);
      if (!metadata || metadata.type !== type) continue;
      const job = buildProjectJobFromMetadata(jobDir, metadata);
      if (job) jobs.push(job);
    }
  }
  return jobs.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
};

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

export function register(): void {
  // Return the default output directory
  ipcMain.handle('get-default-output-dir', async () => {
    return getEmberBaseDir();
  });

  // Get/set the home directory for all projects
  ipcMain.handle(IpcChannels.GET_HOME_DIR, async () => {
    return getEmberBaseDir();
  });

  ipcMain.handle(
    IpcChannels.SET_HOME_DIR,
    async (): Promise<Result<string, AppError>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Set Ember Working Directory',
          properties: ['openDirectory', 'createDirectory'],
          buttonLabel: 'Use This Folder',
        });
        if (result.canceled || !result.filePaths.length) {
          return Err({ type: 'USER_CANCELLED', message: 'Cancelled' });
        }
        const newDir = result.filePaths[0];
        setEmberBaseDir(newDir);
        console.log(`[Project] Working directory set to: ${newDir}`);
        return Ok(newDir);
      } catch (err: any) {
        return Err({ type: 'UNKNOWN', message: `Failed to set home directory: ${err.message}` });
      }
    }
  );

  // Last-seen version for changelog popup
  ipcMain.handle(IpcChannels.GET_LAST_SEEN_VERSION, async () => {
    return getLastSeenVersion();
  });

  ipcMain.handle(IpcChannels.SET_LAST_SEEN_VERSION, async (_event, version: string) => {
    setLastSeenVersion(version);
  });

  // Ensure a project directory exists with a .ember-project ID file
  ipcMain.handle(
    IpcChannels.ENSURE_PROJECT,
    async (_event: any, projectName: string): Promise<Result<string, AppError>> => {
      try {
        const emberDir = getEmberBaseDir();
        const projectDir = path.join(emberDir, projectName);
        const idFile = path.join(projectDir, '.ember-project');

        fs.mkdirSync(projectDir, { recursive: true });

        if (!fs.existsSync(idFile)) {
          fs.writeFileSync(idFile, JSON.stringify({
            name: projectName,
            created: new Date().toISOString(),
          }, null, 2));
        }

        return Ok(projectDir);
      } catch (err: any) {
        return Err({
          type: 'DIRECTORY_ERROR',
          path: path.join(getEmberBaseDir(), projectName),
          message: `Failed to create project: ${err.message}`,
        });
      }
    }
  );

  // Import a structure file into a project's structures/ directory
  ipcMain.handle(
    IpcChannels.IMPORT_STRUCTURE,
    async (_event, sourcePath: string, projectDir: string): Promise<Result<string, AppError>> => {
      try {
        const structuresDir = path.join(projectDir, 'structures');
        fs.mkdirSync(structuresDir, { recursive: true });
        const filename = path.basename(sourcePath);
        const destPath = path.join(structuresDir, filename);
        // Don't re-copy if already in the project
        if (path.resolve(sourcePath) !== path.resolve(destPath)) {
          fs.copyFileSync(sourcePath, destPath);
        }
        return Ok(destPath);
      } catch (error) {
        return Err({
          type: 'IMPORT_FAILED',
          message: `Failed to import structure: ${(error as Error).message}`,
        });
      }
    }
  );

  // Fetch a structure from RCSB PDB by ID (e.g. "8TCE") → save to project structures/
  ipcMain.handle(
    IpcChannels.FETCH_PDB,
    async (_event, pdbId: string, projectDir: string): Promise<Result<string, AppError>> => {
      try {
        const id = pdbId.trim().toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(id)) {
          return Err({ type: 'VALIDATION_FAILED', message: `Invalid PDB ID: "${pdbId}". Must be 4 alphanumeric characters.` });
        }

        const structuresDir = path.join(projectDir, 'structures');
        fs.mkdirSync(structuresDir, { recursive: true });
        const destPath = path.join(structuresDir, `${id}.cif`);

        // Skip download if already fetched
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
          return Ok(destPath);
        }

        const url = `https://files.rcsb.org/download/${id}.cif`;
        const response = await fetch(url);
        if (!response.ok) {
          return Err({ type: 'DOWNLOAD_FAILED', message: `RCSB returned ${response.status} for PDB ID "${id}". Check the ID and try again.` });
        }
        const text = await response.text();
        fs.writeFileSync(destPath, text);
        console.log(`[Project] Fetched ${id}.cif from RCSB (${(text.length / 1024).toFixed(0)} KB)`);
        return Ok(destPath);
      } catch (err: any) {
        return Err({ type: 'DOWNLOAD_FAILED', message: `Failed to fetch PDB: ${err.message}` });
      }
    }
  );

  // Project browser: scan the active working directory for metadata-backed projects only.
  ipcMain.handle(IpcChannels.SCAN_PROJECTS, async (): Promise<any[]> => {
    const rootDir = getEmberBaseDir();
    const projects: any[] = [];

    try {
      if (fs.existsSync(rootDir)) {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const entryPath = path.join(rootDir, entry.name);
          const idFile = path.join(entryPath, '.ember-project');
          if (!fs.existsSync(idFile)) continue;

          const jobs = listCanonicalJobs(entryPath);
          const runs = jobs.map(buildProjectRunInfo);
          const stat = fs.statSync(entryPath);
          projects.push({
            name: readProjectNameFromMetadata(entryPath),
            path: normalizePath(entryPath),
            runs,
            lastModified: jobs[0]?.lastModified ?? stat.mtimeMs,
          });
        }
      }

      projects.sort((a, b) => b.lastModified - a.lastModified);
    } catch (err) {
      console.error('Error scanning projects:', err);
    }

    return projects;
  });

  // Project browser: scan a run directory for output files
  ipcMain.handle(IpcChannels.SCAN_RUN_FILES, async (_event: any, runDir: string): Promise<any> => {
    const result: any = {
      systemPdb: null,
      trajectory: null,
      finalPdb: null,
      equilibratedPdb: null,
      energyCsv: null,
    };
    try {
      if (!fs.existsSync(runDir)) return result;
      const files = fs.readdirSync(runDir);

      // Check results/ subdir first (new layout)
      const resultsDir = path.join(runDir, 'results');
      const resultsFiles = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir) : [];

      // New layout: unprefixed files in results/
      for (const f of resultsFiles) {
        if (f === 'system.pdb' && !result.systemPdb) result.systemPdb = path.join(resultsDir, f);
        else if (f === 'trajectory.dcd' && !result.trajectory) result.trajectory = path.join(resultsDir, f);
        else if (f === 'final.pdb' && !result.finalPdb) result.finalPdb = path.join(resultsDir, f);
        else if (f === 'equilibrated.pdb' && !result.equilibratedPdb) result.equilibratedPdb = path.join(resultsDir, f);
        else if (f === 'energy.csv' && !result.energyCsv) result.energyCsv = path.join(resultsDir, f);
      }

      // Legacy: prefixed files at top level; also check unprefixed at top level
      for (const f of files) {
        if ((f.endsWith('_system.pdb') || f === 'system.pdb') && !result.systemPdb) result.systemPdb = path.join(runDir, f);
        else if ((f.endsWith('_trajectory.dcd') || f === 'trajectory.dcd') && !result.trajectory) result.trajectory = path.join(runDir, f);
        else if ((f.endsWith('_final.pdb') || f === 'final.pdb') && !result.finalPdb) result.finalPdb = path.join(runDir, f);
        else if ((f.endsWith('_equilibrated.pdb') || f === 'equilibrated.pdb') && !result.equilibratedPdb) result.equilibratedPdb = path.join(runDir, f);
        else if ((f.endsWith('_energy.csv') || f === 'energy.csv') && !result.energyCsv) result.energyCsv = path.join(runDir, f);
      }
    } catch (err) {
      console.error('Error scanning run files:', err);
    }
    return result;
  });

  // Get file count and total size for a project (for delete confirmation)
  ipcMain.handle(IpcChannels.GET_PROJECT_FILE_COUNT, async (_event: any, projectDir: string): Promise<{ fileCount: number; totalSizeMb: number }> => {
    projectDir = normalizePath(projectDir);
    if (!fs.existsSync(projectDir)) return { fileCount: 0, totalSizeMb: 0 };

    let fileCount = 0;
    let totalSize = 0;
    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            fileCount++;
            try { totalSize += fs.statSync(full).size; } catch { /* skip */ }
          }
        }
      } catch { /* skip unreadable */ }
    };
    walk(projectDir);
    return { fileCount, totalSizeMb: Math.round(totalSize / (1024 * 1024) * 10) / 10 };
  });

  // Rename a project directory
  ipcMain.handle(IpcChannels.RENAME_PROJECT, async (_event: any, projectDir: string, newName: string): Promise<any> => {
    const oldDir = normalizePath(projectDir);
    const oldName = path.basename(oldDir);
    const newDir = path.join(path.dirname(oldDir), newName);

    if (!fs.existsSync(oldDir)) {
      return { ok: false, error: { type: 'NOT_FOUND', message: `Project "${oldName}" not found` } };
    }
    if (fs.existsSync(newDir)) {
      return { ok: false, error: { type: 'ALREADY_EXISTS', message: `Project "${newName}" already exists` } };
    }

    try {
      // Rename the project directory
      fs.renameSync(oldDir, newDir);

      // Rename prefixed files inside the project (e.g., projectName_system.pdb -> newName_system.pdb)
      const renamePrefix = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              renamePrefix(full);
            } else if (entry.name.startsWith(oldName + '_')) {
              const newFileName = newName + entry.name.substring(oldName.length);
              fs.renameSync(full, path.join(dir, newFileName));
            }
          }
        } catch { /* skip unreadable */ }
      };
      renamePrefix(newDir);

      // Update .ember-project ID file with new name
      const idFile = path.join(newDir, '.ember-project');
      if (fs.existsSync(idFile)) {
        try {
          const idData = JSON.parse(fs.readFileSync(idFile, 'utf-8'));
          idData.name = newName;
          fs.writeFileSync(idFile, JSON.stringify(idData, null, 2));
        } catch { /* non-critical -- project still works without updated ID */ }
      }

      return { ok: true, value: undefined };
    } catch (err: any) {
      return { ok: false, error: { type: 'RENAME_FAILED', message: err.message || 'Failed to rename project' } };
    }
  });

  // Delete a project directory entirely
  ipcMain.handle(IpcChannels.DELETE_PROJECT, async (_event: any, projectDir: string): Promise<any> => {
    if (childProcesses.size > 0) {
      return { ok: false, error: { type: 'DELETE_BLOCKED', message: 'Cannot delete project while a job is running' } };
    }
    const normalizedProjectDir = normalizePath(projectDir);

    if (!fs.existsSync(normalizedProjectDir)) {
      return { ok: false, error: { type: 'NOT_FOUND', message: `Project "${path.basename(normalizedProjectDir)}" not found` } };
    }

    try {
      fs.rmSync(normalizedProjectDir, { recursive: true, force: true });
      return { ok: true, value: undefined };
    } catch (err: any) {
      return { ok: false, error: { type: 'DELETE_FAILED', message: err.message || 'Failed to delete project' } };
    }
  });

  // Scan project artifacts as ProjectJob[] -- docking runs/poses, simulation runs, MCMM runs, and maps
  ipcMain.handle(
    IpcChannels.SCAN_PROJECT_ARTIFACTS,
    async (_event: any, projectDir: string): Promise<ProjectJob[]> => {
      projectDir = normalizePath(projectDir);
      if (!fs.existsSync(projectDir)) return [];
      return listCanonicalJobs(projectDir);
    }
  );

  // Read image file and return as data URL (for thumbnail display in Electron)
  ipcMain.handle(
    'read-image-as-data-url',
    async (_event, imagePath: string): Promise<string | null> => {
      try {
        if (!fs.existsSync(imagePath)) return null;
        const data = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,${data.toString('base64')}`;
      } catch {
        return null;
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Project folder actions and metadata-backed import
  // ---------------------------------------------------------------------------

  // Open project folder in Finder
  ipcMain.handle(
    IpcChannels.OPEN_PROJECT_FOLDER,
    async (_event, projectDir: string) => {
      shell.openPath(projectDir);
    }
  );

  // Import an existing Ember project from an external location
  ipcMain.handle(
    IpcChannels.IMPORT_EXTERNAL_PROJECT,
    async (): Promise<Result<{ name: string; path: string }, AppError>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Import Ember Project',
          properties: ['openDirectory'],
          buttonLabel: 'Import',
        });
        if (result.canceled || !result.filePaths.length) {
          return Err({ type: 'USER_CANCELLED', message: 'Import cancelled' });
        }

        const sourceDir = normalizePath(result.filePaths[0]);
        const idFile = path.join(sourceDir, '.ember-project');
        if (!fs.existsSync(idFile)) {
          return Err({
            type: 'VALIDATION_FAILED',
            message: 'Selected folder is not an Ember project (no .ember-project file found)',
          });
        }

        const rootDir = normalizePath(getEmberBaseDir());
        fs.mkdirSync(rootDir, { recursive: true });
        const sourceName = path.basename(sourceDir);

        if (normalizePath(path.dirname(sourceDir)) === rootDir) {
          return Ok({ name: readProjectNameFromMetadata(sourceDir), path: sourceDir });
        }

        let destName = sourceName;
        let destDir = path.join(rootDir, destName);
        while (fs.existsSync(destDir)) {
          const chosenName = await promptForImportDestinationName(
            rootDir,
            destName,
            'Choose Imported Project Name',
            'Import Project',
          );
          if (!chosenName) {
            return Err({ type: 'USER_CANCELLED', message: 'Import cancelled' });
          }
          destName = chosenName;
          destDir = path.join(rootDir, destName);
        }

        await fs.promises.cp(sourceDir, destDir, { recursive: true });
        const copiedIdFile = path.join(destDir, '.ember-project');
        await fs.promises.access(copiedIdFile);

        try {
          const meta = JSON.parse(fs.readFileSync(copiedIdFile, 'utf-8'));
          meta.name = destName;
          fs.writeFileSync(copiedIdFile, JSON.stringify(meta, null, 2));
        } catch { /* preserve copied metadata if it cannot be rewritten */ }

        console.log(`[Project] Imported project: ${sourceDir} → ${destDir}`);
        return Ok({ name: readProjectNameFromMetadata(destDir), path: destDir });
      } catch (err: any) {
        return Err({ type: 'IMPORT_FAILED', message: `Import failed: ${err.message}` });
      }
    }
  );

  ipcMain.handle(
    IpcChannels.IMPORT_PROJECT_JOB,
    async (_event, request: ImportProjectJobRequest): Promise<Result<ProjectJob, AppError>> => {
      try {
        const projectDir = normalizePath(request.projectDir);
        if (!fs.existsSync(projectDir)) {
          return Err({ type: 'DIRECTORY_NOT_FOUND', message: 'Project not found' });
        }

        const openResult = await dialog.showOpenDialog({
          title: 'Import Ember Job',
          defaultPath: getEmberBaseDir(),
          properties: ['openDirectory'],
          buttonLabel: 'Import Job',
        });
        if (openResult.canceled || !openResult.filePaths.length) {
          return Err({ type: 'USER_CANCELLED', message: 'Import cancelled' });
        }

        const sourceDir = normalizePath(openResult.filePaths[0]);
        const metadata = readJobMetadata(sourceDir);
        if (!metadata) {
          return Err({
            type: 'VALIDATION_FAILED',
            message: 'Selected folder is not an Ember job (no valid .ember-job file found)',
          });
        }
        if (metadata.type !== request.expectedType) {
          return Err({
            type: 'VALIDATION_FAILED',
            message: `Selected job is type "${metadata.type}", but "${request.expectedType}" was expected`,
          });
        }

        const collectionDir = getJobCollectionDir(projectDir, request.expectedType);
        fs.mkdirSync(collectionDir, { recursive: true });
        const sourceName = path.basename(sourceDir);

        if (normalizePath(path.dirname(sourceDir)) === normalizePath(collectionDir)) {
          const localJob = buildProjectJobFromMetadata(sourceDir, metadata);
          return localJob
            ? Ok(localJob)
            : Err({ type: 'VALIDATION_FAILED', message: 'Imported job metadata is invalid' });
        }

        let destName = sourceName;
        let destDir = path.join(collectionDir, destName);
        while (fs.existsSync(destDir)) {
          const chosenName = await promptForImportDestinationName(
            collectionDir,
            destName,
            'Choose Imported Job Name',
            'Import Job',
          );
          if (!chosenName) {
            return Err({ type: 'USER_CANCELLED', message: 'Import cancelled' });
          }
          destName = chosenName;
          destDir = path.join(collectionDir, destName);
        }

        await fs.promises.cp(sourceDir, destDir, { recursive: true });
        const copiedMetadata = readJobMetadata(destDir) || createJobMetadata({
          jobDir: destDir,
          type: request.expectedType,
          descriptor: metadata.descriptor,
          mode: metadata.mode,
          status: metadata.status,
          artifacts: metadata.artifacts,
        });
        writeJobMetadata(destDir, {
          ...copiedMetadata,
          folderName: destName,
          type: request.expectedType,
        });

        const importedJob = buildProjectJobFromMetadata(destDir, readJobMetadata(destDir)!);
        return importedJob
          ? Ok(importedJob)
          : Err({ type: 'VALIDATION_FAILED', message: 'Imported job metadata is invalid after copy' });
      } catch (err: any) {
        return Err({ type: 'IMPORT_FAILED', message: `Import failed: ${err.message}` });
      }
    }
  );
}
