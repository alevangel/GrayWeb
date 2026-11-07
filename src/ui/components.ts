import { t } from '../shared/i18n';
import { SETTING_LIMITS, type FilterSettings } from '../shared/types';
import { h } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'grip' ? '3' : '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

export function iconButton(
  name: IconName,
  label: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = h('button', { type: 'button', class: 'icon-btn', title: label }, icon(name));
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

/** A switch control (role="switch"). */
export function createSwitch(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLButtonElement {
  const button = h('button', { type: 'button', class: 'switch' });
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', label);
  setSwitch(button, checked);
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    setSwitch(button, next);
    onChange(next);
  });
  return button;
}

export function setSwitch(button: HTMLElement, checked: boolean): void {
  button.setAttribute('aria-checked', String(checked));
}

function updateFill(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const percent = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${percent}%`);
}

let sliderCounter = 0;

export interface SettingsSliders {
  element: HTMLElement;
  get(): FilterSettings;
  set(settings: FilterSettings): void;
}

/**
 * Sliders for the filter settings.
 * `onInput` runs while the user moves a slider. `onChange` runs when the user releases it.
 */
export function createSettingsSliders(options: {
  keys?: (keyof FilterSettings)[];
  onInput?: (settings: FilterSettings) => void;
  onChange?: (settings: FilterSettings) => void;
}): SettingsSliders {
  const keys = options.keys ?? ['intensity', 'contrast', 'brightness'];
  const inputs = new Map<keyof FilterSettings, HTMLInputElement>();
  const outputs = new Map<keyof FilterSettings, HTMLOutputElement>();
  let current: FilterSettings = { intensity: 100, contrast: 100, brightness: 100 };

  const element = h('div', { class: 'sliders' });
  for (const key of keys) {
    sliderCounter += 1;
    const id = `slider-${key}-${sliderCounter}`;
    const input = h('input', {
      type: 'range',
      id,
      min: String(SETTING_LIMITS[key].min),
      max: String(SETTING_LIMITS[key].max),
      step: '1',
    });
    const output = h('output');
    output.setAttribute('for', id);
    inputs.set(key, input);
    outputs.set(key, output);

    const read = (): FilterSettings => {
      current = { ...current, [key]: Number(input.value) };
      output.value = `${input.value}%`;
      updateFill(input);
      return current;
    };
    input.addEventListener('input', () => options.onInput?.(read()));
    input.addEventListener('change', () => options.onChange?.(read()));

    element.append(
      h(
        'div',
        { class: 'slider' },
        h('label', { htmlFor: id }, t(`setting_${key}`)),
        output,
        input,
      ),
    );
  }

  return {
    element,
    get: () => ({ ...current }),
    set(settings) {
      current = { ...settings };
      for (const [key, input] of inputs) {
        input.value = String(settings[key]);
        const output = outputs.get(key);
        if (output !== undefined) output.value = `${settings[key]}%`;
        updateFill(input);
      }
    },
  };
}

let activeToast: { element: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

/** Shows a short message at the bottom of the page, with an optional action. */
export function showToast(
  text: string,
  action?: { label: string; run: () => void },
  durationMs = 10_000,
): void {
  if (activeToast !== null) {
    clearTimeout(activeToast.timer);
    activeToast.element.remove();
  }
  const element = h('div', { class: 'toast', attrs: { role: 'status' } }, h('span', {}, text));
  if (action !== undefined) {
    const button = h('button', { type: 'button', class: 'btn' }, action.label);
    button.addEventListener('click', () => {
      action.run();
      close();
    });
    element.append(button);
  }
  function close(): void {
    element.remove();
    if (activeToast?.element === element) activeToast = null;
  }
  document.body.append(element);
  activeToast = { element, timer: setTimeout(close, durationMs) };
}
