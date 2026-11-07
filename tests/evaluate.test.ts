import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../src/shared/defaults';
import { evaluate, isScheduleActive, RuleEngine } from '../src/shared/rules/evaluate';
import type { Config, Rule } from '../src/shared/types';

let counter = 0;
function rule(partial: Partial<Rule> & Pick<Rule, 'pattern'>): Rule {
  counter += 1;
  return { id: `r${counter}`, matchType: 'domain', action: 'gray', enabled: true, ...partial };
}

function config(partial: Partial<Config> = {}): Config {
  return { ...createDefaultConfig(0), ...partial };
}

// Wednesday 2026-11-04, 10:30 local time.
const WEDNESDAY_MORNING = new Date(2026, 10, 4, 10, 30);

describe('rule evaluation', () => {
  it('does nothing in "listed" mode without a rule (R-02, R-03)', () => {
    expect(evaluate(config(), 'https://example.com/')).toEqual({ gray: false, reason: 'noRule' });
  });

  it('applies the global settings for a gray rule (S-05)', () => {
    const r = rule({ pattern: 'example.com' });
    const result = evaluate(config({ rules: [r] }), 'https://www.example.com/');
    expect(result).toEqual({
      gray: true,
      rule: r,
      settings: createDefaultConfig().global,
      reason: 'rule',
    });
  });

  it('applies the site settings when the rule has them (S-06)', () => {
    const settings = { intensity: 40, contrast: 110, brightness: 90 };
    const r = rule({ pattern: 'example.com', settings });
    expect(evaluate(config({ rules: [r] }), 'https://example.com/').settings).toBe(settings);
  });

  it('applies the filter to all sites in "all" mode (R-04)', () => {
    const result = evaluate(config({ mode: 'all' }), 'https://example.com/');
    expect(result.gray).toBe(true);
    expect(result.reason).toBe('allSites');
  });

  it('respects a skip rule in "all" mode (R-04)', () => {
    const r = rule({ pattern: 'example.com', action: 'skip' });
    const result = evaluate(config({ mode: 'all', rules: [r] }), 'https://example.com/');
    expect(result).toEqual({ gray: false, rule: r, reason: 'skipRule' });
  });

  it('uses the first rule that agrees (R-05)', () => {
    const skip = rule({ pattern: 'docs.example.com', matchType: 'host', action: 'skip' });
    const gray = rule({ pattern: 'example.com' });
    const both = config({ rules: [skip, gray] });
    expect(evaluate(both, 'https://docs.example.com/').reason).toBe('skipRule');
    expect(evaluate(both, 'https://www.example.com/').reason).toBe('rule');
    const reversed = config({ rules: [gray, skip] });
    expect(evaluate(reversed, 'https://docs.example.com/').reason).toBe('rule');
  });

  it('ignores disabled rules and rules that are not valid', () => {
    const rules = [
      rule({ pattern: 'example.com', enabled: false }),
      rule({ pattern: '(broken', matchType: 'regex' }),
    ];
    expect(evaluate(config({ rules }), 'https://example.com/').gray).toBe(false);
  });

  it('does nothing when GrayWeb is off (G-01)', () => {
    const rules = [rule({ pattern: 'example.com' })];
    expect(evaluate(config({ enabled: false, rules }), 'https://example.com/')).toEqual({
      gray: false,
      reason: 'disabled',
    });
  });

  it('does nothing during a timed pause (G-03)', () => {
    const rules = [rule({ pattern: 'example.com' })];
    const now = new Date(1_000_000);
    const paused = config({ rules, pausedUntil: 2_000_000 });
    expect(evaluate(paused, 'https://example.com/', now).reason).toBe('paused');
    const expired = config({ rules, pausedUntil: 500_000 });
    expect(evaluate(expired, 'https://example.com/', now).gray).toBe(true);
  });

  it('does nothing on pages that are not supported', () => {
    expect(evaluate(config({ mode: 'all' }), 'chrome://extensions').reason).toBe('unsupported');
  });

  it('applies scheduled rules only in their time range (R-14)', () => {
    const r = rule({
      pattern: 'example.com',
      schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    });
    const engine = new RuleEngine(config({ rules: [r] }));
    expect(engine.hasSchedules).toBe(true);
    expect(engine.evaluate('https://example.com/', WEDNESDAY_MORNING).gray).toBe(true);
    const evening = new Date(2026, 10, 4, 19, 0);
    expect(engine.evaluate('https://example.com/', evening).gray).toBe(false);
  });

  it('returns undefined from findRule for a URL that is not valid', () => {
    const engine = new RuleEngine(config({ rules: [rule({ pattern: 'a.com' })] }));
    expect(engine.findRule('nope')).toBeUndefined();
    expect(engine.hasSchedules).toBe(false);
  });

  it('evaluates 500 rules in less than 1 ms per URL (N-06)', () => {
    const rules = Array.from({ length: 500 }, (_, i) =>
      rule({
        pattern: i % 2 === 0 ? `site${i}.example.com` : `^https://site${i}\\.test/`,
        matchType: i % 2 === 0 ? 'domain' : 'regex',
      }),
    );
    const engine = new RuleEngine(config({ rules }));
    const runs = 200;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) engine.evaluate('https://no-match.example.org/path');
    expect((performance.now() - start) / runs).toBeLessThan(1);
  });
});

describe('schedules', () => {
  const at = (day: number, hours: number, minutes = 0) =>
    // 2026-11-01 is a Sunday.
    new Date(2026, 10, 1 + day, hours, minutes);

  it('respects the days and the time range', () => {
    const schedule = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
    expect(isScheduleActive(schedule, at(1, 9))).toBe(true);
    expect(isScheduleActive(schedule, at(1, 17, 59))).toBe(true);
    expect(isScheduleActive(schedule, at(1, 18))).toBe(false);
    expect(isScheduleActive(schedule, at(0, 12))).toBe(false);
  });

  it('continues past midnight', () => {
    const schedule = { days: [5], start: '22:00', end: '02:00' };
    expect(isScheduleActive(schedule, at(5, 23))).toBe(true);
    expect(isScheduleActive(schedule, at(6, 1))).toBe(true);
    expect(isScheduleActive(schedule, at(6, 3))).toBe(false);
    expect(isScheduleActive(schedule, at(4, 23))).toBe(false);
    expect(isScheduleActive(schedule, at(5, 12))).toBe(false);
  });

  it('covers the full day when start and end are equal', () => {
    const schedule = { days: [0], start: '00:00', end: '00:00' };
    expect(isScheduleActive(schedule, at(0, 15))).toBe(true);
    expect(isScheduleActive(schedule, at(1, 15))).toBe(false);
  });

  it('is not active with times that are not valid', () => {
    expect(isScheduleActive({ days: [1], start: '25:00', end: '10:00' }, at(1, 9))).toBe(false);
    expect(isScheduleActive({ days: [1], start: 'x', end: '10:00' }, at(1, 9))).toBe(false);
  });
});
