import { toggleSite } from '../shared/config/actions';
import { loadConfig, onConfigChange, saveConfig } from '../shared/config/storage';
import { getLanguage, initI18n, localizePage, t } from '../shared/i18n';
import type { BackgroundMessage, ContentMessage, PauseState, TabStatus } from '../shared/messages';
import { api } from '../shared/platform/api';
import { RuleEngine } from '../shared/rules/evaluate';
import { isSupportedUrl, parseUrl } from '../shared/rules/url';
import { MATCH_TYPES, type Config, type FilterSettings, type MatchType } from '../shared/types';
import { createSettingsSliders, createSwitch, setSwitch, showToast } from '../ui/components';
import { byId, h, show, throttle } from '../ui/dom';
import { MATCH_TYPE_INFO, POPUP_MATCH_TYPES } from '../ui/match-types';

const MATCH_TYPE_STORAGE = 'grayweb.popupMatchType';

interface State {
  config: Config;
  tabId: number | undefined;
  href: string | undefined;
  pause: PauseState;
  matchType: MatchType;
}

function readMatchType(): MatchType {
  try {
    const value = localStorage.getItem(MATCH_TYPE_STORAGE);
    if (value !== null && (MATCH_TYPES as readonly string[]).includes(value)) {
      return value as MatchType;
    }
  } catch {
    // Storage can be blocked. The default is correct in that case.
  }
  return 'domain';
}

function writeMatchType(value: MatchType): void {
  try {
    localStorage.setItem(MATCH_TYPE_STORAGE, value);
  } catch {
    // Not important: the popup uses the default next time.
  }
}

async function send<T>(message: BackgroundMessage): Promise<T> {
  const response: T = await api.runtime.sendMessage(message);
  return response;
}

function formatTime(epoch: number): string {
  return new Intl.DateTimeFormat(getLanguage(), { hour: '2-digit', minute: '2-digit' }).format(
    epoch,
  );
}

async function main(): Promise<void> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const config = await loadConfig();
  await initI18n(config.language);
  localizePage();

  const state: State = {
    config,
    tabId: tab?.id,
    href: tab?.url,
    pause: { tab: false, session: false },
    matchType: readMatchType(),
  };
  if (state.tabId !== undefined) {
    state.pause = await send<PauseState>({ type: 'getPauseState', tabId: state.tabId }).catch(
      () => state.pause,
    );
  }

  const root = document.querySelector<HTMLElement>('.popup');
  const globalSwitch = createSwitch(t('popupGlobalSwitch'), config.enabled, (enabled) => {
    void save({ ...state.config, enabled });
  });
  byId('global-switch-slot').replaceWith(globalSwitch);

  const matchSelect = byId<HTMLSelectElement>('match-type');
  for (const type of POPUP_MATCH_TYPES) {
    matchSelect.append(h('option', { value: type }, t(MATCH_TYPE_INFO[type].label)));
  }
  matchSelect.value = state.matchType;
  matchSelect.addEventListener('change', () => {
    state.matchType = matchSelect.value as MatchType;
    writeMatchType(state.matchType);
    render();
  });

  const preview = throttle((settings: FilterSettings) => {
    if (state.tabId === undefined) return;
    const message: ContentMessage = { type: 'preview', settings };
    void api.tabs.sendMessage(state.tabId, message).catch(() => undefined);
  }, 50);

  const sliders = createSettingsSliders({
    keys: ['intensity'],
    onInput: (settings) => preview(mergeSettings(settings)),
    onChange: (settings) => void saveSiteSettings(mergeSettings(settings)),
  });
  byId('intensity-slot').append(sliders.element);

  function mergeSettings(partial: FilterSettings): FilterSettings {
    return { ...currentSettings(), intensity: partial.intensity };
  }

  function rulesOnly(): RuleEngine {
    return new RuleEngine({ ...state.config, enabled: true, pausedUntil: 0 });
  }

  function currentSettings(): FilterSettings {
    if (state.href === undefined) return state.config.global;
    const decision = rulesOnly().evaluate(state.href);
    return decision.settings ?? state.config.global;
  }

  async function save(next: Config): Promise<void> {
    state.config = await saveConfig(next);
    render();
  }

  async function saveSiteSettings(settings: FilterSettings): Promise<void> {
    if (state.href === undefined) return;
    const rule = rulesOnly().findRule(state.href);
    if (rule !== undefined && rule.action === 'gray') {
      const rules = state.config.rules.map((r) => (r.id === rule.id ? { ...r, settings } : r));
      await save({ ...state.config, rules });
    } else {
      await save({ ...state.config, global: settings });
    }
  }

  byId('reset-site').addEventListener('click', () => {
    if (state.href === undefined) return;
    const rule = rulesOnly().findRule(state.href);
    if (rule === undefined) return;
    const rules = state.config.rules.map((r) => {
      if (r.id !== rule.id) return r;
      const { settings: _removed, ...rest } = r;
      return rest;
    });
    void save({ ...state.config, rules });
  });

  byId('toggle-site').addEventListener('click', () => {
    if (state.href === undefined || !isSupportedUrl(state.href)) return;
    const previous = state.config;
    const result = toggleSite(previous, state.href, state.matchType);
    void save(result.config).then(() => {
      if (result.removed !== undefined) {
        showToast(t('toastRuleRemoved'), {
          label: t('undo'),
          run: () => void save({ ...state.config, rules: previous.rules }),
        });
      }
    });
  });

  byId('pause-tab').addEventListener('click', () => {
    if (state.tabId === undefined) return;
    const paused = !state.pause.tab;
    void send({ type: 'setTabPause', tabId: state.tabId, paused }).then(() => {
      state.pause = { ...state.pause, tab: paused };
      render();
    });
  });

  for (const button of byId('pause-all').querySelectorAll<HTMLButtonElement>('button')) {
    button.addEventListener('click', () => {
      const value = button.dataset.minutes;
      if (value === 'session') {
        const paused = !state.pause.session;
        void send({ type: 'setSessionPause', paused }).then(() => {
          state.pause = { ...state.pause, session: paused };
          render();
        });
        return;
      }
      const minutes = Number(value);
      const active = button.getAttribute('aria-pressed') === 'true';
      void save({ ...state.config, pausedUntil: active ? 0 : Date.now() + minutes * 60_000 });
    });
  }

  byId('open-settings').addEventListener('click', () => {
    void api.runtime.openOptionsPage().then(() => window.close());
  });

  void api.commands.getAll().then((commands) => {
    const shortcut = commands.find((command) => command.name === 'toggle-site')?.shortcut;
    if (shortcut !== undefined && shortcut !== '') {
      byId('shortcut-hint').textContent = t('popupShortcut', shortcut);
    }
  });

  function render(): void {
    const { config, href } = state;
    const supported = isSupportedUrl(href);
    const url = href === undefined ? null : parseUrl(href);
    const now = Date.now();
    const timedPause = config.pausedUntil > now;

    if (root !== null) root.dataset.disabled = String(!config.enabled);
    setSwitch(globalSwitch, config.enabled);
    byId('global-state').textContent = t(config.enabled ? 'stateOn' : 'stateOff');

    byId('site-host').textContent =
      !supported || url === null
        ? t('popupNoPage')
        : url.host === ''
          ? t('popupLocalFile')
          : url.host;
    show(byId('unsupported'), !supported && href !== undefined);
    show(byId('site-actions'), supported);

    const decision = supported && href !== undefined ? rulesOnly().evaluate(href) : null;
    const wouldBeGray = decision?.gray === true;
    const paused = state.pause.tab || state.pause.session || timedPause;

    let status: TabStatus = 'off';
    let statusKey = 'statusOff';
    if (!supported) statusKey = 'statusUnsupported';
    else if (!config.enabled) statusKey = 'statusDisabled';
    else if (wouldBeGray && paused) [status, statusKey] = ['paused', 'statusPaused'];
    else if (wouldBeGray) [status, statusKey] = ['gray', 'statusGray'];
    const pill = byId('site-status');
    pill.dataset.status = status;
    pill.textContent = t(statusKey);

    const rule = decision?.rule;
    const ruleLine = byId('site-rule');
    if (rule !== undefined) {
      const kind = t(rule.action === 'gray' ? 'popupRuleGray' : 'popupRuleSkip');
      ruleLine.textContent = `${kind}: ${t(MATCH_TYPE_INFO[rule.matchType].label)} · ${rule.label ?? rule.pattern}`;
      ruleLine.title = rule.pattern;
    } else {
      ruleLine.textContent = decision?.reason === 'allSites' ? t('popupAllSitesMode') : '';
      ruleLine.removeAttribute('title');
    }

    byId('toggle-site').textContent = t(wouldBeGray ? 'popupRemoveGray' : 'popupMakeGray');

    show(byId('intensity-block'), wouldBeGray);
    if (decision?.gray === true) {
      const siteScope = rule !== undefined;
      byId('intensity-title').textContent = t(
        siteScope ? 'popupIntensitySite' : 'popupIntensityAll',
      );
      sliders.set(decision.settings ?? config.global);
      show(byId('reset-site'), rule?.settings !== undefined);
    }

    const pauseTab = byId('pause-tab');
    pauseTab.setAttribute('aria-pressed', String(state.pause.tab));
    pauseTab.textContent = t(state.pause.tab ? 'popupResumeTab' : 'popupPauseTab');
    pauseTab.toggleAttribute('disabled', state.tabId === undefined || !supported);

    // A timed pause shows as the shortest button that contains the remaining time.
    const remaining = config.pausedUntil - now;
    for (const button of byId('pause-all').querySelectorAll<HTMLButtonElement>('button')) {
      const value = button.dataset.minutes;
      let pressed: boolean;
      if (value === 'session') pressed = state.pause.session;
      else if (value === '15') pressed = timedPause && remaining <= 15 * 60_000;
      else pressed = timedPause && remaining > 15 * 60_000;
      button.setAttribute('aria-pressed', String(pressed));
    }

    const info = byId('pause-info');
    if (state.pause.session) info.textContent = t('pauseInfoSession');
    else if (timedPause) info.textContent = t('pauseInfoUntil', formatTime(config.pausedUntil));
    else if (state.pause.tab) info.textContent = t('pauseInfoTab');
    else info.textContent = '';
  }

  onConfigChange((next) => {
    state.config = next;
    render();
  });
  render();
}

void main();
