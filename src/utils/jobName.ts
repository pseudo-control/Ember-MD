// Copyright (c) 2026 Ember Contributors. MIT License.
/**
 * Utilities for generating and formatting job names
 */

import type { ConformerMethod } from '../../shared/types/dock';
import { MDForceFieldPreset } from '../../shared/types/md';

// Word lists for random job name generation (chemistry/science themed)
const ADJECTIVES = [
  'amber', 'azure', 'bold', 'bright', 'calm', 'clear', 'cosmic', 'crisp',
  'cyan', 'dancing', 'daring', 'deep', 'eager', 'elegant', 'emerald', 'fancy',
  'fast', 'fierce', 'gentle', 'gleaming', 'golden', 'grand', 'happy', 'hidden',
  'ionic', 'jade', 'keen', 'lively', 'lucid', 'lunar', 'magic', 'misty',
  'noble', 'omega', 'polar', 'prime', 'quick', 'quiet', 'radiant', 'rapid',
  'ruby', 'rustic', 'serene', 'sharp', 'silent', 'silver', 'sleek', 'smooth',
  'solar', 'solid', 'sonic', 'stellar', 'swift', 'tidal', 'ultra', 'vivid',
  'warm', 'wild', 'wise', 'zesty', 'zinc', 'atomic', 'quantum', 'orbital',
  'cobalt', 'coral', 'crimson', 'frosty', 'glacial', 'molten', 'nimble',
  'primal', 'rugged', 'subtle', 'tawny', 'topaz', 'verdant', 'dusky',
  'hazy', 'woven',
];

const NOUNS = [
  'alpha', 'anchor', 'apex', 'arrow', 'aurora', 'beacon', 'bolt', 'bond',
  'bridge', 'carbon', 'cascade', 'catalyst', 'cipher', 'circuit', 'cluster',
  'comet', 'core', 'crystal', 'delta', 'domain', 'drift', 'echo', 'electron',
  'ember', 'enzyme', 'field', 'flame', 'flux', 'forge', 'frost', 'fusion',
  'gamma', 'garden', 'glacier', 'grove', 'harbor', 'helix', 'horizon', 'hydra',
  'island', 'kernel', 'lattice', 'ligand', 'maple', 'matrix', 'meadow', 'mesa',
  'meteor', 'neutron', 'nexus', 'nucleus', 'oasis', 'orbit', 'oxide', 'path',
  'peak', 'photon', 'pine', 'plasma', 'proton', 'pulse', 'quartz', 'radix',
  'reef', 'ridge', 'river', 'sage', 'sigma', 'spark', 'sphere', 'spiral',
  'spring', 'storm', 'stream', 'summit', 'terra', 'theta', 'tide', 'tower',
  'trail', 'valley', 'vector', 'vertex', 'vortex', 'wave', 'willow', 'zenith',
  'alkali', 'anode', 'basalt', 'caldera', 'corona', 'dendrite', 'eclipse',
  'filament', 'isotope', 'mantle', 'nebula', 'pendulum', 'plume', 'prism',
  'shard', 'tundra',
];

const ANIMALS = [
  'badger', 'beaver', 'bobcat', 'condor', 'coyote', 'crane', 'dolphin', 'eagle',
  'falcon', 'finch', 'fox', 'gazelle', 'gecko', 'gopher', 'hawk', 'heron',
  'jackal', 'jaguar', 'koala', 'lemur', 'leopard', 'lion', 'lizard', 'lynx',
  'macaw', 'marmot', 'marten', 'newt', 'ocelot', 'otter', 'owl', 'panda',
  'panther', 'parrot', 'pelican', 'penguin', 'puma', 'python', 'quail', 'raven',
  'salmon', 'seal', 'shark', 'shrew', 'sloth', 'snake', 'spider', 'squid',
  'swan', 'tapir', 'tern', 'tiger', 'toucan', 'turtle', 'viper', 'wallaby',
  'walrus', 'weasel', 'whale', 'wolf', 'wombat', 'zebra', 'dragon', 'phoenix',
  'alpaca', 'caracal', 'cicada', 'egret', 'ferret', 'flamingo', 'gibbon',
  'ibis', 'kestrel', 'mantis', 'narwhal', 'osprey', 'peacock', 'scorpion',
  'sparrow', 'starling',
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random three-word job name like "fancy-carbon-wallaby"
 */
export function generateJobName(): string {
  const adj = randomFrom(ADJECTIVES);
  const noun = randomFrom(NOUNS);
  const animal = randomFrom(ANIMALS);
  return `${adj}-${noun}-${animal}`;
}

/**
 * Build output folder name for docking runs.
 * Format: docking[-descriptor]-YYYYMMDD-HHMMSS
 */
export function buildDockFolderName(params: {
  referenceLigandId?: string | null;
  numLigands?: number;
}, date: Date = new Date()): string {
  const descriptor = sanitizeCompoundId(params.referenceLigandId?.split('_')[0] || 'dock') || 'dock';
  return buildWorkflowRunFolderName('docking', descriptor, date);
}

/**
 * Sanitize a string for filesystem use (lowercase, alphanumeric + hyphens/underscores/dots)
 */
function sanitizeForFilesystem(name: string, maxLength: number): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, maxLength);
}

export function sanitizeJobName(name: string): string {
  return sanitizeForFilesystem(name, 50);
}

export function sanitizeCompoundId(name: string): string {
  return sanitizeForFilesystem(name, 40);
}

export function sanitizeConformOutputName(name: string): string {
  return sanitizeForFilesystem(name, 40);
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function buildWorkflowRunFolderName(
  prefix: string,
  descriptor?: string | null,
  date: Date = new Date(),
): string {
  const sanitizedDescriptor = sanitizeForFilesystem(descriptor || '', 40);
  const timestamp = formatTimestamp(date);
  return sanitizedDescriptor
    ? `${prefix}-${sanitizedDescriptor}-${timestamp}`
    : `${prefix}-${timestamp}`;
}

export function buildXrayRunFolderName(descriptor?: string | null, date: Date = new Date()): string {
  return buildWorkflowRunFolderName('analyzed_xrays', descriptor, date);
}

/**
 * Estimate AM1-BCC charge computation time from ligand atom count
 */
export function estimateChargeTime(atoms: number): string {
  if (atoms <= 20) return '< 10s';
  if (atoms <= 30) return '~10-30s';
  if (atoms <= 40) return '~30s-2min';
  if (atoms <= 50) return '~1-4min';
  if (atoms <= 65) return '~2-6min';
  return '~5min+';
}

/**
 * Build simulation run folder name.
 * Format: simulation[-descriptor]-YYYYMMDD-HHMMSS
 */
export function buildMdRunFolderName(params: {
  forceFieldPreset: MDForceFieldPreset;
  temperatureK?: number;
  productionNs: number;
  compoundId?: string;
  inputMode?: 'holo' | 'ligand_only' | 'apo';
}, date: Date = new Date()): string {
  const compound = sanitizeCompoundId(params.compoundId?.trim() || '');
  const fallback = params.inputMode === 'apo' ? 'apo' : params.inputMode === 'ligand_only' ? 'ligand-only' : '';
  return buildWorkflowRunFolderName('simulation', compound || fallback, date);
}

export function buildConformRunFolderName(params: {
  method: Exclude<ConformerMethod, 'none'>;
  maxConformers: number;
  outputName?: string | null;
  ligandName?: string | null;
  protonation?: {
    enabled: boolean;
    phMin: number;
    phMax: number;
  };
}, date: Date = new Date()): string {
  const descriptor = sanitizeConformOutputName(
    params.outputName?.trim() || params.ligandName?.trim() || 'molecule'
  ) || 'molecule';
  return buildWorkflowRunFolderName('conformers', descriptor, date);
}

export function buildDockConformRunFolderName(params: {
  referenceLigandId?: string | null;
  numLigands?: number;
  method: Exclude<ConformerMethod, 'none'>;
  maxConformers: number;
  protonation?: {
    enabled: boolean;
    phMin: number;
    phMax: number;
  };
}, date: Date = new Date()): string {
  const dockDescriptor = sanitizeConformOutputName(
    params.referenceLigandId?.split('_')[0] || 'dock'
  ) || 'dock';

  return buildConformRunFolderName({
    method: params.method,
    maxConformers: params.maxConformers,
    outputName: dockDescriptor,
    protonation: params.protonation,
  }, date);
}

export function buildScoreRunFolderName(
  descriptor?: string | null,
  mode: 'batch' | 'trajectory' = 'batch',
  date: Date = new Date(),
): string {
  const fallback = mode === 'trajectory' ? 'trajectory' : 'batch';
  return buildWorkflowRunFolderName('scoring', descriptor?.trim() || fallback, date);
}

export function formatJobCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'job' : 'jobs'}`;
}
