// Copyright (c) 2026 Ember Contributors. MIT License.
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { JobMetadata, JobStatus, JobType, ScoringJobMode } from '../shared/types/ipc';

export const JOB_METADATA_FILENAME = '.ember-job';

export function jobMetadataPath(jobDir: string): string {
  return path.join(jobDir, JOB_METADATA_FILENAME);
}

export function readJobMetadata(jobDir: string): JobMetadata | null {
  try {
    const json = fs.readFileSync(jobMetadataPath(jobDir), 'utf-8');
    const parsed = JSON.parse(json) as JobMetadata;
    if (
      parsed?.schemaVersion !== 1 ||
      typeof parsed.folderName !== 'string' ||
      typeof parsed.type !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.appVersion !== 'string' ||
      typeof parsed.status !== 'string' ||
      typeof parsed.artifacts !== 'object' ||
      parsed.artifacts == null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeJobMetadata(jobDir: string, metadata: JobMetadata): void {
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(jobMetadataPath(jobDir), JSON.stringify(metadata, null, 2));
}

export function createJobMetadata(params: {
  jobDir: string;
  type: JobType;
  descriptor?: string | null;
  mode?: ScoringJobMode;
  status?: JobStatus;
  artifacts?: JobMetadata['artifacts'];
}): JobMetadata {
  return {
    schemaVersion: 1,
    type: params.type,
    ...(params.mode ? { mode: params.mode } : {}),
    folderName: path.basename(params.jobDir),
    descriptor: (params.descriptor || '').trim(),
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    status: params.status || 'running',
    artifacts: params.artifacts || {},
  };
}

export function inferDescriptorFromFolderName(folderName: string, prefix: string): string {
  const pattern = new RegExp(`^${prefix}(?:-(.*?))?-\\d{8}-\\d{6}$`);
  const match = folderName.match(pattern);
  return match?.[1] || '';
}

export function upsertJobMetadata(
  jobDir: string,
  update: Partial<JobMetadata> & { artifacts?: JobMetadata['artifacts'] },
): JobMetadata {
  const existing = readJobMetadata(jobDir);
  const base = existing || createJobMetadata({
    jobDir,
    type: update.type || 'docking',
    descriptor: update.descriptor,
    mode: update.mode,
    status: update.status,
    artifacts: update.artifacts,
  });
  const metadata: JobMetadata = {
    ...base,
    ...update,
    schemaVersion: 1,
    folderName: path.basename(jobDir),
    artifacts: update.artifacts || existing?.artifacts || {},
  };
  writeJobMetadata(jobDir, metadata);
  return metadata;
}

export function updateJobStatus(
  jobDir: string,
  status: JobStatus,
  artifacts?: JobMetadata['artifacts'],
): JobMetadata {
  const existing = readJobMetadata(jobDir);
  if (!existing) {
    throw new Error(`Missing ${JOB_METADATA_FILENAME} in ${jobDir}`);
  }
  const next: JobMetadata = {
    ...existing,
    status,
    artifacts: artifacts ? { ...existing.artifacts, ...artifacts } : existing.artifacts,
  };
  writeJobMetadata(jobDir, next);
  return next;
}

export function resolveArtifactPath(jobDir: string, artifact: string | null | undefined): string | undefined {
  if (!artifact) return undefined;
  return path.join(jobDir, artifact);
}

export function getJobCollectionDir(projectDir: string, type: JobType): string {
  switch (type) {
    case 'docking':
      return path.join(projectDir, 'docking');
    case 'simulation':
      return path.join(projectDir, 'simulations');
    case 'conformer':
      return path.join(projectDir, 'conformers');
    case 'scoring':
      return path.join(projectDir, 'scoring');
    case 'xray':
      return path.join(projectDir, 'xray');
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown job type: ${_exhaustive}`);
    }
  }
}
