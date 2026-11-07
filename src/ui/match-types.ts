import type { MatchType } from '../shared/types';

export interface MatchTypeInfo {
  /** Message key of the name. */
  label: string;
  /** Message key of the help text. */
  help: string;
  example: string;
}

export const MATCH_TYPE_INFO: Record<MatchType, MatchTypeInfo> = {
  domain: { label: 'matchDomain', help: 'matchDomainHelp', example: 'example.com' },
  host: { label: 'matchHost', help: 'matchHostHelp', example: 'www.example.com' },
  prefix: {
    label: 'matchPrefix',
    help: 'matchPrefixHelp',
    example: 'https://example.com/news',
  },
  exact: {
    label: 'matchExact',
    help: 'matchExactHelp',
    example: 'https://example.com/page',
  },
  wildcard: {
    label: 'matchWildcard',
    help: 'matchWildcardHelp',
    example: '*.example.*/video/*',
  },
  regex: {
    label: 'matchRegex',
    help: 'matchRegexHelp',
    example: '^https://(www\\.)?example\\.com/(watch|shorts)',
  },
  contains: { label: 'matchContains', help: 'matchContainsHelp', example: 'casino' },
  path: { label: 'matchPath', help: 'matchPathHelp', example: '/admin' },
};

/** The match types that the popup offers for a new rule. */
export const POPUP_MATCH_TYPES: MatchType[] = ['domain', 'host', 'prefix', 'exact'];
