import { CONFIG_VERSION, createDefaultConfig, DEFAULT_SETTINGS } from '../defaults';
import { compilePattern } from '../rules/match';
import {
  MATCH_TYPES,
  SETTING_LIMITS,
  type Config,
  type FilterSettings,
  type Language,
  type MatchType,
  type OperationMode,
  type Preset,
  type Rule,
  type Schedule,
} from '../types';

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeSettings(value: unknown, path: string): FilterSettings {
  if (!isObject(value)) throw new ConfigError('must be an object', path);
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(SETTING_LIMITS) as (keyof FilterSettings)[]) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new ConfigError('must be a number', `${path}.${key}`);
    }
    result[key] = clamp(raw, SETTING_LIMITS[key].min, SETTING_LIMITS[key].max);
  }
  return result;
}

function normalizeSchedule(value: unknown, path: string): Schedule {
  if (!isObject(value)) throw new ConfigError('must be an object', path);
  const { days, start, end } = value;
  if (
    !Array.isArray(days) ||
    !days.every((day) => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6)
  ) {
    throw new ConfigError('must be a list of numbers from 0 to 6', `${path}.days`);
  }
  const time = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (typeof start !== 'string' || !time.test(start)) {
    throw new ConfigError('must be a time HH:MM', `${path}.start`);
  }
  if (typeof end !== 'string' || !time.test(end)) {
    throw new ConfigError('must be a time HH:MM', `${path}.end`);
  }
  return { days: [...new Set(days as number[])].sort(), start, end };
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ConfigError('must be text', path);
  return value;
}

export function createId(): string {
  return globalThis.crypto.randomUUID();
}

export function normalizeRule(value: unknown, path: string): Rule {
  if (!isObject(value)) throw new ConfigError('must be an object', path);
  const { pattern, matchType, action, enabled, ignoreCase } = value;
  if (typeof pattern !== 'string') throw new ConfigError('must be text', `${path}.pattern`);
  if (typeof matchType !== 'string' || !MATCH_TYPES.includes(matchType as MatchType)) {
    throw new ConfigError(`must be one of ${MATCH_TYPES.join(', ')}`, `${path}.matchType`);
  }
  if (action !== 'gray' && action !== 'skip') {
    throw new ConfigError('must be "gray" or "skip"', `${path}.action`);
  }
  if (ignoreCase !== undefined && typeof ignoreCase !== 'boolean') {
    throw new ConfigError('must be true or false', `${path}.ignoreCase`);
  }
  const compiled = compilePattern({ pattern, matchType: matchType as MatchType });
  if (!compiled.ok) throw new ConfigError(`pattern is not valid (${compiled.error})`, path);

  const rule: Rule = {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : createId(),
    pattern,
    matchType: matchType as MatchType,
    action,
    enabled: enabled !== false,
  };
  if (ignoreCase !== undefined) rule.ignoreCase = ignoreCase;
  const label = optionalString(value.label, `${path}.label`);
  if (label !== undefined && label !== '') rule.label = label;
  if (value.settings !== undefined) {
    rule.settings = normalizeSettings(value.settings, `${path}.settings`);
  }
  if (value.schedule !== undefined) {
    rule.schedule = normalizeSchedule(value.schedule, `${path}.schedule`);
  }
  return rule;
}

function normalizePreset(value: unknown, path: string): Preset {
  if (!isObject(value)) throw new ConfigError('must be an object', path);
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    throw new ConfigError('must be text', `${path}.name`);
  }
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : createId(),
    name: value.name.trim(),
    settings: normalizeSettings(value.settings, `${path}.settings`),
  };
}

/** Converts data from earlier file versions to the current version. */
export function migrate(data: Json): Json {
  const version = typeof data.version === 'number' ? data.version : 0;
  if (version > CONFIG_VERSION) {
    throw new ConfigError(`version ${version} is newer than this extension`, 'version');
  }
  // Version 0 has no "version" field. The fields are the same as version 1.
  return { ...data, version: CONFIG_VERSION };
}

/**
 * Validates unknown data (for example, an imported file) and returns a full configuration.
 * Fields that are missing get the default values. Values that are not valid throw a ConfigError.
 */
export function parseConfig(input: unknown): Config {
  if (!isObject(input)) throw new ConfigError('must be an object', 'config');
  const data = migrate(input);
  const config = createDefaultConfig();

  if (data.enabled !== undefined) {
    if (typeof data.enabled !== 'boolean')
      throw new ConfigError('must be true or false', 'enabled');
    config.enabled = data.enabled;
  }
  if (data.mode !== undefined) {
    if (data.mode !== 'listed' && data.mode !== 'all') {
      throw new ConfigError('must be "listed" or "all"', 'mode');
    }
    config.mode = data.mode satisfies OperationMode;
  }
  if (data.language !== undefined) {
    if (!['auto', 'en', 'it'].includes(data.language as string)) {
      throw new ConfigError('must be "auto", "en" or "it"', 'language');
    }
    config.language = data.language as Language;
  }
  if (data.global !== undefined) config.global = normalizeSettings(data.global, 'global');
  if (data.rules !== undefined) {
    if (!Array.isArray(data.rules)) throw new ConfigError('must be a list', 'rules');
    config.rules = data.rules.map((rule, index) => normalizeRule(rule, `rules[${index}]`));
  }
  if (data.presets !== undefined) {
    if (!Array.isArray(data.presets)) throw new ConfigError('must be a list', 'presets');
    config.presets = data.presets.map((preset, index) =>
      normalizePreset(preset, `presets[${index}]`),
    );
  }
  if (typeof data.pausedUntil === 'number' && Number.isFinite(data.pausedUntil)) {
    config.pausedUntil = data.pausedUntil;
  }
  if (typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt)) {
    config.updatedAt = data.updatedAt;
  }

  const ids = new Set<string>();
  for (const rule of config.rules) {
    if (ids.has(rule.id)) rule.id = createId();
    ids.add(rule.id);
  }
  return config;
}

/** Returns true when two rules compare URLs in the same way. */
export function isSameRule(a: Rule, b: Rule): boolean {
  const caseInsensitive = a.matchType !== 'regex' && a.matchType !== 'path';
  const left = caseInsensitive ? a.pattern.trim().toLowerCase() : a.pattern;
  const right = caseInsensitive ? b.pattern.trim().toLowerCase() : b.pattern;
  return (
    a.matchType === b.matchType &&
    left === right &&
    (a.matchType !== 'regex' || Boolean(a.ignoreCase) === Boolean(b.ignoreCase))
  );
}

/** Merges imported rules into the current rules. Rules that exist already are ignored. */
export function mergeConfigs(current: Config, imported: Config): Config {
  const rules = [...current.rules];
  const ids = new Set(rules.map((rule) => rule.id));
  for (const rule of imported.rules) {
    if (rules.some((existing) => isSameRule(existing, rule))) continue;
    rules.push(ids.has(rule.id) ? { ...rule, id: createId() } : rule);
    ids.add(rule.id);
  }
  const presets = [...current.presets];
  for (const preset of imported.presets) {
    if (!presets.some((existing) => existing.name === preset.name)) presets.push(preset);
  }
  return { ...current, rules, presets };
}
