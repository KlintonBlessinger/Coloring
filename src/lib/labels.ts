import { hexToOklch, hueDistance } from './color';
import type { LabelMode, Language, MathRange, NumberStyle } from './settings';

export type RegionMark = { kind: 'text'; text: string } | { kind: 'dots'; count: number } | { kind: 'tally'; count: number };

export interface LabelPuzzle {
  id: string;
  palette: string[];
  regionColors: number[];
}

export interface LabelSettings {
  numberStyle: NumberStyle;
  labels: LabelMode;
  language: Language;
  mathRange: MathRange;
}

interface SwatchName {
  id: string;
  en: string;
  es: string;
  /** Preferred OKLCH hue in degrees. Neutrals ignore hue. */
  h: number;
  l: number;
  c: number;
  neutral?: boolean;
}

/** About 30 kid-friendly names. One word each, with a Spanish pair. */
const NAMES: SwatchName[] = [
  { id: 'red', en: 'red', es: 'rojo', h: 25, l: 0.55, c: 0.18 },
  { id: 'pink', en: 'pink', es: 'rosa', h: 8, l: 0.78, c: 0.12 },
  { id: 'fuchsia', en: 'fuchsia', es: 'fucsia', h: 350, l: 0.62, c: 0.15 },
  { id: 'salmon', en: 'salmon', es: 'salmón', h: 28, l: 0.74, c: 0.1 },
  { id: 'blush', en: 'blush', es: 'rubor', h: 18, l: 0.86, c: 0.06 },
  { id: 'coral', en: 'coral', es: 'coral', h: 36, l: 0.68, c: 0.14 },
  { id: 'maroon', en: 'maroon', es: 'vino', h: 22, l: 0.4, c: 0.12 },
  { id: 'orange', en: 'orange', es: 'naranja', h: 58, l: 0.72, c: 0.16 },
  { id: 'peach', en: 'peach', es: 'durazno', h: 54, l: 0.82, c: 0.09 },
  { id: 'rust', en: 'rust', es: 'cobre', h: 45, l: 0.5, c: 0.1 },
  { id: 'gold', en: 'gold', es: 'dorado', h: 85, l: 0.82, c: 0.12 },
  { id: 'yellow', en: 'yellow', es: 'amarillo', h: 98, l: 0.88, c: 0.16 },
  { id: 'lemon', en: 'lemon', es: 'limón', h: 105, l: 0.9, c: 0.13 },
  { id: 'lime', en: 'lime', es: 'lima', h: 128, l: 0.75, c: 0.16 },
  { id: 'green', en: 'green', es: 'verde', h: 146, l: 0.55, c: 0.14 },
  { id: 'sage', en: 'sage', es: 'salvia', h: 150, l: 0.7, c: 0.07 },
  { id: 'moss', en: 'moss', es: 'musgo', h: 145, l: 0.58, c: 0.09 },
  { id: 'olive', en: 'olive', es: 'oliva', h: 125, l: 0.45, c: 0.08 },
  { id: 'mint', en: 'mint', es: 'menta', h: 172, l: 0.82, c: 0.055 },
  { id: 'jade', en: 'jade', es: 'jade', h: 168, l: 0.62, c: 0.09 },
  { id: 'teal', en: 'teal', es: 'cian', h: 190, l: 0.58, c: 0.09 },
  { id: 'sea', en: 'sea', es: 'mar', h: 188, l: 0.48, c: 0.08 },
  { id: 'aqua', en: 'aqua', es: 'agua', h: 192, l: 0.74, c: 0.08 },
  { id: 'wave', en: 'wave', es: 'ola', h: 198, l: 0.66, c: 0.085 },
  { id: 'sky', en: 'sky', es: 'cielo', h: 220, l: 0.72, c: 0.09 },
  { id: 'blue', en: 'blue', es: 'azul', h: 260, l: 0.55, c: 0.15 },
  { id: 'navy', en: 'navy', es: 'marino', h: 262, l: 0.35, c: 0.11 },
  { id: 'purple', en: 'purple', es: 'morado', h: 300, l: 0.5, c: 0.15 },
  { id: 'lilac', en: 'lilac', es: 'lila', h: 312, l: 0.75, c: 0.1 },
  { id: 'plum', en: 'plum', es: 'ciruela', h: 335, l: 0.42, c: 0.1 },
  { id: 'brown', en: 'brown', es: 'café', h: 55, l: 0.42, c: 0.08 },
  { id: 'tan', en: 'tan', es: 'beige', h: 70, l: 0.75, c: 0.05 },
  { id: 'sand', en: 'sand', es: 'arena', h: 80, l: 0.82, c: 0.06 },
  { id: 'cream', en: 'cream', es: 'crema', h: 60, l: 0.93, c: 0.025 },
  { id: 'ice', en: 'ice', es: 'hielo', h: 230, l: 0.92, c: 0.03 },
  { id: 'white', en: 'white', es: 'blanco', h: 0, l: 0.97, c: 0.005, neutral: true },
  { id: 'silver', en: 'silver', es: 'plata', h: 0, l: 0.78, c: 0, neutral: true },
  { id: 'gray', en: 'gray', es: 'gris', h: 0, l: 0.62, c: 0, neutral: true },
  { id: 'charcoal', en: 'charcoal', es: 'carbón', h: 0, l: 0.38, c: 0, neutral: true },
  { id: 'black', en: 'black', es: 'negro', h: 0, l: 0.2, c: 0, neutral: true },
];

/** Dolch pre-primer, then primer. */
const SIGHT_EN = [
  'a', 'and', 'away', 'big', 'blue', 'can', 'come', 'down', 'find', 'for', 'funny', 'go', 'help', 'here', 'I', 'in', 'is', 'it', 'jump', 'little',
  'look', 'make', 'me', 'my', 'not', 'one', 'play', 'red', 'run', 'said', 'see', 'the', 'three', 'to', 'two', 'up', 'we', 'where', 'yellow', 'you',
  'all', 'am', 'are', 'at', 'ate', 'be', 'black', 'brown', 'but', 'came', 'did', 'do', 'eat', 'four', 'get', 'good', 'have', 'he', 'into', 'like',
  'must', 'new', 'no', 'now', 'on', 'our', 'out', 'please', 'pretty', 'ran', 'ride', 'saw', 'say', 'she', 'so', 'soon', 'that', 'there', 'they',
  'this', 'too', 'under', 'want', 'was', 'well', 'went', 'what', 'white', 'who', 'will', 'with', 'yes',
];

/** High-frequency Spanish words a new reader already hears. */
const SIGHT_ES = [
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'de', 'en', 'es', 'no', 'sí', 'yo', 'tú', 'mi', 'me', 'te', 'se', 'con', 'por', 'para', 'que',
  'como', 'más', 'muy', 'aquí', 'ahí', 'bien', 'todo', 'esta', 'este', 'hay', 'son', 'su', 'le', 'lo', 'nos', 'él', 'ella', 'casa', 'mamá',
  'papá', 'agua', 'sol', 'pan', 'gato', 'leche', 'flor',
];

const ADD_TO_10 = [4, 5, 6, 7, 8, 9, 10];
const ADD_TO_20 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hueNear(h: number, center: number, span: number): boolean {
  return hueDistance(h, center) <= span;
}

/** The range that actually applies to the current number style. */
export function resolveRange(settings: Pick<LabelSettings, 'numberStyle' | 'mathRange'>): MathRange {
  if (settings.numberStyle === 'times') return settings.mathRange === 'times10' ? 'times10' : 'times5';
  if (settings.numberStyle === 'adding') return settings.mathRange === 'add20' ? 'add20' : 'add10';
  return settings.mathRange;
}

function timesProducts(maxFactor: number): number[] {
  const found = new Set<number>();
  for (let left = 2; left <= maxFactor; left++) {
    for (let right = 2; right <= maxFactor; right++) found.add(left * right);
  }
  return [...found].sort((a, b) => a - b);
}

export function answerBank(range: MathRange): number[] {
  if (range === 'add10') return ADD_TO_10;
  if (range === 'add20') return ADD_TO_20;
  if (range === 'times5') return timesProducts(5);
  return timesProducts(10);
}

/** Palette slots show these answers, not 1..N, so practice stays inside the chosen table. */
export function practiceAnswers(paletteLength: number, range: MathRange, puzzleId: string): number[] {
  const bank = answerBank(range);
  const start = hashString(`${puzzleId}:${range}`) % bank.length;
  return Array.from({ length: paletteLength }, (_, index) => bank[(start + index) % bank.length]!);
}

function addChoices(answer: number): string[] {
  if (answer <= 0) return ['0+0'];
  if (answer === 1) return ['0+1', '1+0'];
  const both = [];
  const withOne = [];
  for (let left = 1; left < answer; left++) {
    const right = answer - left;
    if (right < 1) continue;
    const text = `${left}+${right}`;
    if (left >= 2 && right >= 2) both.push(text);
    else withOne.push(text);
  }
  if (both.length) return both;
  if (withOne.length) return withOne;
  return [`${answer}+0`];
}

function timesChoices(answer: number, maxFactor: number): string[] {
  const options: string[] = [];
  for (let left = 2; left <= maxFactor; left++) {
    if (answer % left !== 0) continue;
    const right = answer / left;
    if (right < 2 || right > maxFactor) continue;
    options.push(`${left}×${right}`);
  }
  if (options.length) return options;
  if (answer <= 1) return answer === 1 ? ['1×1'] : ['0×0'];
  return addChoices(answer);
}

function subtractChoices(answer: number): string[] {
  const options: string[] = [];
  for (let sub = 2; sub <= 9; sub++) options.push(`${answer + sub}−${sub}`);
  return options.length ? options : [`${answer + 1}−1`];
}

export function problemChoices(style: Exclude<NumberStyle, 'plain' | 'counting'>, answer: number, range: MathRange = 'add10'): string[] {
  if (style === 'adding') return addChoices(answer);
  if (style === 'times') return timesChoices(answer, range === 'times10' ? 10 : range === 'times5' ? 5 : 10);
  return subtractChoices(answer);
}

function leastUsed(options: string[], usage: Map<string, number>, puzzleId: string, regionIndex: number): string {
  let best = options[0]!;
  let bestScore = Infinity;
  for (const option of options) {
    const used = usage.get(option) ?? 0;
    const jitter = (hashString(`${puzzleId}:${regionIndex}:${option}`) % 1000) / 1_000_000;
    const score = used + jitter;
    if (score < bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

/** A problem whose value is `answer`, stable for the same puzzle, region, and style. */
export function mathProblem(
  style: Exclude<NumberStyle, 'plain' | 'counting'>,
  answer: number,
  regionIndex: number,
  puzzleId: string,
  range: MathRange = 'add10',
): string {
  const options = problemChoices(style, answer, range);
  const usage = new Map<string, number>();
  return leastUsed(options, usage, puzzleId, regionIndex);
}

export function problemValue(text: string): number {
  const add = text.split('+');
  if (add.length === 2) return Number(add[0]) + Number(add[1]);
  const sub = text.split('−');
  if (sub.length === 2) return Number(sub[0]) - Number(sub[1]);
  const times = text.split('×');
  if (times.length === 2) return Number(times[0]) * Number(times[1]);
  return Number(text);
}

function nameScore(swatch: SwatchName, sample: ReturnType<typeof hexToOklch>): number {
  const { l, c, h } = sample;
  if (swatch.neutral) {
    let score = Math.abs(l - swatch.l) * 4 + c * 14;
    if (c >= 0.025) score += 2.2;
    const greenish = hueNear(h, 150, 70);
    const pinkish = hueNear(h, 8, 28);
    if (c >= 0.02 && (greenish || pinkish) && swatch.id === 'gray') score += 4;
    return score;
  }
  let score = hueDistance(h, swatch.h) / 32 + Math.abs(l - swatch.l) * 2.6 + Math.abs(c - swatch.c) * 7;
  if (swatch.id === 'peach' && hueNear(h, 10, 22)) score += 2.4;
  if (swatch.id === 'orange' && hueNear(h, 10, 16) && l > 0.7) score += 1.6;
  if (swatch.id === 'gold' && hueNear(h, 10, 18)) score += 1.4;
  if (swatch.id === 'brown' && l > 0.7) score += 1.2;
  if (swatch.id === 'gray') score += 3;
  if (c < 0.04 && l > 0.9 && swatch.id !== 'cream' && swatch.id !== 'white' && swatch.id !== 'sand') score += 1.6;
  return score;
}

function rankedNames(hex: string): number[] {
  const sample = hexToOklch(hex);
  return NAMES.map((_, index) => index).sort((a, b) => nameScore(NAMES[a]!, sample) - nameScore(NAMES[b]!, sample));
}

function acceptable(hex: string, nameIndex: number): boolean {
  const swatch = NAMES[nameIndex]!;
  const sample = hexToOklch(hex);
  if (swatch.neutral) return sample.c < 0.02 && Math.abs(sample.l - swatch.l) < 0.14;
  if (hueDistance(sample.h, swatch.h) > 26) return false;
  if (Math.abs(sample.l - swatch.l) > 0.16) return false;
  if (Math.abs(sample.c - swatch.c) > 0.065) return false;
  return true;
}

function shadeLabel(swatch: SwatchName, language: Language, shade: 'light' | 'dark'): string {
  const word = language === 'es' ? swatch.es : swatch.en;
  if (language === 'es') return shade === 'light' ? `${word} claro` : `${word} oscuro`;
  return shade === 'light' ? `light ${word}` : `dark ${word}`;
}

/** Friendly color words, unique inside one picture, and one word whenever a simple name fits. */
export function colorNames(palette: string[], language: Language): string[] {
  const filtered = palette.map((hex) => {
    const ranked = rankedNames(hex);
    const ok = ranked.filter((name) => acceptable(hex, name));
    return ok.length ? ok : ranked.slice(0, 1);
  });
  const order = palette.map((_, index) => index).sort((a, b) => {
    const scoreA = nameScore(NAMES[filtered[a]![0] ?? 0]!, hexToOklch(palette[a]!));
    const scoreB = nameScore(NAMES[filtered[b]![0] ?? 0]!, hexToOklch(palette[b]!));
    return scoreA - scoreB;
  });
  const claimed = new Set<string>();
  const out = new Array<string>(palette.length);
  const pending: number[] = [];
  const labelOf = (nameIndex: number) => (language === 'es' ? NAMES[nameIndex]!.es : NAMES[nameIndex]!.en);
  for (const index of order) {
    const choice = filtered[index]!.find((name) => !claimed.has(labelOf(name)));
    if (choice === undefined) {
      pending.push(index);
      continue;
    }
    const text = labelOf(choice);
    claimed.add(text);
    out[index] = text;
  }
  for (const index of pending) {
    const sample = hexToOklch(palette[index]!);
    let placed = '';
    for (const nameIndex of filtered[index] ?? []) {
      const swatch = NAMES[nameIndex]!;
      if (swatch.neutral && swatch.id !== 'gray') continue;
      const shades = sample.l >= swatch.l ? (['light', 'dark'] as const) : (['dark', 'light'] as const);
      for (const shade of shades) {
        const text = shadeLabel(swatch, language, shade);
        if (claimed.has(text)) continue;
        placed = text;
        break;
      }
      if (placed) break;
    }
    if (!placed) {
      const swatch = NAMES[filtered[index]![0] ?? 0]!;
      const word = language === 'es' ? swatch.es : swatch.en;
      const pale = language === 'es' ? `${word} suave` : `soft ${word}`;
      placed = claimed.has(pale) ? '' : pale;
      if (!placed) {
        placed = word;
        let n = 2;
        while (claimed.has(placed)) placed = `${word} ${n++}`;
      }
    }
    claimed.add(placed);
    out[index] = placed;
  }
  return out;
}

export function sightWord(index: number, language: Language): string {
  const list = language === 'es' ? SIGHT_ES : SIGHT_EN;
  const unique = language === 'es' ? list.filter((word, i) => list.indexOf(word) === i) : list;
  return unique[index] ?? unique[index % unique.length]!;
}

function answersFor(puzzle: LabelPuzzle, settings: LabelSettings): number[] {
  if (settings.labels !== 'numbers') return puzzle.palette.map((_, index) => index + 1);
  if (settings.numberStyle === 'adding' || settings.numberStyle === 'times') {
    return practiceAnswers(puzzle.palette.length, resolveRange(settings), puzzle.id);
  }
  return puzzle.palette.map((_, index) => index + 1);
}

export function regionMarks(puzzle: LabelPuzzle, settings: LabelSettings): RegionMark[] {
  if (settings.labels === 'colors') {
    const words = colorNames(puzzle.palette, settings.language);
    return puzzle.regionColors.map((color) => ({ kind: 'text', text: words[color] ?? String(color + 1) }));
  }
  if (settings.labels === 'words') {
    return puzzle.regionColors.map((color) => ({ kind: 'text', text: sightWord(color, settings.language) }));
  }
  const answers = answersFor(puzzle, settings);
  const range = resolveRange(settings);
  const usage = new Map<string, number>();
  return puzzle.regionColors.map((color, region) => {
    const answer = answers[color] ?? color + 1;
    if (settings.numberStyle === 'counting' && answer <= 5) return { kind: 'dots', count: answer };
    if (settings.numberStyle === 'counting' && answer <= 10) return { kind: 'tally', count: answer };
    if (settings.numberStyle === 'plain' || settings.numberStyle === 'counting') return { kind: 'text', text: String(answer) };
    const choice = leastUsed(problemChoices(settings.numberStyle, answer, range), usage, puzzle.id, region);
    usage.set(choice, (usage.get(choice) ?? 0) + 1);
    return { kind: 'text', text: choice };
  });
}

export function paletteMarks(palette: string[], settings: LabelSettings, puzzleId = ''): RegionMark[] {
  if (settings.labels === 'colors') {
    return colorNames(palette, settings.language).map((text) => ({ kind: 'text', text }));
  }
  if (settings.labels === 'words') {
    return palette.map((_, index) => ({ kind: 'text', text: sightWord(index, settings.language) }));
  }
  const answers =
    settings.numberStyle === 'adding' || settings.numberStyle === 'times'
      ? practiceAnswers(palette.length, resolveRange(settings), puzzleId)
      : palette.map((_, index) => index + 1);
  return answers.map((answer) => {
    if (settings.numberStyle === 'counting' && answer <= 5) return { kind: 'dots', count: answer };
    if (settings.numberStyle === 'counting' && answer <= 10) return { kind: 'tally', count: answer };
    return { kind: 'text', text: String(answer) };
  });
}

export function markText(mark: RegionMark): string {
  return mark.kind === 'text' ? mark.text : String(mark.count);
}
