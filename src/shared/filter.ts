import type { FilterSettings } from './types';

/** Returns the CSS `filter` value for the settings, or "none" when nothing changes. */
export function filterValue(settings: FilterSettings): string {
  const parts: string[] = [];
  if (settings.intensity > 0) parts.push(`grayscale(${settings.intensity}%)`);
  if (settings.contrast !== 100) parts.push(`contrast(${settings.contrast}%)`);
  if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness}%)`);
  return parts.length === 0 ? 'none' : parts.join(' ');
}

/** Returns the style sheet text that applies the filter to the root element. */
export function filterStyleSheet(settings: FilterSettings): string {
  const value = filterValue(settings);
  if (value === 'none') return '';
  return `html{filter:${value}!important;}`;
}
