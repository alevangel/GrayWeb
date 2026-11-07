import { toggleSite } from '../shared/config/actions';
import {
  CONFIG_KEY,
  configFromStorage,
  loadConfig,
  saveConfig,
  SYNC_STATUS_KEY,
} from '../shared/config/storage';
import { isSyncKey, pullFromSync, pushToSync } from '../shared/config/sync';
import type {
  BackgroundMessage,
  ContentMessage,
  PauseState,
  TabState,
  TabStatus,
} from '../shared/messages';
import { api } from '../shared/platform/api';
import { RuleEngine } from '../shared/rules/evaluate';
import { isSupportedUrl } from '../shared/rules/url';
import type { Config } from '../shared/types';

const PAUSED_TABS_KEY = 'pausedTabs';
const SESSION_PAUSE_KEY = 'sessionPause';
const SYNC_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Session state. `storage.session` keeps it when the worker stops, and the
// browser clears it at restart (G-02, G-03).
// ---------------------------------------------------------------------------

async function getSession(): Promise<{ tabs: number[]; session: boolean }> {
  const data = await api.storage.session.get([PAUSED_TABS_KEY, SESSION_PAUSE_KEY]);
  return {
    tabs: (data[PAUSED_TABS_KEY] as number[] | undefined) ?? [],
    session: data[SESSION_PAUSE_KEY] === true,
  };
}

async function setTabPaused(tabId: number, paused: boolean): Promise<void> {
  const { tabs } = await getSession();
  const next = paused ? [...new Set([...tabs, tabId])] : tabs.filter((id) => id !== tabId);
  await api.storage.session.set({ [PAUSED_TABS_KEY]: next });
  await sendTabState(tabId);
}

async function setSessionPaused(paused: boolean): Promise<void> {
  await api.storage.session.set({ [SESSION_PAUSE_KEY]: paused });
  const tabs = await api.tabs.query({});
  const ids = tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined);
  await Promise.all(ids.map(sendTabState));
}

async function getTabState(
  tabId: number | undefined,
  topUrl: string | undefined,
): Promise<TabState> {
  const session = await getSession();
  const paused = session.session || (tabId !== undefined && session.tabs.includes(tabId));
  let topGray = false;
  if (!paused && topUrl !== undefined) {
    topGray = new RuleEngine(await loadConfig()).evaluate(topUrl).gray;
  }
  return { paused, topGray };
}

async function sendTabState(tabId: number): Promise<void> {
  const tab = await api.tabs.get(tabId).catch(() => undefined);
  if (tab === undefined) return;
  const message: ContentMessage = { type: 'tabState', state: await getTabState(tabId, tab.url) };
  await api.tabs.sendMessage(tabId, message).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Toolbar icon (G-05). The status has an icon and a text, not only a color.
// ---------------------------------------------------------------------------

const ICON_SIZES = [16, 32, 48] as const;

function iconPaths(variant: 'on' | 'off'): Record<string, string> {
  return Object.fromEntries(ICON_SIZES.map((size) => [size, `icons/${variant}-${size}.png`]));
}

async function showStatus(tabId: number, status: TabStatus): Promise<void> {
  const titleKey = { gray: 'statusGray', off: 'statusOff', paused: 'statusPaused' }[status];
  await Promise.all([
    api.action.setIcon({ tabId, path: iconPaths(status === 'gray' ? 'on' : 'off') }),
    api.action.setBadgeText({ tabId, text: status === 'paused' ? '||' : '' }),
    api.action.setTitle({
      tabId,
      title: `${api.i18n.getMessage('extName')} — ${api.i18n.getMessage(titleKey)}`,
    }),
  ]).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Synchronization with the browser account (C-02, C-03).
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSync(config: Config): void {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void pushToSync(config).then((status) => api.storage.local.set({ [SYNC_STATUS_KEY]: status }));
  }, SYNC_DELAY_MS);
}

async function pullIfNewer(): Promise<void> {
  const remote = await pullFromSync();
  if (remote === null) return;
  const local = await loadConfig();
  if (remote.updatedAt > local.updatedAt) {
    await api.storage.local.set({ [CONFIG_KEY]: remote });
  }
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    const change = changes[CONFIG_KEY];
    if (change !== undefined) scheduleSync(configFromStorage(change.newValue));
  } else if (area === 'sync' && Object.keys(changes).some(isSyncKey)) {
    void pullIfNewer();
  }
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

api.runtime.onInstalled.addListener(() => {
  void (async () => {
    await pullIfNewer();
    const data = await api.storage.local.get(CONFIG_KEY);
    if (data[CONFIG_KEY] === undefined) await saveConfig(await loadConfig());
  })();
});

api.runtime.onStartup.addListener(() => void pullIfNewer());

api.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  const message = raw as BackgroundMessage;
  const tabId = sender.tab?.id;
  switch (message.type) {
    case 'getTabState':
      void getTabState(tabId, sender.frameId === 0 ? undefined : sender.tab?.url).then(
        sendResponse,
      );
      return true;
    case 'reportStatus':
      if (tabId !== undefined && sender.frameId === 0) void showStatus(tabId, message.status);
      return false;
    case 'setTabPause':
      void setTabPaused(message.tabId, message.paused).then(() => sendResponse(true));
      return true;
    case 'setSessionPause':
      void setSessionPaused(message.paused).then(() => sendResponse(true));
      return true;
    case 'getPauseState':
      void getSession().then((session) => {
        const state: PauseState = {
          tab: session.tabs.includes(message.tabId),
          session: session.session,
        };
        sendResponse(state);
      });
      return true;
  }
});

// Single-page applications change the URL with the History API (F-05).
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url === undefined || !isSupportedUrl(changeInfo.url)) return;
  const message: ContentMessage = { type: 'urlChanged' };
  void api.tabs.sendMessage(tabId, message).catch(() => undefined);
});

api.tabs.onRemoved.addListener((tabId) => {
  void getSession().then(({ tabs }) => {
    if (tabs.includes(tabId)) {
      void api.storage.session.set({ [PAUSED_TABS_KEY]: tabs.filter((id) => id !== tabId) });
    }
  });
});

// Keyboard shortcut (G-04).
api.commands.onCommand.addListener((command, commandTab) => {
  if (command !== 'toggle-site') return;
  void (async () => {
    const tab =
      commandTab ?? (await api.tabs.query({ active: true, currentWindow: true }))[0] ?? undefined;
    if (tab?.url === undefined || !isSupportedUrl(tab.url)) return;
    const config = await loadConfig();
    await saveConfig(toggleSite(config, tab.url, 'domain').config);
  })();
});
