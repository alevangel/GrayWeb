import type { Config, FilterSettings, Preset } from './types';

export const CONFIG_VERSION = 1;

export const DEFAULT_SETTINGS: Readonly<FilterSettings> = Object.freeze({
  intensity: 100,
  contrast: 100,
  brightness: 100,
});

export const BUILT_IN_PRESETS: readonly Preset[] = Object.freeze([
  { id: 'builtin-soft', name: 'Soft', settings: { intensity: 50, contrast: 100, brightness: 100 } },
  {
    id: 'builtin-medium',
    name: 'Medium',
    settings: { intensity: 75, contrast: 100, brightness: 100 },
  },
  {
    id: 'builtin-full',
    name: 'Full',
    settings: { intensity: 100, contrast: 100, brightness: 100 },
  },
  {
    id: 'builtin-dim',
    name: 'Dim',
    settings: { intensity: 100, contrast: 90, brightness: 85 },
  },
]);

export function createDefaultConfig(now = Date.now()): Config {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    mode: 'listed',
    language: 'auto',
    global: { ...DEFAULT_SETTINGS },
    rules: [],
    presets: [],
    pausedUntil: 0,
    updatedAt: now,
  };
}
