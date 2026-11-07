import { api } from '../platform/api';
import { createDefaultConfig } from '../defaults';
import type { Config } from '../types';
import { parseConfig } from './schema';

/** Key of the configuration in `storage.local`. Content scripts read this copy. */
export const CONFIG_KEY = 'config';

/** Key of the synchronization status in `storage.local`. */
export const SYNC_STATUS_KEY = 'syncStatus';

export type SyncStatus = 'ok' | 'quota' | 'unavailable';

export function configFromStorage(value: unknown): Config {
  if (value === undefined) return createDefaultConfig();
  try {
    return parseConfig(value);
  } catch {
    return createDefaultConfig();
  }
}

export async function loadConfig(): Promise<Config> {
  const data = await api.storage.local.get(CONFIG_KEY);
  return configFromStorage(data[CONFIG_KEY]);
}

export async function saveConfig(config: Config): Promise<Config> {
  const next = { ...config, updatedAt: Date.now() };
  await api.storage.local.set({ [CONFIG_KEY]: next });
  return next;
}

/** Reads the configuration, applies a change, and saves it. */
export async function updateConfig(change: (config: Config) => Config): Promise<Config> {
  return saveConfig(change(await loadConfig()));
}

export function onConfigChange(listener: (config: Config) => void): void {
  api.storage.onChanged.addListener((changes, area) => {
    const change = changes[CONFIG_KEY];
    if (area === 'local' && change !== undefined) listener(configFromStorage(change.newValue));
  });
}
