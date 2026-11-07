/** Maximum URL length that GrayWeb compares. Longer URLs are cut. */
export const MAX_URL_LENGTH = 2048;

export interface ParsedUrl {
  /** Normalized full URL (lowercase scheme and host, Punycode host). */
  href: string;
  /** `href` without the scheme and `//`. */
  hrefNoScheme: string;
  /** Lowercase Punycode host name, without port. */
  host: string;
  pathname: string;
  /** Scheme, host, port and path. No query and no fragment. */
  base: string;
}

export function parseUrl(input: string): ParsedUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const href = url.href.slice(0, MAX_URL_LENGTH);
  return {
    href,
    hrefNoScheme: href.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''),
    host: url.hostname.toLowerCase(),
    pathname: url.pathname,
    base: `${url.origin}${url.pathname}`,
  };
}

/**
 * Converts user input to a lowercase Punycode host name.
 * Accepts a bare host ("Example.com"), a host with a leading "*." or ".",
 * or a full URL ("https://www.example.com/path").
 */
export function normalizeHost(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (value === '') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/^\*\./, '').replace(/^\./, '').replace(/\.$/, '');
  if (value === '' || /[/\s?#@*]/.test(value)) return null;
  try {
    const host = new URL(`http://${value}`).hostname;
    return host === '' ? null : host;
  } catch {
    return null;
  }
}

/** Removes a trailing slash from a path, except for the root path "/". */
export function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Returns true for URLs that GrayWeb can change. */
export function isSupportedUrl(input: string | undefined): boolean {
  if (input === undefined) return false;
  return /^(https?|file):/i.test(input);
}
