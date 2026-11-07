import { ConfigError, mergeConfigs, parseConfig } from '../shared/config/schema';
import { SYNC_STATUS_KEY, type SyncStatus } from '../shared/config/storage';
import { BUILT_IN_PRESETS, createDefaultConfig, DEFAULT_SETTINGS } from '../shared/defaults';
import { filterValue } from '../shared/filter';
import { createId } from '../shared/config/schema';
import { t } from '../shared/i18n';
import { api } from '../shared/platform/api';
import type { Config, FilterSettings, Language, OperationMode, Preset } from '../shared/types';
import {
  createSettingsSliders,
  createSwitch,
  iconButton,
  setSwitch,
  showToast,
} from '../ui/components';
import { byId, h, show } from '../ui/dom';
import { store } from './store';

// ---------------------------------------------------------------------------
// Appearance (S-01 … S-09)
// ---------------------------------------------------------------------------

function presetName(preset: Preset): string {
  return preset.id.startsWith('builtin-') ? t(`preset_${preset.id.slice(8)}`) : preset.name;
}

function sameSettings(a: FilterSettings, b: FilterSettings): boolean {
  return a.intensity === b.intensity && a.contrast === b.contrast && a.brightness === b.brightness;
}

export function initAppearance(): void {
  const preview = byId('preview');
  const showPreview = (settings: FilterSettings): void => {
    preview.style.filter = filterValue(settings);
  };
  const saveGlobal = (global: FilterSettings): Promise<void> =>
    store.update((config) => ({ ...config, global }));

  const sliders = createSettingsSliders({
    onInput: showPreview,
    onChange: (settings) => void saveGlobal(settings),
  });
  byId('global-sliders').append(sliders.element);
  byId('global-reset').addEventListener('click', () => void saveGlobal({ ...DEFAULT_SETTINGS }));

  byId('preset-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = byId<HTMLInputElement>('preset-name');
    const name = input.value.trim();
    if (name === '') return;
    const preset: Preset = { id: createId(), name, settings: { ...store.config.global } };
    input.value = '';
    void store.update((config) => ({ ...config, presets: [...config.presets, preset] }));
  });

  const render = (config: Config): void => {
    sliders.set(config.global);
    showPreview(config.global);
    show(byId('global-reset'), !sameSettings(config.global, DEFAULT_SETTINGS));

    const list = byId('preset-list');
    list.replaceChildren(
      ...[...BUILT_IN_PRESETS, ...config.presets].map((preset) => {
        const active = sameSettings(preset.settings, config.global);
        const apply = h(
          'button',
          { type: 'button', class: 'btn btn-sm' },
          presetName(preset),
          h('span', { class: 'preset-value' }, `${preset.settings.intensity}%`),
        );
        apply.setAttribute('aria-pressed', String(active));
        apply.addEventListener('click', () => void saveGlobal({ ...preset.settings }));
        const item = h('li', { class: 'preset' }, apply);
        if (!preset.id.startsWith('builtin-')) {
          item.append(
            iconButton('close', t('presetsDelete', preset.name), () => {
              void store.update((c) => ({
                ...c,
                presets: c.presets.filter((p) => p.id !== preset.id),
              }));
            }),
          );
        }
        return item;
      }),
    );
  };
  store.subscribe(render);
  render(store.config);
}

// ---------------------------------------------------------------------------
// General (G-01, R-01, L-03, G-04)
// ---------------------------------------------------------------------------

export function initGeneral(): void {
  const enabled = createSwitch(t('generalEnabled'), store.config.enabled, (value) => {
    void store.update((config) => ({ ...config, enabled: value }));
  });
  byId('enabled-slot').replaceWith(enabled);

  const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="mode"]')];
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      void store.update((config) => ({ ...config, mode: radio.value as OperationMode }));
    });
  }

  const language = byId<HTMLSelectElement>('language');
  language.addEventListener('change', () => {
    void store
      .update((config) => ({ ...config, language: language.value as Language }))
      .then(() => location.reload());
  });

  void api.commands.getAll().then((commands) => {
    const shortcut = commands.find((command) => command.name === 'toggle-site')?.shortcut;
    byId('shortcut-text').textContent =
      shortcut !== undefined && shortcut !== ''
        ? t('generalShortcutValue', shortcut)
        : t('generalShortcutNone');
  });
  // Chromium has a page for shortcuts. Firefox has it in the add-ons manager.
  const isFirefox = api.runtime.getURL('').startsWith('moz-extension:');
  const change = byId('shortcut-change');
  show(change, !isFirefox);
  if (isFirefox) byId('shortcut-text').append(' ', t('generalShortcutFirefox'));
  change.addEventListener('click', () => {
    void api.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  const render = (config: Config): void => {
    setSwitch(enabled, config.enabled);
    for (const radio of radios) radio.checked = radio.value === config.mode;
    language.value = config.language;
  };
  store.subscribe(render);
  render(store.config);
}

// ---------------------------------------------------------------------------
// Backup (C-01 … C-08)
// ---------------------------------------------------------------------------

function confirmDialog(title: string, text: string, action: string): Promise<boolean> {
  const dialog = byId<HTMLDialogElement>('confirm-dialog');
  byId('confirm-title').textContent = title;
  byId('confirm-text').textContent = text;
  byId('confirm-ok').textContent = action;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    });
  });
}

function exportConfig(config: Config): void {
  const { pausedUntil: _pausedUntil, ...data } = config;
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = h('a', { href: url, download: `grayweb-${date}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file: File): Promise<void> {
  const error = byId('import-error');
  show(error, false);
  let imported: Config;
  try {
    imported = parseConfig(JSON.parse(await file.text()));
  } catch (cause) {
    error.textContent =
      cause instanceof ConfigError
        ? t('importInvalid', cause.message)
        : t('importInvalid', t('importNotJson'));
    show(error, true);
    return;
  }

  const dialog = byId<HTMLDialogElement>('import-dialog');
  byId('import-summary').textContent = t(
    'importSummary',
    imported.rules.length,
    imported.presets.length,
  );
  dialog.returnValue = '';
  dialog.showModal();
  dialog.addEventListener(
    'close',
    () => {
      const choice = dialog.returnValue;
      if (choice === 'replace') {
        void store.save({ ...imported, pausedUntil: 0 });
      } else if (choice === 'merge') {
        void store.update((config) => mergeConfigs(config, imported));
      } else {
        return;
      }
      showToast(t('importDone'));
    },
    { once: true },
  );
}

export function initBackup(): void {
  byId('export').addEventListener('click', () => exportConfig(store.config));

  const fileInput = byId<HTMLInputElement>('import-file');
  byId('import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file !== undefined) void importFile(file);
  });

  byId('reset').addEventListener('click', () => {
    void confirmDialog(t('resetTitle'), t('resetConfirm'), t('resetButton')).then((ok) => {
      if (!ok) return;
      const { language } = store.config;
      void store.save({ ...createDefaultConfig(), language });
      showToast(t('resetDone'));
    });
  });

  const syncStatus = byId('sync-status');
  const renderSync = (status: SyncStatus | undefined): void => {
    const key = { ok: 'syncOk', quota: 'syncQuota', unavailable: 'syncUnavailable' };
    syncStatus.textContent = t(status === undefined ? 'syncPending' : key[status]);
  };
  void api.storage.local.get(SYNC_STATUS_KEY).then((data) => {
    renderSync(data[SYNC_STATUS_KEY] as SyncStatus | undefined);
  });
  api.storage.onChanged.addListener((changes, area) => {
    const change = changes[SYNC_STATUS_KEY];
    if (area === 'local' && change !== undefined) renderSync(change.newValue as SyncStatus);
  });
}
