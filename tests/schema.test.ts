import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  isSameRule,
  mergeConfigs,
  normalizeSettings,
  parseConfig,
} from '../src/shared/config/schema';
import { CONFIG_VERSION, createDefaultConfig } from '../src/shared/defaults';
import { filterStyleSheet, filterValue } from '../src/shared/filter';
import type { Rule } from '../src/shared/types';

const baseRule = { pattern: 'example.com', matchType: 'domain', action: 'gray' };

describe('parseConfig (C-06, C-07)', () => {
  it('fills missing fields with the default values', () => {
    const config = parseConfig({});
    const defaults = createDefaultConfig();
    expect({ ...config, updatedAt: 0 }).toEqual({ ...defaults, updatedAt: 0 });
  });

  it('accepts a full configuration', () => {
    const input = {
      version: 1,
      enabled: false,
      mode: 'all',
      language: 'it',
      global: { intensity: 80, contrast: 120, brightness: 90 },
      rules: [
        {
          id: 'a',
          ...baseRule,
          enabled: false,
          label: 'Example',
          ignoreCase: true,
          settings: { intensity: 30 },
          schedule: { days: [5, 1, 1], start: '9:00', end: '18:00' },
        },
      ],
      presets: [{ id: 'p', name: ' Work ', settings: { intensity: 60 } }],
      pausedUntil: 5,
      updatedAt: 7,
    };
    const config = parseConfig(input);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe('all');
    expect(config.language).toBe('it');
    expect(config.rules[0]).toEqual({
      id: 'a',
      pattern: 'example.com',
      matchType: 'domain',
      action: 'gray',
      enabled: false,
      ignoreCase: true,
      label: 'Example',
      settings: { intensity: 30, contrast: 100, brightness: 100 },
      schedule: { days: [1, 5], start: '9:00', end: '18:00' },
    });
    expect(config.presets[0]?.name).toBe('Work');
    expect(config.pausedUntil).toBe(5);
    expect(config.updatedAt).toBe(7);
  });

  it('converts a file without a version field', () => {
    expect(parseConfig({ rules: [baseRule] }).version).toBe(CONFIG_VERSION);
  });

  it('gives new identifiers to rules without an identifier or with a duplicate one', () => {
    const config = parseConfig({
      rules: [baseRule, { ...baseRule, id: 'x' }, { ...baseRule, id: 'x' }],
    });
    const ids = config.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe('x');
  });

  it('clamps setting values to the limits', () => {
    expect(normalizeSettings({ intensity: 140, contrast: 10, brightness: 99.6 }, 'x')).toEqual({
      intensity: 100,
      contrast: 50,
      brightness: 100,
    });
  });

  it.each<[string, unknown]>([
    ['config', 'text'],
    ['config', []],
    ['version', { version: 99 }],
    ['enabled', { enabled: 'yes' }],
    ['mode', { mode: 'some' }],
    ['language', { language: 'fr' }],
    ['global', { global: 3 }],
    ['global.intensity', { global: { intensity: '3' } }],
    ['rules', { rules: {} }],
    ['rules[0]', { rules: [null] }],
    ['rules[0].pattern', { rules: [{ ...baseRule, pattern: 3 }] }],
    ['rules[0].matchType', { rules: [{ ...baseRule, matchType: 'glob' }] }],
    ['rules[0].action', { rules: [{ ...baseRule, action: 'blur' }] }],
    ['rules[0].ignoreCase', { rules: [{ ...baseRule, ignoreCase: 1 }] }],
    ['rules[0]', { rules: [{ ...baseRule, pattern: 'bad host' }] }],
    ['rules[0].label', { rules: [{ ...baseRule, label: 5 }] }],
    ['rules[0].schedule', { rules: [{ ...baseRule, schedule: 'always' }] }],
    ['rules[0].schedule.days', { rules: [{ ...baseRule, schedule: { days: [9] } }] }],
    [
      'rules[0].schedule.start',
      { rules: [{ ...baseRule, schedule: { days: [1], start: '25:00', end: '10:00' } }] },
    ],
    [
      'rules[0].schedule.end',
      { rules: [{ ...baseRule, schedule: { days: [1], start: '09:00', end: 'x' } }] },
    ],
    ['presets', { presets: 'x' }],
    ['presets[0]', { presets: [1] }],
    ['presets[0].name', { presets: [{ name: '' }] }],
  ])('rejects a value that is not valid at %s', (path, input) => {
    expect(() => parseConfig(input)).toThrow(ConfigError);
    try {
      parseConfig(input);
    } catch (error) {
      expect((error as ConfigError).path).toBe(path);
    }
  });
});

describe('rule comparison and merge (C-05, R-13)', () => {
  const rule = (partial: Partial<Rule>): Rule => ({
    id: 'id',
    pattern: 'example.com',
    matchType: 'domain',
    action: 'gray',
    enabled: true,
    ...partial,
  });

  it('finds rules that compare URLs in the same way', () => {
    expect(isSameRule(rule({}), rule({ pattern: ' EXAMPLE.com ', action: 'skip' }))).toBe(true);
    expect(isSameRule(rule({}), rule({ matchType: 'host' }))).toBe(false);
    const regex = rule({ matchType: 'regex', pattern: 'a' });
    expect(isSameRule(regex, { ...regex, pattern: 'A' })).toBe(false);
    expect(isSameRule(regex, { ...regex, ignoreCase: true })).toBe(false);
  });

  it('adds only new rules and presets', () => {
    const current = {
      ...createDefaultConfig(),
      rules: [rule({ id: 'a' })],
      presets: [{ id: 'p', name: 'Work', settings: createDefaultConfig().global }],
    };
    const imported = {
      ...createDefaultConfig(),
      rules: [rule({ id: 'b' }), rule({ id: 'a', pattern: 'other.com' })],
      presets: [
        { id: 'q', name: 'Work', settings: createDefaultConfig().global },
        { id: 'r', name: 'Night', settings: createDefaultConfig().global },
      ],
    };
    const merged = mergeConfigs(current, imported);
    expect(merged.rules.map((r) => r.pattern)).toEqual(['example.com', 'other.com']);
    expect(merged.rules[1]?.id).not.toBe('a');
    expect(merged.presets.map((p) => p.name)).toEqual(['Work', 'Night']);
  });
});

describe('filter style', () => {
  it('builds the CSS filter value', () => {
    expect(filterValue({ intensity: 100, contrast: 100, brightness: 100 })).toBe('grayscale(100%)');
    expect(filterValue({ intensity: 40, contrast: 120, brightness: 80 })).toBe(
      'grayscale(40%) contrast(120%) brightness(80%)',
    );
    expect(filterValue({ intensity: 0, contrast: 100, brightness: 100 })).toBe('none');
  });

  it('builds the style sheet', () => {
    expect(filterStyleSheet({ intensity: 50, contrast: 100, brightness: 100 })).toBe(
      'html{filter:grayscale(50%)!important;}',
    );
    expect(filterStyleSheet({ intensity: 0, contrast: 100, brightness: 100 })).toBe('');
  });
});
