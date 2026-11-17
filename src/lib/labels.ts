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

type Family = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'brown' | 'black' | 'white' | 'gray' | 'gold' | 'tan' | 'teal';

/** The color words a child learns first, plus gold, tan, and teal when a hue needs them. */
const FAMILIES: Record<Family, { en: string; es: string; h: number; l: number }> = {
  red: { en: 'red', es: 'rojo', h: 25, l: 0.55 },
  orange: { en: 'orange', es: 'naranja', h: 58, l: 0.7 },
  yellow: { en: 'yellow', es: 'amarillo', h: 102, l: 0.88 },
  green: { en: 'green', es: 'verde', h: 145, l: 0.58 },
  blue: { en: 'blue', es: 'azul', h: 250, l: 0.55 },
  purple: { en: 'purple', es: 'morado', h: 305, l: 0.5 },
  pink: { en: 'pink', es: 'rosa', h: 12, l: 0.78 },
  brown: { en: 'brown', es: 'marrón', h: 55, l: 0.42 },
  black: { en: 'black', es: 'negro', h: 0, l: 0.22 },
  white: { en: 'white', es: 'blanco', h: 0, l: 0.96 },
  gray: { en: 'gray', es: 'gris', h: 0, l: 0.62 },
  gold: { en: 'gold', es: 'dorado', h: 85, l: 0.82 },
  tan: { en: 'tan', es: 'beige', h: 75, l: 0.78 },
  teal: { en: 'teal', es: 'turquesa', h: 190, l: 0.62 },
};

const BASIC_HUES: { family: Family; h: number }[] = [
  { family: 'red', h: 25 },
  { family: 'orange', h: 58 },
  { family: 'yellow', h: 102 },
  { family: 'green', h: 145 },
  { family: 'teal', h: 190 },
  { family: 'blue', h: 250 },
  { family: 'purple', h: 305 },
];

const NEIGHBORS: Record<Family, Family[]> = {
  red: ['pink', 'orange', 'brown'],
  orange: ['gold', 'red', 'yellow', 'brown'],
  yellow: ['gold', 'orange', 'green'],
  green: ['teal', 'yellow'],
  blue: ['teal', 'purple'],
  purple: ['pink', 'blue', 'red'],
  pink: ['red', 'purple'],
  brown: ['orange', 'tan', 'red'],
  black: ['gray', 'brown'],
  white: ['gray', 'tan'],
  gray: ['white', 'black', 'tan'],
  gold: ['yellow', 'orange', 'tan'],
  tan: ['brown', 'yellow', 'gold', 'orange'],
  teal: ['green', 'blue'],
};

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

/**
 * 10×10 answers a child can vary. Each has at least two facts with factors
 * from 2 to 10, and none is past 60. 81 and 100 stay out so one picture is
 * not a row of 9×9 and 10×10.
 */
const TIMES10_CORE = [6, 8, 12, 16, 18, 20, 24, 30, 36, 40, 10, 14, 15, 21, 28];
const TIMES10_EXTRA = [32, 35, 42, 45, 48, 50, 54, 56, 60];
const TIMES10_REPEAT = [12, 16, 18, 20, 24, 30, 36, 40];

export function answerBank(range: MathRange): number[] {
  if (range === 'add10') return ADD_TO_10;
  if (range === 'add20') return ADD_TO_20;
  if (range === 'times5') return timesProducts(5).filter((answer) => answer >= 4 && answer <= 25);
  return [...TIMES10_CORE, ...TIMES10_EXTRA];
}

/** Palette slots show these answers, not 1..N, so practice stays inside the chosen table. */
export function practiceAnswers(paletteLength: number, range: MathRange, puzzleId: string): number[] {
  if (range !== 'times10') {
    const bank = answerBank(range);
    const start = hashString(`${puzzleId}:${range}`) % bank.length;
    return Array.from({ length: paletteLength }, (_, index) => bank[(start + index) % bank.length]!);
  }
  const start = hashString(`${puzzleId}:times10`) % TIMES10_CORE.length;
  const picked: number[] = [];
  for (let index = 0; index < paletteLength && index < TIMES10_CORE.length; index++) {
    picked.push(TIMES10_CORE[(start + index) % TIMES10_CORE.length]!);
  }
  for (const extra of TIMES10_EXTRA) {
    if (picked.length >= paletteLength) break;
    picked.push(extra);
  }
  let repeat = hashString(`${puzzleId}:times10:more`) % TIMES10_REPEAT.length;
  while (picked.length < paletteLength) {
    picked.push(TIMES10_REPEAT[repeat % TIMES10_REPEAT.length]!);
    repeat += 1;
  }
  return picked;
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

function nearestHue(h: number): Family {
  let best: Family = 'red';
  let bestDist = Infinity;
  for (const item of BASIC_HUES) {
    const dist = hueDistance(h, item.h);
    if (dist < bestDist) {
      best = item.family;
      bestDist = dist;
    }
  }
  return best;
}

/** One basic color word. Light and dark come later, when two swatches share it. */
function familyOf(sample: ReturnType<typeof hexToOklch>): Family {
  const { l, c, h } = sample;
  if (c < 0.03) {
    if (l >= 0.9) return 'white';
    if (l <= 0.28) return 'black';
    return 'gray';
  }
  if (l < 0.5 && c < 0.14 && hueNear(h, 55, 32)) return 'brown';
  if (l > 0.76 && c < 0.08 && c >= 0.03 && hueNear(h, 78, 28)) return 'tan';
  if (l >= 0.68 && hueNear(h, 10, 30)) return 'pink';
  if (l > 0.74 && c >= 0.08 && h >= 70 && h <= 94) return 'gold';
  return nearestHue(h);
}

function fitFamilies(samples: ReturnType<typeof hexToOklch>[]): Family[] {
  const families = samples.map((sample) => familyOf(sample));
  for (let guard = 0; guard < samples.length; guard++) {
    const counts = new Map<Family, number>();
    for (const family of families) counts.set(family, (counts.get(family) ?? 0) + 1);
    const crowded = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!crowded || crowded[1] <= 5) break;
    const [family] = crowded;
    let worst = 0;
    let worstDist = -1;
    families.forEach((item, index) => {
      if (item !== family) return;
      const center = FAMILIES[family].h;
      const dist = family === 'gray' || family === 'white' || family === 'black' ? Math.abs(samples[index]!.l - FAMILIES[family].l) : hueDistance(samples[index]!.h, center);
      if (dist > worstDist) {
        worst = index;
        worstDist = dist;
      }
    });
    const open = NEIGHBORS[family].find((next) => (counts.get(next) ?? 0) < 5);
    families[worst] = open ?? NEIGHBORS[family][0]!;
  }
  return families;
}

type Shade = 'base' | 'light' | 'dark' | 'very-light' | 'very-dark';

function shadeLabel(family: Family, language: Language, shade: Shade): string {
  const word = language === 'es' ? FAMILIES[family].es : FAMILIES[family].en;
  if (shade === 'base') return word;
  if (language === 'es') {
    if (shade === 'light') return `${word} claro`;
    if (shade === 'dark') return `${word} oscuro`;
    if (shade === 'very-light') return `${word} muy claro`;
    return `${word} muy oscuro`;
  }
  if (shade === 'light') return `light ${word}`;
  if (shade === 'dark') return `dark ${word}`;
  if (shade === 'very-light') return `very light ${word}`;
  return `very dark ${word}`;
}

/** Basic color words. A second swatch of the same color becomes light or dark, then very light or very dark. */
export function colorNames(palette: string[], language: Language): string[] {
  const samples = palette.map((hex) => hexToOklch(hex));
  const families = fitFamilies(samples);
  const out = new Array<string>(palette.length);
  const groups = new Map<Family, number[]>();
  families.forEach((family, index) => {
    const list = groups.get(family) ?? [];
    list.push(index);
    groups.set(family, list);
  });
  for (const [family, indexes] of groups) {
    const sorted = [...indexes].sort((a, b) => samples[a]!.l - samples[b]!.l);
    const target = FAMILIES[family].l;
    let basePos = 0;
    let best = Infinity;
    sorted.forEach((index, pos) => {
      const dist = Math.abs(samples[index]!.l - target);
      if (dist < best) {
        best = dist;
        basePos = pos;
      }
    });
    const minPos = Math.max(0, sorted.length - 1 - 2);
    const maxPos = Math.min(2, sorted.length - 1);
    if (basePos < minPos) basePos = minPos;
    if (basePos > maxPos) basePos = maxPos;
    sorted.forEach((index, pos) => {
      let shade: Shade = 'base';
      if (pos < basePos) shade = basePos - pos === 1 ? 'dark' : 'very-dark';
      if (pos > basePos) shade = pos - basePos === 1 ? 'light' : 'very-light';
      out[index] = shadeLabel(family, language, shade);
    });
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
