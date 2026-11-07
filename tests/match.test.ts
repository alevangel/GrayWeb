import { describe, expect, it } from 'vitest';
import {
  compilePattern,
  MAX_PATTERN_LENGTH,
  patternMatches,
  registrableDomainGuess,
  suggestPattern,
  wildcardToRegex,
} from '../src/shared/rules/match';
import {
  isSupportedUrl,
  normalizeHost,
  parseUrl,
  trimTrailingSlash,
} from '../src/shared/rules/url';
import type { MatchType } from '../src/shared/types';

function agrees(matchType: MatchType, pattern: string, href: string, ignoreCase?: boolean) {
  return patternMatches({ pattern, matchType, ignoreCase }, href);
}

describe('url helpers', () => {
  it('parses and normalizes a URL', () => {
    const url = parseUrl('HTTPS://WWW.Example.COM:8080/Path?q=1#top');
    expect(url).toEqual({
      href: 'https://www.example.com:8080/Path?q=1#top',
      hrefNoScheme: 'www.example.com:8080/Path?q=1#top',
      host: 'www.example.com',
      pathname: '/Path',
      base: 'https://www.example.com:8080/Path',
    });
  });

  it('returns null for a URL that is not valid', () => {
    expect(parseUrl('not a url')).toBeNull();
  });

  it('cuts very long URLs', () => {
    const url = parseUrl(`https://example.com/${'a'.repeat(5000)}`);
    expect(url?.href.length).toBe(2048);
  });

  it.each([
    ['Example.COM', 'example.com'],
    ['*.example.com', 'example.com'],
    ['.example.com.', 'example.com'],
    ['https://www.example.com/path?x', 'www.example.com'],
    ['bücher.de', 'xn--bcher-kva.de'],
    ['localhost', 'localhost'],
  ])('normalizes host %s', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });

  it.each(['', '   ', 'exa mple.com', 'example.com/path', 'a*b.com', 'https://', '*.'])(
    'rejects host %j',
    (input) => {
      expect(normalizeHost(input)).toBeNull();
    },
  );

  it('removes a trailing slash but keeps the root', () => {
    expect(trimTrailingSlash('/a/')).toBe('/a');
    expect(trimTrailingSlash('/')).toBe('/');
  });

  it('accepts only http, https and file URLs', () => {
    expect(isSupportedUrl('https://a.com')).toBe(true);
    expect(isSupportedUrl('file:///tmp/a.html')).toBe(true);
    expect(isSupportedUrl('chrome://settings')).toBe(false);
    expect(isSupportedUrl('about:blank')).toBe(false);
    expect(isSupportedUrl(undefined)).toBe(false);
  });
});

describe('domain match (M-01, M-09, M-10, M-11)', () => {
  it.each([
    'https://example.com/',
    'https://www.example.com/a',
    'http://a.b.example.com/',
    'https://EXAMPLE.com/',
  ])('agrees with %s', (href) => {
    expect(agrees('domain', 'example.com', href)).toBe(true);
  });

  it.each(['https://notexample.com/', 'https://myexample.com/', 'https://example.org/'])(
    'does not agree with %s',
    (href) => {
      expect(agrees('domain', 'example.com', href)).toBe(false);
    },
  );

  it('accepts uppercase and international patterns', () => {
    expect(agrees('domain', 'EXAMPLE.com', 'https://www.example.com/')).toBe(true);
    expect(agrees('domain', 'bücher.de', 'https://shop.bücher.de/')).toBe(true);
  });

  it('accepts a full URL as pattern', () => {
    expect(agrees('domain', 'https://example.com/news', 'https://m.example.com/')).toBe(true);
  });

  it('rejects a pattern that is not a host', () => {
    expect(compilePattern({ pattern: 'exa mple', matchType: 'domain' })).toEqual({
      ok: false,
      error: 'invalidHost',
    });
  });
});

describe('host match (M-02)', () => {
  it('agrees with the exact host only', () => {
    expect(agrees('host', 'www.example.com', 'https://www.example.com/a')).toBe(true);
    expect(agrees('host', 'www.example.com', 'https://example.com/')).toBe(false);
    expect(agrees('host', 'www.example.com', 'https://m.example.com/')).toBe(false);
  });

  it('ignores the port', () => {
    expect(agrees('host', 'localhost', 'http://localhost:3000/')).toBe(true);
  });

  it('rejects a pattern that is not a host', () => {
    expect(compilePattern({ pattern: 'a/b', matchType: 'host' }).ok).toBe(false);
  });
});

describe('prefix match (M-03)', () => {
  it('compares the start of the URL', () => {
    const pattern = 'https://example.com/news';
    expect(agrees('prefix', pattern, 'https://example.com/news/today')).toBe(true);
    expect(agrees('prefix', pattern, 'https://example.com/news')).toBe(true);
    expect(agrees('prefix', pattern, 'https://example.com/sport')).toBe(false);
    expect(agrees('prefix', pattern, 'http://example.com/news')).toBe(false);
  });

  it('respects a trailing slash in the pattern', () => {
    expect(agrees('prefix', 'https://example.com/news/', 'https://example.com/newsletter')).toBe(
      false,
    );
  });

  it('agrees with a bare origin', () => {
    expect(agrees('prefix', 'https://Example.com', 'https://example.com/a')).toBe(true);
  });

  it('agrees with all schemes when the pattern has no scheme', () => {
    expect(agrees('prefix', 'example.com/news', 'http://example.com/news/1')).toBe(true);
    expect(agrees('prefix', 'example.com/news', 'https://example.com/news/1')).toBe(true);
    expect(agrees('prefix', 'example.com/news', 'https://www.example.com/news')).toBe(false);
  });

  it('rejects a URL that is not valid', () => {
    expect(compilePattern({ pattern: 'https://exa mple.com', matchType: 'prefix' }).ok).toBe(false);
    expect(compilePattern({ pattern: 'exa mple.com', matchType: 'prefix' }).ok).toBe(false);
  });
});

describe('exact match (M-04)', () => {
  it('ignores the query, the fragment and a trailing slash', () => {
    const pattern = 'https://example.com/a';
    expect(agrees('exact', pattern, 'https://example.com/a')).toBe(true);
    expect(agrees('exact', pattern, 'https://example.com/a/')).toBe(true);
    expect(agrees('exact', pattern, 'https://example.com/a?x=1#y')).toBe(true);
    expect(agrees('exact', pattern, 'https://example.com/a/b')).toBe(false);
    expect(agrees('exact', pattern, 'http://example.com/a')).toBe(false);
  });

  it('agrees with http and https when the pattern has no scheme', () => {
    expect(agrees('exact', 'example.com/a', 'http://example.com/a')).toBe(true);
    expect(agrees('exact', 'example.com/a', 'https://example.com/a')).toBe(true);
  });

  it('rejects a URL that is not valid', () => {
    expect(compilePattern({ pattern: 'https://', matchType: 'exact' }).ok).toBe(false);
  });
});

describe('wildcard match (M-05, M-12)', () => {
  it('agrees with the PRD example', () => {
    const pattern = '*.example.*/video/*';
    expect(agrees('wildcard', pattern, 'https://m.example.org/video/42')).toBe(true);
    expect(agrees('wildcard', pattern, 'https://example.org/photo/1')).toBe(false);
  });

  it('uses ? for one character', () => {
    expect(agrees('wildcard', 'example.com/page?', 'https://example.com/page1')).toBe(true);
    expect(agrees('wildcard', 'example.com/page?', 'https://example.com/page12')).toBe(false);
  });

  it('compares without the scheme when the pattern has no scheme', () => {
    expect(agrees('wildcard', 'example.com/*', 'https://example.com/a')).toBe(true);
  });

  it('compares the full URL when the pattern has a scheme', () => {
    expect(agrees('wildcard', 'https://*.example.com/*', 'https://a.example.com/x')).toBe(true);
    expect(agrees('wildcard', 'https://*.example.com/*', 'http://a.example.com/x')).toBe(false);
  });

  it('escapes regular expression characters', () => {
    expect(wildcardToRegex('a.b+c').test('a.b+c')).toBe(true);
    expect(wildcardToRegex('a.b+c').test('axbbc')).toBe(false);
  });
});

describe('regular expression match (M-06, M-13)', () => {
  const pattern = '^https://(www\\.)?example\\.com/(watch|shorts)';

  it('agrees with the PRD example', () => {
    expect(agrees('regex', pattern, 'https://www.example.com/watch?v=1')).toBe(true);
    expect(agrees('regex', pattern, 'https://example.com/feed')).toBe(false);
  });

  it('uses the ignore case flag', () => {
    expect(agrees('regex', 'example\\.com/WATCH', 'https://example.com/watch')).toBe(false);
    expect(agrees('regex', 'example\\.com/WATCH', 'https://example.com/watch', true)).toBe(true);
  });

  it('rejects a regular expression that is not valid', () => {
    expect(compilePattern({ pattern: '(abc', matchType: 'regex' })).toEqual({
      ok: false,
      error: 'invalidRegex',
    });
  });

  it('rejects a pattern that is too long (M-15)', () => {
    const result = compilePattern({
      pattern: 'a'.repeat(MAX_PATTERN_LENGTH + 1),
      matchType: 'regex',
    });
    expect(result).toEqual({ ok: false, error: 'tooLong' });
  });
});

describe('contains match (M-07)', () => {
  it('finds text in any part of the URL', () => {
    expect(agrees('contains', 'casino', 'https://best-CASINO.example/')).toBe(true);
    expect(agrees('contains', 'casino', 'https://example.com/?q=casino')).toBe(true);
    expect(agrees('contains', 'casino', 'https://example.com/')).toBe(false);
  });
});

describe('path match (M-08)', () => {
  it('compares complete path segments', () => {
    expect(agrees('path', '/admin', 'https://a.com/admin')).toBe(true);
    expect(agrees('path', '/admin', 'https://b.org/admin/users')).toBe(true);
    expect(agrees('path', '/admin/', 'https://b.org/admin/users')).toBe(true);
    expect(agrees('path', '/admin', 'https://a.com/user/admin')).toBe(false);
    expect(agrees('path', '/admin', 'https://a.com/administrator')).toBe(false);
  });

  it('agrees with all pages for the root path', () => {
    expect(agrees('path', '/', 'https://a.com/x')).toBe(true);
  });

  it('encodes the pattern like the browser', () => {
    expect(agrees('path', '/caffè', 'https://a.com/caff%C3%A8/menu')).toBe(true);
  });

  it('rejects a path without a leading slash', () => {
    expect(compilePattern({ pattern: 'admin', matchType: 'path' }).ok).toBe(false);
    expect(compilePattern({ pattern: '/a?b', matchType: 'path' }).ok).toBe(false);
  });
});

describe('common validation', () => {
  it('rejects an empty pattern', () => {
    expect(compilePattern({ pattern: '  ', matchType: 'domain' })).toEqual({
      ok: false,
      error: 'empty',
    });
  });

  it('returns false for a URL that is not valid', () => {
    expect(agrees('contains', 'a', 'not a url')).toBe(false);
  });
});

describe('pattern suggestions', () => {
  const href = 'https://www.news.example.co.uk/world/today?x=1';

  it.each<[MatchType, string]>([
    ['domain', 'example.co.uk'],
    ['host', 'www.news.example.co.uk'],
    ['prefix', 'https://www.news.example.co.uk/world/today'],
    ['exact', 'https://www.news.example.co.uk/world/today'],
    ['wildcard', '*://*.example.co.uk/*'],
    ['regex', '^https?://([^/]+\\.)?example\\.co\\.uk/'],
    ['contains', 'example.co.uk'],
    ['path', '/world/today'],
  ])('suggests a %s pattern that agrees with the URL', (matchType, expected) => {
    const pattern = suggestPattern(href, matchType);
    expect(pattern).toBe(expected);
    expect(agrees(matchType, pattern, href)).toBe(true);
  });

  it('returns an empty pattern for a URL that is not valid', () => {
    expect(suggestPattern('nope', 'domain')).toBe('');
  });

  it.each([
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['a.b.example.com', 'example.com'],
    ['www.bbc.co.uk', 'bbc.co.uk'],
    ['news.example.it', 'example.it'],
    ['192.168.1.10', '192.168.1.10'],
    ['[::1]', '[::1]'],
    ['localhost', 'localhost'],
  ])('guesses the domain of %s', (host, expected) => {
    expect(registrableDomainGuess(host)).toBe(expected);
  });
});
