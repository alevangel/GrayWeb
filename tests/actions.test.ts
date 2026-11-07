import { describe, expect, it } from 'vitest';
import {
  findDuplicate,
  isRuleForSite,
  moveRule,
  removeRule,
  toggleSite,
  upsertRule,
} from '../src/shared/config/actions';
import { splitIntoChunks } from '../src/shared/config/sync';
import { createDefaultConfig } from '../src/shared/defaults';
import type { Config, Rule } from '../src/shared/types';

const HREF = 'https://www.example.com/news/today';

function rule(partial: Partial<Rule> & Pick<Rule, 'pattern'>): Rule {
  return { id: partial.pattern, matchType: 'domain', action: 'gray', enabled: true, ...partial };
}

function config(partial: Partial<Config> = {}): Config {
  return { ...createDefaultConfig(0), ...partial };
}

describe('toggleSite (R-09, R-10)', () => {
  it('adds a gray rule at the top when the site is in color', () => {
    const other = rule({ pattern: 'other.org' });
    const result = toggleSite(config({ rules: [other] }), HREF, 'domain');
    expect(result.gray).toBe(true);
    expect(result.added).toMatchObject({ pattern: 'example.com', action: 'gray' });
    expect(result.config.rules.map((r) => r.pattern)).toEqual(['example.com', 'other.org']);
  });

  it('uses the selected match type', () => {
    const result = toggleSite(config(), HREF, 'host');
    expect(result.added).toMatchObject({ pattern: 'www.example.com', matchType: 'host' });
  });

  it('removes the rule of this site when the site is gray', () => {
    const own = rule({ pattern: 'example.com' });
    const result = toggleSite(config({ rules: [own] }), HREF, 'domain');
    expect(result).toMatchObject({ gray: false, removed: own });
    expect(result.added).toBeUndefined();
    expect(result.config.rules).toEqual([]);
  });

  it('keeps a broad rule and adds an exception', () => {
    const broad = rule({ pattern: 'example', matchType: 'contains' });
    const result = toggleSite(config({ rules: [broad] }), HREF, 'domain');
    expect(result.gray).toBe(false);
    expect(result.removed).toBeUndefined();
    expect(result.config.rules.map((r) => [r.pattern, r.action])).toEqual([
      ['example.com', 'skip'],
      ['example', 'gray'],
    ]);
  });

  it('adds an exception when a second rule still makes the site gray', () => {
    const own = rule({ pattern: 'www.example.com', matchType: 'host' });
    const broad = rule({ pattern: '/news', matchType: 'path' });
    const result = toggleSite(config({ rules: [own, broad] }), HREF, 'domain');
    expect(result.gray).toBe(false);
    expect(result.removed).toEqual(own);
    expect(result.config.rules.map((r) => r.action)).toEqual(['skip', 'gray']);
  });

  it('adds an exception in "all" mode, and removes it again', () => {
    const first = toggleSite(config({ mode: 'all' }), HREF, 'domain');
    expect(first.gray).toBe(false);
    expect(first.added?.action).toBe('skip');
    const second = toggleSite(first.config, HREF, 'domain');
    expect(second.gray).toBe(true);
    expect(second.config.rules).toEqual([]);
  });

  it('ignores the pause and the main switch', () => {
    const own = rule({ pattern: 'example.com' });
    const paused = config({ rules: [own], enabled: false, pausedUntil: Date.now() + 60_000 });
    expect(toggleSite(paused, HREF, 'domain').removed).toEqual(own);
  });
});

describe('isRuleForSite', () => {
  it.each<[Partial<Rule> & Pick<Rule, 'pattern'>, boolean]>([
    [{ pattern: 'example.com' }, true],
    [{ pattern: 'www.example.com' }, true],
    [{ pattern: 'com' }, false],
    [{ pattern: 'www.example.com', matchType: 'host' }, true],
    [{ pattern: HREF, matchType: 'exact' }, true],
    [{ pattern: 'https://www.example.com/news/today', matchType: 'prefix' }, true],
    [{ pattern: 'https://www.example.com/', matchType: 'prefix' }, false],
    [{ pattern: 'example', matchType: 'contains' }, false],
  ])('%o → %s', (partial, expected) => {
    expect(isRuleForSite(rule(partial), HREF)).toBe(expected);
  });

  it('returns false for a URL that is not valid', () => {
    expect(isRuleForSite(rule({ pattern: 'a.com' }), 'nope')).toBe(false);
  });
});

describe('rule list changes', () => {
  const a = rule({ pattern: 'a.com' });
  const b = rule({ pattern: 'b.com' });
  const c = rule({ pattern: 'c.com' });
  const base = config({ rules: [a, b, c] });
  const patterns = (value: Config) => value.rules.map((r) => r.pattern);

  it('moves a rule (R-06)', () => {
    expect(patterns(moveRule(base, 'a.com', 2))).toEqual(['b.com', 'c.com', 'a.com']);
    expect(patterns(moveRule(base, 'c.com', 0))).toEqual(['c.com', 'a.com', 'b.com']);
    expect(patterns(moveRule(base, 'b.com', 99))).toEqual(['a.com', 'c.com', 'b.com']);
    expect(moveRule(base, 'missing', 0)).toBe(base);
  });

  it('adds or replaces a rule', () => {
    expect(patterns(upsertRule(base, rule({ pattern: 'd.com' })))).toHaveLength(4);
    const changed = upsertRule(base, { ...b, enabled: false });
    expect(changed.rules[1]?.enabled).toBe(false);
  });

  it('removes a rule', () => {
    expect(patterns(removeRule(base, 'b.com'))).toEqual(['a.com', 'c.com']);
  });

  it('finds a duplicate, but not the rule itself (R-13)', () => {
    expect(findDuplicate(base, { ...a, id: 'new' })).toBe(a);
    expect(findDuplicate(base, a)).toBeUndefined();
  });
});

describe('sync chunks (C-02)', () => {
  it('splits text into parts and joins them again', () => {
    const text = 'x'.repeat(13_000);
    const chunks = splitIntoChunks(text);
    expect(chunks.map((chunk) => chunk.length)).toEqual([6000, 6000, 1000]);
    expect(chunks.join('')).toBe(text);
  });

  it('keeps one empty part for empty text', () => {
    expect(splitIntoChunks('')).toEqual(['']);
  });
});
