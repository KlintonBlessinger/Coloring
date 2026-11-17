export const NUMBER_STYLES = ['plain', 'counting', 'adding', 'subtracting', 'times'] as const;
export type NumberStyle = (typeof NUMBER_STYLES)[number];

export const LABEL_MODES = ['numbers', 'colors', 'words'] as const;
export type LabelMode = (typeof LABEL_MODES)[number];

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Settings {
  sound: boolean;
  haptics: boolean;
  bigNumbers: boolean;
  /** How numbers are drawn when labels are numbers. Kept separate for a future per-child profile. */
  numberStyle: NumberStyle;
  /** What a swatch and a region show. Kept separate for a future per-child profile. */
  labels: LabelMode;
  /** UI language, spoken voice, and which fact list to read. Kept separate for a future per-child profile. */
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: false,
  haptics: true,
  bigNumbers: false,
  numberStyle: 'plain',
  labels: 'numbers',
  language: 'en',
};

export function pickSetting<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
