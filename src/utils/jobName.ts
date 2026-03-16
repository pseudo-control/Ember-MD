/**
 * Utilities for generating and formatting job names
 */

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
 * Job type identifiers for folder naming
 */
export type JobType = 'MD';

/**
 * Build output folder name for MD simulation jobs
 * Format: {jobName}_{forceField}_MD-{temp}K-{duration}ns
 */
export function buildMdFolderName(
  jobName: string,
  params: {
    forceFieldPreset: 'fast' | 'accurate';
    temperatureK?: number;
    productionNs: number;
  }
): string {
  const ff = params.forceFieldPreset === 'fast' ? 'ff14sb-TIP3P' : 'ff19sb-OPC';
  const temp = params.temperatureK || 300;
  const ns = params.productionNs;
  return `${jobName}_${ff}_MD-${temp}K-${ns}ns`;
}

/**
 * Sanitize job name for filesystem use
 */
export function sanitizeJobName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}
