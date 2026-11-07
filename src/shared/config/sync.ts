import { api } from '../platform/api';
import type { Config } from '../types';
import { configFromStorage, type SyncStatus } from './storage';

const META_KEY = 'syncMeta';
const CHUNK_PREFIX = 'syncChunk';
// storage.sync accepts 8 KB per item. Escaped characters can make a chunk larger
// than its length, so the chunk size keeps a margin.
const CHUNK_SIZE = 6000;

interface SyncMeta {
  count: number;
  updatedAt: number;
}

export function splitIntoChunks(text: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length === 0 ? [''] : chunks;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && /quota/i.test(error.message);
}

/** Writes the configuration to the synchronized storage of the browser account. */
export async function pushToSync(config: Config): Promise<SyncStatus> {
  if (typeof api.storage.sync === 'undefined') return 'unavailable';
  const chunks = splitIntoChunks(JSON.stringify(config));
  const items: Record<string, unknown> = {};
  chunks.forEach((chunk, index) => (items[`${CHUNK_PREFIX}${index}`] = chunk));
  const meta: SyncMeta = { count: chunks.length, updatedAt: config.updatedAt };
  items[META_KEY] = meta;
  try {
    const previous = await readMeta();
    await api.storage.sync.set(items);
    if (previous !== null && previous.count > chunks.length) {
      const extra = Array.from(
        { length: previous.count - chunks.length },
        (_, i) => `${CHUNK_PREFIX}${chunks.length + i}`,
      );
      await api.storage.sync.remove(extra);
    }
    return 'ok';
  } catch (error) {
    return isQuotaError(error) ? 'quota' : 'unavailable';
  }
}

async function readMeta(): Promise<SyncMeta | null> {
  const data = await api.storage.sync.get(META_KEY);
  const meta = data[META_KEY] as SyncMeta | undefined;
  return meta !== undefined && Number.isInteger(meta.count) ? meta : null;
}

/** Reads the configuration from the synchronized storage. Returns null when there is none. */
export async function pullFromSync(): Promise<Config | null> {
  if (typeof api.storage.sync === 'undefined') return null;
  try {
    const meta = await readMeta();
    if (meta === null) return null;
    const keys = Array.from({ length: meta.count }, (_, i) => `${CHUNK_PREFIX}${i}`);
    const data = await api.storage.sync.get(keys);
    const text = keys.map((key) => data[key] as string | undefined).join('');
    return configFromStorage(JSON.parse(text));
  } catch {
    return null;
  }
}

export function isSyncKey(key: string): boolean {
  return key === META_KEY || key.startsWith(CHUNK_PREFIX);
}
