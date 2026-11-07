import { RuleEngine } from '../rules/evaluate';
import { normalizeHost, parseUrl } from '../rules/url';
import { registrableDomainGuess, suggestPattern } from '../rules/match';
import type { Config, MatchType, Rule } from '../types';
import { createId, isSameRule } from './schema';

export interface ToggleResult {
  config: Config;
  /** True when the page is gray after the change. */
  gray: boolean;
  added?: Rule;
  removed?: Rule;
}

function isGray(config: Config, href: string): boolean {
  // The toggle works on the rules only. It ignores the pause and the main switch.
  return new RuleEngine({ ...config, enabled: true, pausedUntil: 0 }).evaluate(href).gray;
}

/**
 * Returns true when a rule is about this website only, so that the popup can remove it.
 * A broad rule (for example, a regular expression for many websites) is not removed.
 */
export function isRuleForSite(rule: Rule, href: string): boolean {
  const url = parseUrl(href);
  if (url === null) return false;
  switch (rule.matchType) {
    case 'domain': {
      const domain = normalizeHost(rule.pattern);
      return domain === url.host || domain === registrableDomainGuess(url.host);
    }
    case 'host':
    case 'exact':
      return true;
    default:
      return rule.pattern === suggestPattern(href, rule.matchType);
  }
}

export function newRule(partial: Pick<Rule, 'pattern' | 'matchType' | 'action'>): Rule {
  return { id: createId(), enabled: true, ...partial };
}

/**
 * Changes the rules so that the page changes between gray and color.
 * When a rule for this website gives the current result, the function removes it.
 * When that is not sufficient, it adds a rule with the opposite action at the top.
 */
export function toggleSite(config: Config, href: string, matchType: MatchType): ToggleResult {
  const wasGray = isGray(config, href);
  const engine = new RuleEngine({ ...config, enabled: true, pausedUntil: 0 });
  const matched = engine.findRule(href);
  let next = config;
  let removed: Rule | undefined;

  if (matched !== undefined && isRuleForSite(matched, href)) {
    next = { ...config, rules: config.rules.filter((rule) => rule.id !== matched.id) };
    removed = matched;
    if (isGray(next, href) !== wasGray) return { config: next, gray: !wasGray, removed };
  }

  const added = newRule({
    pattern: suggestPattern(href, matchType),
    matchType,
    action: wasGray ? 'skip' : 'gray',
  });
  next = { ...next, rules: [added, ...next.rules] };
  const result: ToggleResult = { config: next, gray: isGray(next, href), added };
  if (removed !== undefined) result.removed = removed;
  return result;
}

/** Returns the rule that is equal to the given rule, if one exists. */
export function findDuplicate(config: Config, rule: Rule): Rule | undefined {
  return config.rules.find((existing) => existing.id !== rule.id && isSameRule(existing, rule));
}

export function moveRule(config: Config, id: string, toIndex: number): Config {
  const from = config.rules.findIndex((rule) => rule.id === id);
  if (from === -1) return config;
  const rules = [...config.rules];
  const [rule] = rules.splice(from, 1);
  if (rule === undefined) return config;
  rules.splice(Math.max(0, Math.min(toIndex, rules.length)), 0, rule);
  return { ...config, rules };
}

export function upsertRule(config: Config, rule: Rule): Config {
  const index = config.rules.findIndex((existing) => existing.id === rule.id);
  if (index === -1) return { ...config, rules: [...config.rules, rule] };
  const rules = [...config.rules];
  rules[index] = rule;
  return { ...config, rules };
}

export function removeRule(config: Config, id: string): Config {
  return { ...config, rules: config.rules.filter((rule) => rule.id !== id) };
}
