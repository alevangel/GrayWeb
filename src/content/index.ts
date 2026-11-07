import { CONFIG_KEY, configFromStorage, onConfigChange } from '../shared/config/storage';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { filterStyleSheet } from '../shared/filter';
import type { BackgroundMessage, ContentMessage, TabState, TabStatus } from '../shared/messages';
import { api } from '../shared/platform/api';
import { RuleEngine } from '../shared/rules/evaluate';
import type { Config, FilterSettings } from '../shared/types';

const isTopFrame = window === window.top;
const STYLE_ID = 'grayweb-filter';

let engine: RuleEngine | null = null;
let pausedUntil = 0;
let tabState: TabState | null = null;
let preview: FilterSettings | null = null;
let lastHref = location.href;
let lastStatus: TabStatus | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const style = document.createElement('style');
style.id = STYLE_ID;

function mountStyle(): void {
  const root = document.documentElement;
  // `document.open()` can replace the root element. Put the style back in that case.
  if (style.parentNode !== root) root.append(style);
}

function setStyle(css: string): void {
  if (style.textContent !== css) style.textContent = css;
  if (css === '') style.remove();
  else mountStyle();
}

function report(status: TabStatus): void {
  if (!isTopFrame || status === lastStatus) return;
  lastStatus = status;
  const message: BackgroundMessage = { type: 'reportStatus', status };
  api.runtime.sendMessage(message).catch(() => undefined);
}

function scheduleNextCheck(): void {
  clearTimeout(timer);
  if (engine === null) return;
  const now = Date.now();
  let delay = Infinity;
  if (pausedUntil > now) delay = pausedUntil - now + 50;
  if (engine.hasSchedules) {
    const nextMinute = 60_000 - (now % 60_000) + 50;
    delay = Math.min(delay, nextMinute);
  }
  if (delay !== Infinity) timer = setTimeout(apply, delay);
}

function apply(): void {
  if (engine === null) return;
  // Frames wait for the tab state, so they do not add a filter on top of a gray page.
  if (!isTopFrame && tabState === null) return;

  const decision = engine.evaluate(location.href);
  const paused = tabState?.paused === true || decision.reason === 'paused';
  const coveredByTop = !isTopFrame && tabState?.topGray === true;
  const gray = decision.gray && !paused && !coveredByTop;

  setStyle(gray ? filterStyleSheet(preview ?? decision.settings ?? DEFAULT_SETTINGS) : '');

  const pausedGray = decision.reason === 'paused' || (tabState?.paused === true && decision.gray);
  report(gray ? 'gray' : pausedGray ? 'paused' : 'off');
  scheduleNextCheck();
}

function useConfig(config: Config): void {
  engine = new RuleEngine(config);
  pausedUntil = config.pausedUntil;
  preview = null;
  apply();
}

function onUrlMaybeChanged(): void {
  if (location.href === lastHref) return;
  lastHref = location.href;
  apply();
}

function requestTabState(): void {
  const message: BackgroundMessage = { type: 'getTabState' };
  api.runtime
    .sendMessage(message)
    .then((state: TabState | undefined) => {
      tabState = state ?? { paused: false, topGray: false };
      apply();
    })
    .catch(() => {
      tabState = { paused: false, topGray: false };
      apply();
    });
}

function start(): void {
  // Read the configuration first: this is the fastest path to the filter (F-02).
  api.storage.local
    .get(CONFIG_KEY)
    .then((data) => useConfig(configFromStorage(data[CONFIG_KEY])))
    .catch(() => undefined);
  requestTabState();

  onConfigChange((config) => {
    useConfig(config);
    // The top frame can change from gray to color. Frames must know it.
    if (!isTopFrame) requestTabState();
  });

  api.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ContentMessage;
    switch (message.type) {
      case 'tabState':
        tabState = message.state;
        apply();
        break;
      case 'urlChanged':
        onUrlMaybeChanged();
        if (!isTopFrame) requestTabState();
        break;
      case 'preview':
        preview = message.settings;
        apply();
        break;
    }
    return undefined;
  });

  // Single-page applications change the URL without a new page (F-05).
  window.addEventListener('popstate', onUrlMaybeChanged);
  window.addEventListener('hashchange', onUrlMaybeChanged);
  const navigation = (window as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('navigatesuccess', onUrlMaybeChanged);
}

start();
