import { hexToOklab, labDist2, luma } from './color';
import type { LabelMode, Language, NumberStyle } from './settings';

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
}

interface NamedColor {
  en: string;
  es: string;
  hex: string;
}

const NAMED: NamedColor[] = [
  { en: 'red', es: 'rojo', hex: '#e23d3d' },
  { en: 'orange', es: 'naranja', hex: '#f08a24' },
  { en: 'yellow', es: 'amarillo', hex: '#f2d230' },
  { en: 'gold', es: 'dorado', hex: '#c8961a' },
  { en: 'peach', es: 'durazno', hex: '#f6b48a' },
  { en: 'coral', es: 'coral', hex: '#e07a5f' },
  { en: 'pink', es: 'rosa', hex: '#f48fb1' },
  { en: 'lavender', es: 'lavanda', hex: '#b39ddb' },
  { en: 'purple', es: 'morado', hex: '#7e57c2' },
  { en: 'blue', es: 'azul', hex: '#3d6ec9' },
  { en: 'navy', es: 'añil', hex: '#1b3a7a' },
  { en: 'teal', es: 'turquesa', hex: '#1f8a86' },
  { en: 'mint', es: 'menta', hex: '#7dcea0' },
  { en: 'green', es: 'verde', hex: '#3e9a4a' },
  { en: 'brown', es: 'marrón', hex: '#8a5a32' },
  { en: 'cream', es: 'crema', hex: '#f4efe6' },
  { en: 'white', es: 'blanco', hex: '#f7f7f7' },
  { en: 'gray', es: 'gris', hex: '#8d8d8d' },
  { en: 'black', es: 'negro', hex: '#2a2a2a' },
  { en: 'maroon', es: 'granate', hex: '#7a2430' },
];

const NAMED_LABS = NAMED.map((swatch) => hexToOklab(swatch.hex));

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

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

/** A problem whose value is `answer`, stable for the same puzzle, region, and style. */
export function mathProblem(style: Exclude<NumberStyle, 'plain' | 'counting'>, answer: number, regionIndex: number, puzzleId: string): string {
  const random = mulberry32(hashString(`${puzzleId}:${style}:${regionIndex}`));
  if (style === 'adding') {
    const options: string[] = [];
    for (let left = 0; left <= answer; left++) options.push(`${left}+${answer - left}`);
    return pick(options, random);
  }
  if (style === 'times') {
    const options: string[] = [];
    for (let left = 1; left <= answer; left++) {
      if (answer % left === 0) options.push(`${left}×${answer / left}`);
    }
    return pick(options.length ? options : ['1×1'], random);
  }
  const ceiling = Math.max(answer + 1, Math.min(20, answer + 9));
  const options: string[] = [];
  for (let minuend = answer + 1; minuend <= ceiling; minuend++) options.push(`${minuend}−${minuend - answer}`);
  if (!options.length) options.push(`${answer + 1}−1`);
  return pick(options, random);
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

function rankedNames(hex: string): number[] {
  const lab = hexToOklab(hex);
  return NAMED.map((_, index) => index).sort((a, b) => labDist2(lab, NAMED_LABS[a]!) - labDist2(lab, NAMED_LABS[b]!));
}

function shadeName(nameIndex: number, language: Language, shade: 'plain' | 'light' | 'dark'): string {
  const swatch = NAMED[nameIndex]!;
  const word = language === 'es' ? swatch.es : swatch.en;
  if (shade === 'plain') return word;
  if (language === 'es') return shade === 'light' ? `${word} claro` : `${word} oscuro`;
  return shade === 'light' ? `light ${word}` : `dark ${word}`;
}

/** Friendly color words, unique inside one picture. */
export function colorNames(palette: string[], language: Language): string[] {
  const ranks = palette.map((hex) => rankedNames(hex));
  const nearest = ranks.map((rank) => rank[0]!);
  const counts = new Map<number, number>();
  for (const name of nearest) counts.set(name, (counts.get(name) ?? 0) + 1);
  const claimed = new Set<string>();
  const out = new Array<string>(palette.length);
  const pending: number[] = [];
  nearest.forEach((name, index) => {
    if ((counts.get(name) ?? 0) === 1) {
      const text = shadeName(name, language, 'plain');
      out[index] = text;
      claimed.add(text);
    } else pending.push(index);
  });
  const groups = new Map<number, number[]>();
  for (const index of pending) {
    const name = nearest[index]!;
    const list = groups.get(name) ?? [];
    list.push(index);
    groups.set(name, list);
  }
  for (const [name, indexes] of groups) {
    const sorted = indexes.slice().sort((a, b) => luma(palette[b]!) - luma(palette[a]!));
    const lightText = shadeName(name, language, 'light');
    const darkText = shadeName(name, language, 'dark');
    const plainText = shadeName(name, language, 'plain');
    out[sorted[0]!] = lightText;
    out[sorted[sorted.length - 1]!] = sorted.length === 1 ? plainText : darkText;
    claimed.add(lightText);
    claimed.add(darkText);
    if (sorted.length === 2) continue;
    const middles = sorted.slice(1, -1);
    if (middles.length === 1 && !claimed.has(plainText)) {
      out[middles[0]!] = plainText;
      claimed.add(plainText);
      continue;
    }
    claimed.add(plainText);
    for (const index of middles) {
      let assigned = '';
      for (const candidate of ranks[index]!) {
        const text = shadeName(candidate, language, 'plain');
        if (!claimed.has(text)) {
          assigned = text;
          break;
        }
      }
      if (!assigned) assigned = `${plainText} ${index + 1}`;
      out[index] = assigned;
      claimed.add(assigned);
    }
  }
  return out;
}

export function sightWord(index: number, language: Language): string {
  const list = language === 'es' ? SIGHT_ES : SIGHT_EN;
  const unique = language === 'es' ? list.filter((word, i) => list.indexOf(word) === i) : list;
  return unique[index] ?? unique[index % unique.length]!;
}

function numberMark(style: NumberStyle, answer: number, regionIndex: number, puzzleId: string, onRegion: boolean): RegionMark {
  if (style === 'counting' && answer <= 5) return { kind: 'dots', count: answer };
  if (style === 'counting' && answer <= 10) return { kind: 'tally', count: answer };
  if (style === 'plain' || style === 'counting' || !onRegion) return { kind: 'text', text: String(answer) };
  return { kind: 'text', text: mathProblem(style, answer, regionIndex, puzzleId) };
}

export function regionMarks(puzzle: LabelPuzzle, settings: LabelSettings): RegionMark[] {
  const words =
    settings.labels === 'colors'
      ? colorNames(puzzle.palette, settings.language)
      : settings.labels === 'words'
        ? puzzle.palette.map((_, index) => sightWord(index, settings.language))
        : null;
  return puzzle.regionColors.map((color, region) => {
    if (words) return { kind: 'text', text: words[color] ?? String(color + 1) };
    return numberMark(settings.numberStyle, color + 1, region, puzzle.id, true);
  });
}

export function paletteMarks(palette: string[], settings: LabelSettings): RegionMark[] {
  if (settings.labels === 'colors') {
    return colorNames(palette, settings.language).map((text) => ({ kind: 'text', text }));
  }
  if (settings.labels === 'words') {
    return palette.map((_, index) => ({ kind: 'text', text: sightWord(index, settings.language) }));
  }
  return palette.map((_, index) => numberMark(settings.numberStyle, index + 1, index, 'palette', false));
}

export function markText(mark: RegionMark): string {
  return mark.kind === 'text' ? mark.text : String(mark.count);
}
