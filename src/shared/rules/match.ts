import type { MatchType } from '../types';
import { normalizeHost, parseUrl, trimTrailingSlash, type ParsedUrl } from './url';

export const MAX_PATTERN_LENGTH = 500;

export type Matcher = (url: ParsedUrl) => boolean;

export type PatternError =
  'empty' | 'tooLong' | 'invalidHost' | 'invalidUrl' | 'invalidPath' | 'invalidRegex';

export type CompileResult = { ok: true; matcher: Matcher } | { ok: false; error: PatternError };

interface PatternInput {
  pattern: string;
  matchType: MatchType;
  ignoreCase?: boolean | undefined;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converts a wildcard pattern to a regular expression. `*` = any text, `?` = one character. */
export function wildcardToRegex(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`, 'i');
}

function compileDomain(pattern: string): CompileResult {
  const domain = normalizeHost(pattern);
  if (domain === null) return { ok: false, error: 'invalidHost' };
  const suffix = `.${domain}`;
  return { ok: true, matcher: (url) => url.host === domain || url.host.endsWith(suffix) };
}

function compileHost(pattern: string): CompileResult {
  const host = normalizeHost(pattern);
  if (host === null) return { ok: false, error: 'invalidHost' };
  return { ok: true, matcher: (url) => url.host === host };
}

function compilePrefix(pattern: string): CompileResult {
  if (SCHEME.test(pattern)) {
    const parsed = parseUrl(pattern);
    if (parsed === null) return { ok: false, error: 'invalidUrl' };
    // Keep the original path text: URL parsing adds "/" to a bare origin.
    const prefix = pattern.endsWith('/') ? parsed.href : parsed.href.replace(/\/$/, '');
    return { ok: true, matcher: (url) => url.href.startsWith(prefix) };
  }
  const parsed = parseUrl(`http://${pattern}`);
  if (parsed === null) return { ok: false, error: 'invalidUrl' };
  const prefix = pattern.endsWith('/')
    ? parsed.hrefNoScheme
    : parsed.hrefNoScheme.replace(/\/$/, '');
  return { ok: true, matcher: (url) => url.hrefNoScheme.startsWith(prefix) };
}

function compileExact(pattern: string): CompileResult {
  const parsed = parseUrl(SCHEME.test(pattern) ? pattern : `https://${pattern}`);
  if (parsed === null) return { ok: false, error: 'invalidUrl' };
  const target = trimTrailingSlash(parsed.base);
  if (SCHEME.test(pattern)) {
    return { ok: true, matcher: (url) => trimTrailingSlash(url.base) === target };
  }
  // Without a scheme, the rule agrees with http and https.
  const targetNoScheme = target.replace(SCHEME, '');
  return {
    ok: true,
    matcher: (url) => trimTrailingSlash(url.base).replace(SCHEME, '') === targetNoScheme,
  };
}

function compileWildcard(pattern: string): CompileResult {
  const regex = wildcardToRegex(pattern);
  const hasScheme = SCHEME.test(pattern) || pattern.startsWith('*');
  return {
    ok: true,
    matcher: (url) => regex.test(hasScheme ? url.href : url.hrefNoScheme),
  };
}

function compileRegex(pattern: string, ignoreCase: boolean): CompileResult {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch {
    return { ok: false, error: 'invalidRegex' };
  }
  return { ok: true, matcher: (url) => regex.test(url.href) };
}

function compileContains(pattern: string): CompileResult {
  const needle = pattern.toLowerCase();
  return { ok: true, matcher: (url) => url.href.toLowerCase().includes(needle) };
}

function compilePath(pattern: string): CompileResult {
  if (!pattern.startsWith('/') || /[\s?#]/.test(pattern))
    return { ok: false, error: 'invalidPath' };
  // Encode the pattern like the browser encodes `location.pathname`.
  const path = trimTrailingSlash(new URL(pattern, 'http://x').pathname);
  if (path === '/') return { ok: true, matcher: () => true };
  const folder = `${path}/`;
  return {
    ok: true,
    matcher: (url) => url.pathname === path || url.pathname.startsWith(folder),
  };
}

export function compilePattern(input: PatternInput): CompileResult {
  const pattern = input.matchType === 'regex' ? input.pattern : input.pattern.trim();
  if (pattern === '') return { ok: false, error: 'empty' };
  if (pattern.length > MAX_PATTERN_LENGTH) return { ok: false, error: 'tooLong' };
  switch (input.matchType) {
    case 'domain':
      return compileDomain(pattern);
    case 'host':
      return compileHost(pattern);
    case 'prefix':
      return compilePrefix(pattern);
    case 'exact':
      return compileExact(pattern);
    case 'wildcard':
      return compileWildcard(pattern);
    case 'regex':
      return compileRegex(pattern, input.ignoreCase ?? false);
    case 'contains':
      return compileContains(pattern);
    case 'path':
      return compilePath(pattern);
  }
}

/** Tests one pattern against one URL. Returns false for a URL or pattern that is not valid. */
export function patternMatches(input: PatternInput, href: string): boolean {
  const compiled = compilePattern(input);
  const url = parseUrl(href);
  return compiled.ok && url !== null && compiled.matcher(url);
}

/** Makes a pattern for the given URL and match type. Used by the popup. */
export function suggestPattern(href: string, matchType: MatchType): string {
  const url = parseUrl(href);
  if (url === null) return '';
  switch (matchType) {
    case 'domain':
      return registrableDomainGuess(url.host);
    case 'host':
      return url.host;
    case 'prefix':
      return url.base;
    case 'exact':
      return url.base;
    case 'wildcard':
      return `*://*.${registrableDomainGuess(url.host)}/*`;
    case 'regex':
      return `^https?://([^/]+\\.)?${escapeRegex(registrableDomainGuess(url.host))}/`;
    case 'contains':
      return registrableDomainGuess(url.host);
    case 'path':
      return url.pathname;
  }
}

// Common second-level labels under country code domains (for example "co.uk").
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gob', 'ne', 'or']);

/**
 * Guesses the registrable domain of a host without the full Public Suffix List.
 * "www.news.example.co.uk" → "example.co.uk". IP addresses stay the same.
 */
export function registrableDomainGuess(host: string): string {
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const secondLast = labels[labels.length - 2] ?? '';
  const last = labels[labels.length - 1] ?? '';
  const keep = last.length === 2 && SECOND_LEVEL.has(secondLast) ? 3 : 2;
  return labels.slice(-keep).join('.');
}
