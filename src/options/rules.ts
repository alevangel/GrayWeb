import { moveRule, removeRule, upsertRule } from '../shared/config/actions';
import { createId } from '../shared/config/schema';
import { t } from '../shared/i18n';
import { RuleEngine } from '../shared/rules/evaluate';
import { parseUrl } from '../shared/rules/url';
import { MATCH_TYPES, type Config, type Rule } from '../shared/types';
import { createSwitch, icon, iconButton, showToast } from '../ui/components';
import { byId, h, show } from '../ui/dom';
import { MATCH_TYPE_INFO } from '../ui/match-types';
import { openRuleEditor } from './editor';
import { store } from './store';

interface Filters {
  text: string;
  type: string;
  action: string;
}

const filters: Filters = { text: '', type: '', action: '' };
let draggedId: string | null = null;

function announce(text: string): void {
  byId('live').textContent = text;
}

function isFiltered(): boolean {
  return filters.text !== '' || filters.type !== '' || filters.action !== '';
}

function matchesFilters(rule: Rule): boolean {
  if (filters.type !== '' && rule.matchType !== filters.type) return false;
  if (filters.action !== '' && rule.action !== filters.action) return false;
  if (filters.text === '') return true;
  const text = filters.text.toLowerCase();
  return (
    rule.pattern.toLowerCase().includes(text) || (rule.label ?? '').toLowerCase().includes(text)
  );
}

async function move(rule: Rule, toIndex: number): Promise<void> {
  await store.update((config) => moveRule(config, rule.id, toIndex));
  announce(t('rulesMoved', toIndex + 1));
  focusRule(rule.id, 'grip');
}

function focusRule(id: string, part: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-rule="${id}"] [data-part="${part}"]`)?.focus();
  });
}

async function deleteRule(rule: Rule): Promise<void> {
  const index = store.config.rules.findIndex((r) => r.id === rule.id);
  await store.update((config) => removeRule(config, rule.id));
  // The user can cancel the deletion for 10 seconds (R-12).
  showToast(t('toastRuleRemoved'), {
    label: t('undo'),
    run: () => {
      void store.update((config) => {
        if (config.rules.some((r) => r.id === rule.id)) return config;
        const rules = [...config.rules];
        rules.splice(index, 0, rule);
        return { ...config, rules };
      });
    },
  });
}

async function duplicateRule(rule: Rule): Promise<void> {
  const index = store.config.rules.findIndex((r) => r.id === rule.id);
  const copy: Rule = { ...rule, id: createId() };
  await store.update((config) => {
    const rules = [...config.rules];
    rules.splice(index + 1, 0, copy);
    return { ...config, rules };
  });
  focusRule(copy.id, 'edit');
}

function ruleMeta(rule: Rule): HTMLElement {
  const meta = h(
    'div',
    { class: 'rule-meta' },
    h(
      'span',
      { class: rule.action === 'gray' ? 'tag tag-ink' : 'tag' },
      t(rule.action === 'gray' ? 'actionGray' : 'actionSkip'),
    ),
    h('span', {}, t(MATCH_TYPE_INFO[rule.matchType].label)),
  );
  if (rule.matchType === 'regex' && rule.ignoreCase === true) {
    meta.append(h('span', {}, '· ', t('editorIgnoreCaseShort')));
  }
  if (rule.label !== undefined) meta.append(h('span', {}, '· ', rule.label));
  if (rule.settings !== undefined) {
    meta.append(
      h(
        'span',
        { title: t('rulesOwnSettings') },
        '· ',
        icon('sliders'),
        ` ${rule.settings.intensity}%`,
      ),
    );
  }
  if (rule.schedule !== undefined) {
    meta.append(
      h(
        'span',
        { title: t('rulesScheduled') },
        '· ',
        icon('clock'),
        ` ${rule.schedule.start}–${rule.schedule.end}`,
      ),
    );
  }
  return meta;
}

function ruleRow(rule: Rule, index: number, total: number, reorder: boolean): HTMLLIElement {
  const grip = iconButton('grip', t('rulesMoveHandle'), () => undefined);
  grip.classList.add('grip');
  grip.dataset.part = 'grip';
  grip.disabled = !reorder;
  grip.addEventListener('keydown', (event) => {
    let target: number | null = null;
    if (event.key === 'ArrowUp' && index > 0) target = index - 1;
    if (event.key === 'ArrowDown' && index < total - 1) target = index + 1;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = total - 1;
    if (target === null || target === index) return;
    event.preventDefault();
    void move(rule, target);
  });

  const toggle = createSwitch(t('rulesEnabledLabel', rule.pattern), rule.enabled, (enabled) => {
    void store.update((config) => upsertRule(config, { ...rule, enabled }));
  });

  const edit = iconButton('edit', t('edit'), () => openRuleEditor(rule));
  edit.dataset.part = 'edit';
  const actions = h(
    'div',
    { class: 'rule-actions' },
    edit,
    iconButton('copy', t('duplicate'), () => void duplicateRule(rule)),
    iconButton('trash', t('delete'), () => void deleteRule(rule)),
  );
  if (reorder) {
    const up = iconButton('up', t('moveUp'), () => void move(rule, index - 1));
    const down = iconButton('down', t('moveDown'), () => void move(rule, index + 1));
    up.classList.add('move-btn');
    down.classList.add('move-btn');
    up.disabled = index === 0;
    down.disabled = index === total - 1;
    actions.prepend(up, down);
  }

  const main = h(
    'div',
    { class: 'rule-main' },
    h('span', { class: 'rule-pattern', title: rule.pattern }, rule.pattern),
    ruleMeta(rule),
  );
  main.addEventListener('dblclick', () => openRuleEditor(rule));

  const row = h(
    'li',
    {
      class: 'rule',
      dataset: { rule: rule.id, enabled: String(rule.enabled) },
    },
    grip,
    toggle,
    main,
    actions,
  );
  if (reorder) addDragAndDrop(row, grip, rule);
  return row;
}

function addDragAndDrop(row: HTMLLIElement, grip: HTMLElement, rule: Rule): void {
  grip.addEventListener('pointerdown', () => (row.draggable = true));
  row.addEventListener('dragstart', (event) => {
    draggedId = rule.id;
    row.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', rule.id);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => {
    draggedId = null;
    row.draggable = false;
    row.classList.remove('dragging');
    clearDropMarks();
  });
  row.addEventListener('dragover', (event) => {
    if (draggedId === null || draggedId === rule.id) return;
    event.preventDefault();
    const box = row.getBoundingClientRect();
    const before = event.clientY < box.top + box.height / 2;
    clearDropMarks();
    row.classList.add(before ? 'drop-before' : 'drop-after');
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const id = draggedId;
    if (id === null || id === rule.id) return;
    const before = row.classList.contains('drop-before');
    clearDropMarks();
    const rules = store.config.rules;
    const from = rules.findIndex((r) => r.id === id);
    let to = rules.findIndex((r) => r.id === rule.id) + (before ? 0 : 1);
    if (from < to) to -= 1;
    const moved = rules[from];
    if (moved !== undefined) void move(moved, to);
  });
}

function clearDropMarks(): void {
  for (const element of document.querySelectorAll('.drop-before, .drop-after')) {
    element.classList.remove('drop-before', 'drop-after');
  }
}

function renderTester(config: Config): void {
  const input = byId<HTMLInputElement>('test-url');
  const result = byId('test-result');
  const value = input.value.trim();
  for (const row of document.querySelectorAll('.rule.highlight')) row.classList.remove('highlight');
  if (value === '') {
    result.textContent = '';
    return;
  }
  const href = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  if (parseUrl(href) === null) {
    result.textContent = t('testInvalidUrl');
    return;
  }
  const engine = new RuleEngine({ ...config, enabled: true, pausedUntil: 0 });
  const decision = engine.evaluate(href);
  const outcome = t(decision.gray ? 'testResultGray' : 'testResultColor');
  result.replaceChildren();
  if (decision.rule !== undefined) {
    const position = config.rules.findIndex((r) => r.id === decision.rule?.id) + 1;
    result.append(
      h('strong', {}, outcome),
      ' — ',
      t('testByRule', position, decision.rule.label ?? decision.rule.pattern),
    );
    document.querySelector(`[data-rule="${decision.rule.id}"]`)?.classList.add('highlight');
  } else {
    result.append(
      h('strong', {}, outcome),
      ' — ',
      t(decision.reason === 'allSites' ? 'testByMode' : 'testNoRule'),
    );
  }
}

export function renderRules(config: Config): void {
  const list = byId('rule-list');
  const focused = document.activeElement as HTMLElement | null;
  const focusRuleId = focused?.closest<HTMLElement>('[data-rule]')?.dataset.rule;
  const focusPart = focused?.dataset.part;

  const visible = config.rules.filter(matchesFilters);
  const reorder = !isFiltered();
  list.replaceChildren(
    ...visible.map((rule) =>
      ruleRow(rule, config.rules.indexOf(rule), config.rules.length, reorder),
    ),
  );

  show(byId('rules-empty'), config.rules.length === 0);
  show(byId('rules-no-results'), config.rules.length > 0 && visible.length === 0);
  show(byId('reorder-hint'), !reorder && visible.length > 0);
  byId('mode-note').textContent = t(config.mode === 'all' ? 'modeNoteAll' : 'modeNoteListed');

  if (focusRuleId !== undefined && focusPart !== undefined) focusRule(focusRuleId, focusPart);
  renderTester(config);
}

export function initRules(): void {
  const typeSelect = byId<HTMLSelectElement>('filter-type');
  typeSelect.append(h('option', { value: '' }, t('filterAllTypes')));
  for (const type of MATCH_TYPES) {
    typeSelect.append(h('option', { value: type }, t(MATCH_TYPE_INFO[type].label)));
  }
  const actionSelect = byId<HTMLSelectElement>('filter-action');
  actionSelect.append(
    h('option', { value: '' }, t('filterAllActions')),
    h('option', { value: 'gray' }, t('actionGray')),
    h('option', { value: 'skip' }, t('actionSkip')),
  );

  const onFilter = (): void => {
    filters.text = byId<HTMLInputElement>('rule-search').value.trim();
    filters.type = typeSelect.value;
    filters.action = actionSelect.value;
    renderRules(store.config);
  };
  byId('rule-search').addEventListener('input', onFilter);
  typeSelect.addEventListener('change', onFilter);
  actionSelect.addEventListener('change', onFilter);

  byId('test-url').addEventListener('input', () => renderTester(store.config));
  byId('add-rule').addEventListener('click', () => openRuleEditor(null));

  store.subscribe(renderRules);
  renderRules(store.config);
}
