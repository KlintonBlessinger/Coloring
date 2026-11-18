/** Drag a straight line through the letter grid. Pure logic, no DOM. */

export interface Cell {
  row: number;
  col: number;
}

export interface TargetWord {
  id: string;
  word: string;
}

export interface LetterMatch {
  id: string;
  from: number;
  to: number;
}

/** Map a point inside the grid box to a cell, clamped so a finger can slide past the edge. */
export function cellFromOffset(x: number, y: number, width: number, height: number, size: number): Cell {
  const safeW = width > 0 ? width : 1;
  const safeH = height > 0 ? height : 1;
  const col = Math.floor(x / (safeW / size));
  const row = Math.floor(y / (safeH / size));
  return {
    row: Math.min(size - 1, Math.max(0, row)),
    col: Math.min(size - 1, Math.max(0, col)),
  };
}

/**
 * Snap the pointer to a straight line from the start cell.
 * Diagonals count when the two axes stay within 2:1. Easy puzzles pass
 * allowDiagonal false and snap to across or down only.
 */
export function snapStep(rowDelta: number, colDelta: number, allowDiagonal: boolean): { dr: number; dc: number } {
  const rowSign = Math.sign(rowDelta);
  const colSign = Math.sign(colDelta);
  const absRow = Math.abs(rowDelta);
  const absCol = Math.abs(colDelta);
  if (!allowDiagonal || absRow === 0 || absCol === 0) {
    if (absCol >= absRow) return { dr: 0, dc: colSign || 1 };
    return { dr: rowSign || 1, dc: 0 };
  }
  if (absRow <= absCol * 2 && absCol <= absRow * 2) return { dr: rowSign, dc: colSign };
  if (absCol > absRow) return { dr: 0, dc: colSign };
  return { dr: rowSign, dc: 0 };
}

export function snapLine(start: Cell, pointer: Cell, size: number, allowDiagonal: boolean): Cell[] {
  const rowDelta = pointer.row - start.row;
  const colDelta = pointer.col - start.col;
  if (rowDelta === 0 && colDelta === 0) return [start];
  const step = snapStep(rowDelta, colDelta, allowDiagonal);
  const span = step.dr === 0 ? Math.abs(colDelta) : step.dc === 0 ? Math.abs(rowDelta) : Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  const cells: Cell[] = [];
  for (let i = 0; i <= span; i += 1) {
    const row = start.row + step.dr * i;
    const col = start.col + step.dc * i;
    if (row < 0 || col < 0 || row >= size || col >= size) break;
    cells.push({ row, col });
  }
  return cells.length > 0 ? cells : [start];
}

export function sequenceFrom(letters: readonly string[], size: number, cells: readonly Cell[]): string {
  let word = '';
  for (const cell of cells) {
    word += letters[cell.row * size + cell.col] ?? '';
  }
  return word;
}

export function reverseWord(word: string): string {
  return [...word].reverse().join('');
}

/** The earliest forward or backward copy of the target inside the dragged letters. */
export function matchSlice(sequence: string, target: string): { from: number; to: number } | null {
  if (!target || sequence.length < target.length) return null;
  const reversed = reverseWord(target);
  const forwardAt = sequence.indexOf(target);
  const reverseAt = reversed === target ? -1 : sequence.indexOf(reversed);
  let from = -1;
  if (forwardAt >= 0 && (reverseAt < 0 || forwardAt <= reverseAt)) from = forwardAt;
  else if (reverseAt >= 0) from = reverseAt;
  if (from < 0) return null;
  return { from, to: from + target.length - 1 };
}

/** Longest unfound animal inside the drag. A longer drag still counts when the word sits inside it. */
export function bestMatch(sequence: string, targets: readonly TargetWord[]): LetterMatch | null {
  let best: LetterMatch | null = null;
  for (const target of targets) {
    const slice = matchSlice(sequence, target.word);
    if (!slice) continue;
    const length = slice.to - slice.from;
    if (!best || length > best.to - best.from || (length === best.to - best.from && slice.from < best.from)) {
      best = { id: target.id, from: slice.from, to: slice.to };
    }
  }
  return best;
}

export function judgeSelection(
  letters: readonly string[],
  size: number,
  cells: readonly Cell[],
  targets: readonly TargetWord[],
  found: ReadonlySet<string> = new Set(),
): { id: string; cells: Cell[] } | null {
  if (cells.length < 2) return null;
  const open = targets.filter((target) => !found.has(target.id));
  const hit = bestMatch(sequenceFrom(letters, size, cells), open);
  if (!hit) return null;
  return { id: hit.id, cells: cells.slice(hit.from, hit.to + 1) };
}
