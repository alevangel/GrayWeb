import { findDuplicate, upsertRule } from '../shared/config/actions';
import { createId } from '../shared/config/schema';
import { getLanguage, t } from '../shared/i18n';
import { api } from '../shared/platform/api';
import { compilePattern, type Matcher } from '../shared/rules/match';
import { isSupportedUrl, parseUrl } from '../shared/rules/url';
import { MATCH_TYPES, type MatchType, type Rule, type RuleAction } from '../shared/types';
import { createSettingsSliders, type SettingsSliders } from '../ui/components';
import { byId, h, show } from '../ui/dom';
import { MATCH_TYPE_INFO } from '../ui/match-types';
import { checkRegexSpeed } from '../ui/regex-check';
import { store } from './store';

const MAX_TAB_MATCHES = 5;
// Monday first. The values are the JavaScript day numbers (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];

interface EditorState {
  original: Rule | null;
  action: RuleAction;
  /** True after the user saw the warning and can save on the second click. */
  confirmed: boolean;
  openTabs: string[];
}

const state: EditorState = { original: null, action: 'gray', confirmed: false, openTabs: [] };
let sliders: SettingsSliders;

const el = {
  dialog: () => byId<HTMLDialogElement>('rule-dialog'),
  type: () => byId<HTMLSelectElement>('editor-type'),
  pattern: () => byId<HTMLInputElement>('editor-pattern'),
  ignoreCase: () => byId<HTMLInputElement>('editor-ignore-case'),
  label: () => byId<HTMLInputElement>('editor-label'),
  test: () => byId<HTMLInputElement>('editor-test'),
  ownSettings: () => byId<HTMLInputElement>('editor-own-settings'),
  schedule: () => byId<HTMLInputElement>('editor-schedule'),
  start: () => byId<HTMLInputElement>('editor-start'),
  end: () => byId<HTMLInputElement>('editor-end'),
  warning: () => byId('editor-warning'),
  save: () => byId<HTMLButtonElement>('rule-save'),
};

function setAction(action: RuleAction): void {
  state.action = action;
  for (const button of byId('editor-action').querySelectorAll<HTMLButtonElement>('button')) {
    const checked = button.dataset.value === action;
    button.setAttribute('aria-checked', String(checked));
    button.tabIndex = checked ? 0 : -1;
  }
  show(byId('editor-settings-group'), action === 'gray');
}

function compileCurrent(): ReturnType<typeof compilePattern> {
  return compilePattern({
    pattern: el.pattern().value,
    matchType: el.type().value as MatchType,
    ignoreCase: el.ignoreCase().checked,
  });
}

function setWarning(text: string | null): void {
  const warning = el.warning();
  warning.textContent = text ?? '';
  show(warning, text !== null);
  el.save().textContent = t(text === null ? 'save' : 'saveAnyway');
  state.confirmed = text !== null;
}

function testUrl(matcher: Matcher | null): void {
  const output = byId('editor-test-result');
  const value = el.test().value.trim();
  if (value === '') {
    output.textContent = '';
    return;
  }
  const url = parseUrl(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  if (url === null) output.textContent = t('testInvalidUrl');
  else if (matcher === null) output.textContent = '';
  else output.textContent = t(matcher(url) ? 'editorAgrees' : 'editorDoesNotAgree');
}

function listOpenTabs(matcher: Matcher | null): void {
  const list = byId('editor-tabs');
  const matches =
    matcher === null
      ? []
      : state.openTabs.filter((href) => {
          const url = parseUrl(href);
          return url !== null && matcher(url);
        });
  list.replaceChildren(
    ...matches.slice(0, MAX_TAB_MATCHES).map((href) => h('li', { title: href }, href)),
  );
  if (matches.length > MAX_TAB_MATCHES) {
    list.append(h('li', {}, t('editorMoreTabs', matches.length - MAX_TAB_MATCHES)));
  }
  show(byId('editor-tabs-block'), matches.length > 0);
}

/** Validates while the user writes (E-02) and updates the test result (E-03). */
function validate(): boolean {
  const type = el.type().value as MatchType;
  const info = MATCH_TYPE_INFO[type];
  byId('editor-help').textContent = `${t(info.help)} ${t('editorExample', info.example)}`;
  el.pattern().placeholder = info.example;
  show(byId('editor-ignore-case-row'), type === 'regex');

  const error = byId('editor-error');
  const empty = el.pattern().value.trim() === '';
  const result = compileCurrent();
  const showError = !result.ok && !empty;
  error.textContent = result.ok || empty ? '' : t(`error_${result.error}`);
  show(error, showError);
  el.pattern().setAttribute('aria-invalid', String(showError));

  const matcher = result.ok ? result.matcher : null;
  testUrl(matcher);
  listOpenTabs(matcher);
  return result.ok;
}

function updateGroups(): void {
  const settingsBody = byId('editor-sliders');
  settingsBody.setAttribute('aria-disabled', String(!el.ownSettings().checked));
  for (const input of settingsBody.querySelectorAll('input'))
    input.disabled = !el.ownSettings().checked;

  const scheduleBody = byId('editor-schedule-body');
  scheduleBody.setAttribute('aria-disabled', String(!el.schedule().checked));
  for (const input of scheduleBody.querySelectorAll('input'))
    input.disabled = !el.schedule().checked;
}

function selectedDays(): number[] {
  return [...byId('editor-days').querySelectorAll<HTMLInputElement>('input:checked')].map((input) =>
    Number(input.value),
  );
}

function buildRule(): Rule {
  const rule: Rule = {
    id: state.original?.id ?? createId(),
    pattern: el.type().value === 'regex' ? el.pattern().value : el.pattern().value.trim(),
    matchType: el.type().value as MatchType,
    action: state.action,
    enabled: state.original?.enabled ?? true,
  };
  if (rule.matchType === 'regex' && el.ignoreCase().checked) rule.ignoreCase = true;
  const label = el.label().value.trim();
  if (label !== '') rule.label = label;
  if (rule.action === 'gray' && el.ownSettings().checked) rule.settings = sliders.get();
  if (el.schedule().checked) {
    rule.schedule = { days: selectedDays(), start: el.start().value, end: el.end().value };
  }
  return rule;
}

async function submit(): Promise<void> {
  if (!validate()) {
    el.pattern().focus();
    if (el.pattern().value.trim() === '') {
      const error = byId('editor-error');
      error.textContent = t('error_empty');
      show(error, true);
    }
    return;
  }
  const rule = buildRule();
  if (rule.schedule !== undefined && rule.schedule.days.length === 0) {
    setWarning(t('editorNoDays'));
    state.confirmed = false;
    return;
  }

  if (!state.confirmed) {
    // Duplicate (R-13) and slow regular expression (M-16) warnings.
    const duplicate = findDuplicate(store.config, rule);
    if (duplicate !== undefined) {
      setWarning(t('editorDuplicate', duplicate.label ?? duplicate.pattern));
      return;
    }
    if (rule.matchType === 'regex') {
      el.save().disabled = true;
      const speed = await checkRegexSpeed(rule.pattern, rule.ignoreCase === true, [
        ...state.openTabs.slice(0, 20),
        el.test().value,
      ]);
      el.save().disabled = false;
      if (speed === 'slow') {
        setWarning(t('editorSlowRegex'));
        return;
      }
    }
  }

  await store.update((config) => {
    if (state.original !== null) return upsertRule(config, rule);
    // A new rule goes to the top of the list, so it has the highest priority.
    return { ...config, rules: [rule, ...config.rules] };
  });
  el.dialog().close();
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-rule="${rule.id}"] [data-part="edit"]`)?.focus();
  });
}

export function openRuleEditor(rule: Rule | null): void {
  state.original = rule;
  byId('rule-dialog-title').textContent = t(rule === null ? 'editorNewTitle' : 'editorEditTitle');

  el.type().value = rule?.matchType ?? 'domain';
  el.pattern().value = rule?.pattern ?? '';
  el.ignoreCase().checked = rule?.ignoreCase === true;
  el.label().value = rule?.label ?? '';
  el.test().value = '';
  setAction(rule?.action ?? 'gray');

  el.ownSettings().checked = rule?.settings !== undefined;
  sliders.set(rule?.settings ?? store.config.global);

  el.schedule().checked = rule?.schedule !== undefined;
  const days = rule?.schedule?.days ?? [1, 2, 3, 4, 5];
  for (const input of byId('editor-days').querySelectorAll<HTMLInputElement>('input')) {
    input.checked = days.includes(Number(input.value));
  }
  el.start().value = rule?.schedule?.start ?? '09:00';
  el.end().value = rule?.schedule?.end ?? '18:00';

  setWarning(null);
  updateGroups();

  // Open tabs for the list of pages that agree with the pattern (E-04).
  void api.tabs.query({}).then((tabs) => {
    state.openTabs = [
      ...new Set(tabs.map((tab) => tab.url).filter((url): url is string => isSupportedUrl(url))),
    ];
    if (el.test().value === '' && rule === null) el.test().value = state.openTabs[0] ?? '';
    validate();
  });

  validate();
  el.dialog().showModal();
  el.pattern().focus();
}

export function initEditor(): void {
  for (const type of MATCH_TYPES) {
    el.type().append(h('option', { value: type }, t(MATCH_TYPE_INFO[type].label)));
  }

  const weekday = new Intl.DateTimeFormat(getLanguage(), { weekday: 'short' });
  // 2026-11-01 is a Sunday: day N of that week is 1 + N.
  for (const day of WEEK) {
    const name = weekday.format(new Date(2026, 10, 1 + day));
    byId('editor-days').append(
      h(
        'label',
        { class: 'day' },
        h('input', { type: 'checkbox', value: String(day) }),
        h('span', {}, name),
      ),
    );
  }

  sliders = createSettingsSliders({});
  byId('editor-sliders').append(sliders.element);

  const radios = [...byId('editor-action').querySelectorAll<HTMLButtonElement>('button')];
  for (const button of radios) {
    button.addEventListener('click', () => setAction(button.dataset.value as RuleAction));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = radios.find((other) => other !== button);
      if (next === undefined) return;
      setAction(next.dataset.value as RuleAction);
      next.focus();
    });
  }

  const onEdit = (): void => {
    setWarning(null);
    validate();
  };
  el.type().addEventListener('change', onEdit);
  el.pattern().addEventListener('input', onEdit);
  el.ignoreCase().addEventListener('change', onEdit);
  el.test().addEventListener('input', () => validate());
  el.ownSettings().addEventListener('change', updateGroups);
  el.schedule().addEventListener('change', () => {
    setWarning(null);
    updateGroups();
  });

  byId('rule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  byId('rule-cancel').addEventListener('click', () => el.dialog().close());
  byId('rule-close').addEventListener('click', () => el.dialog().close());
}
