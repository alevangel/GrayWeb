export const MATCH_TYPES = [
  'domain',
  'host',
  'prefix',
  'exact',
  'wildcard',
  'regex',
  'contains',
  'path',
] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

export type RuleAction = 'gray' | 'skip';

export type OperationMode = 'listed' | 'all';

export type Language = 'auto' | 'en' | 'it';

export interface FilterSettings {
  /** Grayscale level, 0–100. */
  intensity: number;
  /** Contrast, 50–150. 100 means no change. */
  contrast: number;
  /** Brightness, 50–150. 100 means no change. */
  brightness: number;
}

export interface Schedule {
  /** Days of the week, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Start time as "HH:MM". */
  start: string;
  /** End time as "HH:MM". When end < start, the range continues past midnight. */
  end: string;
}

export interface Rule {
  id: string;
  pattern: string;
  matchType: MatchType;
  action: RuleAction;
  enabled: boolean;
  /** Only used by the "regex" match type. */
  ignoreCase?: boolean;
  label?: string;
  /** Site settings. When absent, the rule uses the global settings. */
  settings?: FilterSettings;
  schedule?: Schedule;
}

export interface Preset {
  id: string;
  name: string;
  settings: FilterSettings;
}

export interface Config {
  version: number;
  enabled: boolean;
  mode: OperationMode;
  language: Language;
  global: FilterSettings;
  rules: Rule[];
  presets: Preset[];
  /** Epoch milliseconds. GrayWeb is paused until this time. 0 means not paused. */
  pausedUntil: number;
  /** Epoch milliseconds of the last change. Used to resolve sync conflicts. */
  updatedAt: number;
}

export const SETTING_LIMITS = {
  intensity: { min: 0, max: 100 },
  contrast: { min: 50, max: 150 },
  brightness: { min: 50, max: 150 },
} as const satisfies Record<keyof FilterSettings, { min: number; max: number }>;
