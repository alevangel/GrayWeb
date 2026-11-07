import { initI18n, localizePage } from '../shared/i18n';
import { api } from '../shared/platform/api';
import { byId } from '../ui/dom';
import { initEditor } from './editor';
import { initRules } from './rules';
import { initAppearance, initBackup, initGeneral } from './sections';
import { store } from './store';

const SECTIONS = ['rules', 'appearance', 'general', 'backup', 'about'] as const;
type Section = (typeof SECTIONS)[number];

function showSection(name: Section, focus: boolean): void {
  for (const section of SECTIONS) {
    byId(`section-${section}`).hidden = section !== name;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-section]')) {
    if (link.dataset.section === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (focus) byId('main').focus();
}

function currentSection(): Section {
  const hash = location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as Section) : 'rules';
}

async function main(): Promise<void> {
  const config = await store.load();
  await initI18n(config.language);
  localizePage();

  byId('version').textContent = `v${api.runtime.getManifest().version}`;

  initEditor();
  initRules();
  initAppearance();
  initGeneral();
  initBackup();

  showSection(currentSection(), false);
  window.addEventListener('hashchange', () => showSection(currentSection(), true));
}

void main();
