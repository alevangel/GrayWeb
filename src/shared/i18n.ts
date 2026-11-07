import { api } from './platform/api';
import type { Language } from './types';

type Messages = Record<string, { message: string } | undefined>;

export const SUPPORTED_LANGUAGES = ['en', 'it'] as const;
export type UiLanguage = (typeof SUPPORTED_LANGUAGES)[number];

let messages: Messages | null = null;
let fallback: Messages | null = null;
let currentLanguage: UiLanguage = 'en';

function browserLanguage(): UiLanguage {
  const ui = api.i18n.getUILanguage().toLowerCase();
  return SUPPORTED_LANGUAGES.find((lang) => ui.startsWith(lang)) ?? 'en';
}

async function loadMessages(lang: UiLanguage): Promise<Messages> {
  const response = await fetch(api.runtime.getURL(`_locales/${lang}/messages.json`));
  return (await response.json()) as Messages;
}

/**
 * Prepares the translations. With "auto", GrayWeb uses the browser language (L-02).
 * With a selected language (L-03), it loads the translation file of that language.
 */
export async function initI18n(language: Language): Promise<void> {
  if (language === 'auto') {
    messages = null;
    fallback = null;
    currentLanguage = browserLanguage();
  } else {
    currentLanguage = language;
    [messages, fallback] = await Promise.all([loadMessages(language), loadMessages('en')]);
  }
  document.documentElement.lang = currentLanguage;
}

export function getLanguage(): UiLanguage {
  return currentLanguage;
}

function substitute(text: string, values: readonly (string | number)[]): string {
  return text.replace(/\$(\d)/g, (match, digit: string) => {
    const value = values[Number(digit) - 1];
    return value === undefined ? match : String(value);
  });
}

/** Returns the translated text for a key. */
export function t(key: string, ...values: (string | number)[]): string {
  if (messages !== null) {
    const entry = messages[key] ?? fallback?.[key];
    if (entry !== undefined) return substitute(entry.message, values);
  }
  const text = api.i18n.getMessage(key, values.map(String));
  return text === '' ? key : text;
}

/**
 * Translates the static text of a page.
 * - `data-i18n` holds the message key for the text content.
 * - `data-i18n-attr` holds "attribute:key" pairs, separated by commas.
 */
export function localizePage(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (key !== undefined) element.textContent = t(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (element.dataset.i18nAttr ?? '').split(',')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute !== undefined && key !== undefined) element.setAttribute(attribute, t(key));
    }
  }
}
