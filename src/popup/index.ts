import { toggleSite } from '../shared/config/actions';
import { loadConfig, onConfigChange, saveConfig } from '../shared/config/storage';
import { getLanguage, initI18n, localizePage, t } from '../shared/i18n';
import type { BackgroundMessage, ContentMessage, PauseState } from '../shared/messages';
import { api } from '../shared/platform/api';
import { RuleEngine } from '../shared/rules/evaluate';
import { isSupportedUrl, parseUrl } from '../shared/rules/url';
import type { Config, FilterSettings } from '../shared/types';
import { createSwitch, setSwitch } from '../ui/components';
import { byId, show, throttle } from '../ui/dom';

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
  let config = await loadConfig();
  await initI18n(config.language);
  localizePage();

  const tabId = tab?.id;
  const href = tab?.url;
  const url = href === undefined ? null : parseUrl(href);
  const supported = href !== undefined && url !== null && isSupportedUrl(href);
  let tabPaused =
    tabId === undefined
      ? false
      : (await send<PauseState>({ type: 'getPauseState', tabId }).catch(() => ({ tab: false })))
          .tab;

  // The popup works on the rules only. The pause and the main switch have their own controls.
  const evaluate = () =>
    supported ? new RuleEngine({ ...config, enabled: true, pausedUntil: 0 }).evaluate(href) : null;

  async function save(next: Config): Promise<void> {
    config = await saveConfig(next);
    render();
  }

  const siteSwitch = createSwitch(t('popupSiteSwitch'), false, () => {
    if (supported) void save(toggleSite(config, href, 'domain').config);
  });
  byId('site-switch-slot').replaceWith(siteSwitch);
  siteSwitch.disabled = !supported;

  const slider = byId<HTMLInputElement>('intensity-input');
  const sliderValue = byId<HTMLOutputElement>('intensity-value');
  const settingsWith = (intensity: number): FilterSettings => ({
    ...(evaluate()?.settings ?? config.global),
    intensity,
  });
  const preview = throttle((settings: FilterSettings) => {
    if (tabId === undefined) return;
    const message: ContentMessage = { type: 'preview', settings };
    void api.tabs.sendMessage(tabId, message).catch(() => undefined);
  }, 50);
  slider.addEventListener('input', () => {
    sliderValue.value = `${slider.value}%`;
    slider.style.setProperty('--fill', `${slider.value}%`);
    preview(settingsWith(Number(slider.value)));
  });
  slider.addEventListener('change', () => {
    const settings = settingsWith(Number(slider.value));
    const rule = evaluate()?.rule;
    if (rule?.action === 'gray') {
      const rules = config.rules.map((r) => (r.id === rule.id ? { ...r, settings } : r));
      void save({ ...config, rules });
    } else {
      void save({ ...config, global: settings });
    }
  });

  for (const button of byId('pause').querySelectorAll<HTMLButtonElement>('[data-pause]')) {
    button.addEventListener('click', () => {
      const value = button.dataset.pause;
      if (value === 'tab') {
        if (tabId === undefined) return;
        void send({ type: 'setTabPause', tabId, paused: true }).then(() => {
          tabPaused = true;
          render();
        });
      } else {
        void save({ ...config, pausedUntil: Date.now() + Number(value) * 60_000 });
      }
    });
  }

  byId('state-action').addEventListener('click', () => {
    void (async () => {
      if (tabPaused && tabId !== undefined) {
        await send({ type: 'setTabPause', tabId, paused: false });
        tabPaused = false;
      }
      await save({ ...config, enabled: true, pausedUntil: 0 });
    })();
  });

  byId('open-settings').addEventListener('click', () => {
    void api.runtime.openOptionsPage().then(() => window.close());
  });

  function render(): void {
    byId('site-host').textContent = supported ? url.host || t('popupLocalFile') : t('popupNoPage');

    const decision = evaluate();
    const gray = decision?.gray === true;
    setSwitch(siteSwitch, gray);

    show(byId('intensity'), gray);
    if (gray) {
      const intensity = (decision.settings ?? config.global).intensity;
      slider.value = String(intensity);
      slider.style.setProperty('--fill', `${intensity}%`);
      sliderValue.value = `${intensity}%`;
    }

    // One line at the bottom: the pause options, or the state that stops GrayWeb.
    let stateText: string | null = null;
    let stateAction = t('resume');
    if (!config.enabled) [stateText, stateAction] = [t('stateDisabled'), t('turnOn')];
    else if (config.pausedUntil > Date.now()) {
      stateText = t('statePausedUntil', formatTime(config.pausedUntil));
    } else if (tabPaused) stateText = t('statePausedTab');
    else if (!supported) stateText = t('stateUnsupported');

    show(byId('pause'), stateText === null);
    show(byId('state'), stateText !== null);
    byId('state-text').textContent = stateText ?? '';
    byId('state-action').textContent = stateAction;
    show(byId('state-action'), supported || !config.enabled);

    const popup = document.querySelector<HTMLElement>('.popup');
    if (popup !== null) popup.dataset.inactive = String(stateText !== null);
  }

  onConfigChange((next) => {
    config = next;
    render();
  });
  render();
}

void main();
