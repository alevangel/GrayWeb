import type { FilterSettings } from './types';

export type TabStatus = 'gray' | 'off' | 'paused';

/** Messages from content scripts and extension pages to the background worker. */
export type BackgroundMessage =
  | { type: 'getTabState' }
  | { type: 'reportStatus'; status: TabStatus }
  | { type: 'setTabPause'; tabId: number; paused: boolean }
  | { type: 'setSessionPause'; paused: boolean }
  | { type: 'getPauseState'; tabId: number };

export interface TabState {
  /** True when the tab or the browser session is paused. */
  paused: boolean;
  /** True when the top frame of the tab is gray. Frames use it to prevent a double filter. */
  topGray: boolean;
}

export interface PauseState {
  tab: boolean;
  session: boolean;
}

/** Messages from the background worker or the popup to content scripts. */
export type ContentMessage =
  | { type: 'tabState'; state: TabState }
  | { type: 'urlChanged' }
  | { type: 'preview'; settings: FilterSettings | null };
