import type { Config, FilterSettings, Rule, Schedule } from '../types';
import { compilePattern, type Matcher } from './match';
import { isSupportedUrl, parseUrl } from './url';

export type Reason =
  'disabled' | 'paused' | 'unsupported' | 'rule' | 'skipRule' | 'allSites' | 'noRule';

export interface Decision {
  /** True when GrayWeb must apply the filter. */
  gray: boolean;
  /** The settings to apply. Present only when `gray` is true. */
  settings?: FilterSettings;
  /** The rule that gave the decision, if any. */
  rule?: Rule;
  reason: Reason;
}

interface CompiledRule {
  rule: Rule;
  matcher: Matcher;
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Returns true when the schedule is active at the given time. */
export function isScheduleActive(schedule: Schedule, now: Date): boolean {
  const start = minutesOf(schedule.start);
  const end = minutesOf(schedule.end);
  if (start === null || end === null) return false;
  const day = now.getDay();
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return schedule.days.includes(day);
  if (start < end) return schedule.days.includes(day) && current >= start && current < end;
  // The range continues past midnight: the part after midnight belongs to the previous day.
  if (current >= start) return schedule.days.includes(day);
  if (current < end) return schedule.days.includes((day + 6) % 7);
  return false;
}

/**
 * Compiles the rules of a configuration one time, then evaluates URLs fast.
 * Rules that are not valid are ignored.
 */
export class RuleEngine {
  private readonly compiled: CompiledRule[];

  constructor(private readonly config: Config) {
    this.compiled = [];
    for (const rule of config.rules) {
      const result = compilePattern(rule);
      if (result.ok) this.compiled.push({ rule, matcher: result.matcher });
    }
  }

  /** True when one or more active rules have a schedule. */
  get hasSchedules(): boolean {
    return this.config.rules.some((rule) => rule.enabled && rule.schedule !== undefined);
  }

  /** Returns the first enabled rule that agrees with the URL, or undefined. */
  findRule(href: string, now = new Date()): Rule | undefined {
    const url = parseUrl(href);
    if (url === null) return undefined;
    for (const { rule, matcher } of this.compiled) {
      if (!rule.enabled) continue;
      if (rule.schedule !== undefined && !isScheduleActive(rule.schedule, now)) continue;
      if (matcher(url)) return rule;
    }
    return undefined;
  }

  evaluate(href: string, now = new Date()): Decision {
    const { config } = this;
    if (!config.enabled) return { gray: false, reason: 'disabled' };
    if (config.pausedUntil > now.getTime()) return { gray: false, reason: 'paused' };
    if (!isSupportedUrl(href)) return { gray: false, reason: 'unsupported' };

    const rule = this.findRule(href, now);
    if (rule !== undefined) {
      if (rule.action === 'skip') return { gray: false, rule, reason: 'skipRule' };
      return { gray: true, rule, settings: rule.settings ?? config.global, reason: 'rule' };
    }
    if (config.mode === 'all') return { gray: true, settings: config.global, reason: 'allSites' };
    return { gray: false, reason: 'noRule' };
  }
}

export function evaluate(config: Config, href: string, now = new Date()): Decision {
  return new RuleEngine(config).evaluate(href, now);
}
