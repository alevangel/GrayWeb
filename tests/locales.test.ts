import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATCH_TYPES } from '../src/shared/types';

type Messages = Record<string, { message: string; description?: string }>;

const ROOT = join(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, 'static', '_locales');

function readLocale(lang: string): Messages {
  return JSON.parse(readFileSync(join(LOCALES_DIR, lang, 'messages.json'), 'utf8')) as Messages;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|html)$/.test(name) ? [path] : [];
  });
}

/** Finds the message keys that the code uses with a literal text. */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  const patterns = [
    /\bt\(\s*'([A-Za-z0-9_]+)'/g,
    /data-i18n="([A-Za-z0-9_]+)"/g,
    /__MSG_([A-Za-z0-9_]+)__/g,
  ];
  for (const file of [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'scripts', 'build.mjs')]) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) keys.add(match[1] ?? '');
    }
    for (const match of text.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of (match[1] ?? '').split(',')) keys.add(pair.split(':')[1]?.trim() ?? '');
    }
  }
  return keys;
}

const languages = readdirSync(LOCALES_DIR);
const english = readLocale('en');

describe('translations (L-01, L-04, L-06)', () => {
  it('has English and Italian', () => {
    expect(languages.sort()).toEqual(['en', 'it']);
  });

  it.each(languages)('%s has the same keys as English', (lang) => {
    expect(Object.keys(readLocale(lang)).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(languages)('%s uses the same placeholders as English', (lang) => {
    const messages = readLocale(lang);
    for (const [key, value] of Object.entries(english)) {
      const placeholders = (text: string) => (text.match(/\$\d/g) ?? []).sort();
      expect(placeholders(messages[key]?.message ?? ''), key).toEqual(placeholders(value.message));
    }
  });

  it.each(languages)('%s has no empty message', (lang) => {
    for (const [key, value] of Object.entries(readLocale(lang))) {
      expect(value.message.trim(), key).not.toBe('');
    }
  });

  it('contains every key that the code uses', () => {
    const missing = [...usedKeys()].filter((key) => !(key in english));
    expect(missing).toEqual([]);
  });

  it('contains the keys that the code builds at run time', () => {
    const dynamic = [
      ...MATCH_TYPES.flatMap((type) => {
        const name = type.charAt(0).toUpperCase() + type.slice(1);
        return [`match${name}`, `match${name}Help`];
      }),
      ...['empty', 'tooLong', 'invalidHost', 'invalidUrl', 'invalidPath', 'invalidRegex'].map(
        (error) => `error_${error}`,
      ),
      ...['intensity', 'contrast', 'brightness'].map((key) => `setting_${key}`),
      ...['soft', 'medium', 'full', 'dim'].map((key) => `preset_${key}`),
      ...['popupRuleGray', 'popupRuleSkip', 'popupMakeGray', 'popupRemoveGray'],
      ...['popupIntensitySite', 'popupIntensityAll', 'popupPauseTab', 'popupResumeTab'],
      ...['testResultGray', 'testResultColor', 'testByMode', 'testNoRule'],
      ...['modeNoteAll', 'modeNoteListed', 'editorNewTitle', 'editorEditTitle'],
      ...['editorAgrees', 'editorDoesNotAgree', 'saveAnyway', 'stateOn', 'stateOff'],
      ...['statusGray', 'statusOff', 'statusPaused', 'statusDisabled', 'statusUnsupported'],
      ...['syncOk', 'syncQuota', 'syncUnavailable', 'syncPending'],
    ];
    expect(dynamic.filter((key) => !(key in english))).toEqual([]);
  });

  it('keeps the store description short enough for the stores', () => {
    for (const lang of languages) {
      expect(readLocale(lang).extDescription?.message.length).toBeLessThanOrEqual(132);
    }
  });
});
