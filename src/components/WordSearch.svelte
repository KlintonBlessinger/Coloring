<script lang="ts">
  import { applyAudioSettings, buzz, Sfx } from '../lib/audio';
  import { wordSearchCopy } from '../lib/games/word-search/copy';
  import type { WordLevel } from '../lib/games/word-search/animals';
  import { createPuzzle, type BuiltPuzzle, type PuzzleWord } from '../lib/games/word-search/puzzle';
  import { emptySave, loadWordSearch, saveWordSearch, type FoundMark, type WordSearchSave } from '../lib/games/word-search/progress';
  import { cellFromOffset, judgeSelection, reverseWord, sequenceFrom, snapLine, type Cell } from '../lib/games/word-search/select';
  import type { Settings } from '../lib/settings';
  import { speak } from '../lib/speech';
  import { asset } from '../lib/vector';

  let { initialSettings }: { initialSettings: Settings } = $props();

  const copy = $derived(wordSearchCopy(initialSettings.language));
  const sfx = new Sfx(() => initialSettings.sound);
  const levels: WordLevel[] = ['easy', 'medium', 'hard'];
  const markers = ['#f6b7a6', '#8ed4ae', '#9ecff5', '#f3b4d4', '#f6d48a', '#cfc4f4'];
  const confettiColors = ['#e07a5f', '#2f6a45', '#1d6ea8', '#b23a78', '#e0a84a', '#6e8b74'];
  const confetti = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 37) % 100,
    color: confettiColors[i % confettiColors.length] ?? '#e07a5f',
    delay: (i % 8) * 0.08,
    dur: 2.8 + (i % 5) * 0.25,
  }));

  let save = $state<WordSearchSave | null>(null);
  let boardEl = $state<HTMLDivElement | null>(null);
  let cellsEl = $state<HTMLDivElement | null>(null);
  let dragCells = $state<Cell[]>([]);
  let dragBad = $state(false);
  let dragId: number | null = null;
  let dragStart: Cell | null = null;
  let missTimer = 0;
  let writeChain = Promise.resolve();

  const puzzle = $derived(save ? createPuzzle(save.language, save.difficulty, save.place[save.difficulty] ?? 0) : null);

  const shownFound = $derived.by(() => {
    const book = puzzle;
    if (!book || !save) return [];
    return (save.puzzles[book.key] ?? []).filter((mark) => markFits(book, mark));
  });

  const complete = $derived(!!puzzle && puzzle.words.length > 0 && shownFound.length >= puzzle.words.length);
  const fact = $derived.by(() => {
    const book = puzzle;
    if (!book || !complete) return '';
    const id = shownFound[shownFound.length - 1]?.id ?? book.words[0]?.id;
    return book.words.find((word) => word.id === id)?.facts[0] ?? book.words[0]?.facts[0] ?? '';
  });

  $effect(() => {
    applyAudioSettings({
      effects: initialSettings.sound,
      music: initialSettings.music,
      volume: initialSettings.volume,
      musicVolume: initialSettings.musicVolume,
    });
  });

  $effect(() => {
    const language = initialSettings.language;
    let live = true;
    void loadWordSearch(language).then((stored) => {
      if (live) save = stored ?? emptySave(language);
    });
    return () => {
      live = false;
    };
  });

  $effect(() => {
    const board = boardEl;
    if (!board) return;
    const block = (event: TouchEvent) => {
      event.preventDefault();
    };
    board.addEventListener('touchmove', block, { passive: false });
    return () => board.removeEventListener('touchmove', block);
  });

  function markFits(book: BuiltPuzzle, mark: FoundMark): boolean {
    const word = book.words.find((item) => item.id === mark.id);
    if (!word) return false;
    const sequence = sequenceFrom(book.letters, book.size, mark.cells);
    return sequence === word.word || sequence === reverseWord(word.word);
  }

  function colorFor(book: BuiltPuzzle, id: string): string {
    const index = Math.max(0, book.words.findIndex((word) => word.id === id));
    return markers[index % markers.length] ?? '#f6b7a6';
  }

  function capsule(cells: Cell[]) {
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (!first || !last) return null;
    return { x1: first.col + 0.5, y1: first.row + 0.5, x2: last.col + 0.5, y2: last.row + 0.5 };
  }

  function cellAt(event: PointerEvent): Cell | null {
    const el = cellsEl;
    const book = puzzle;
    if (!el || !book) return null;
    const rect = el.getBoundingClientRect();
    return cellFromOffset(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, book.size);
  }

  function persist(next: WordSearchSave) {
    writeChain = writeChain.then(() => saveWordSearch(next)).catch(() => undefined);
  }

  function hear(word: PuzzleWord) {
    speak(word.say, initialSettings.language);
    sfx.tap();
    buzz('tap', initialSettings.haptics);
  }

  function readFact() {
    if (fact) speak(fact, initialSettings.language);
  }

  function setLevel(level: WordLevel) {
    if (!save || save.difficulty === level) return;
    window.clearTimeout(missTimer);
    dragCells = [];
    dragBad = false;
    dragId = null;
    const next = { ...save, difficulty: level, updatedAt: Date.now() };
    save = next;
    persist(next);
  }

  function shift(delta: number) {
    if (!save) return;
    window.clearTimeout(missTimer);
    dragCells = [];
    dragBad = false;
    dragId = null;
    const place = { ...save.place, [save.difficulty]: (save.place[save.difficulty] ?? 0) + delta };
    const next = { ...save, place, updatedAt: Date.now() };
    save = next;
    persist(next);
  }

  function replay() {
    if (!save || !puzzle) return;
    window.clearTimeout(missTimer);
    dragCells = [];
    dragBad = false;
    const puzzles = { ...save.puzzles };
    delete puzzles[puzzle.key];
    const next = {
      ...save,
      puzzles,
      completed: save.completed.filter((key) => key !== puzzle.key),
      updatedAt: Date.now(),
    };
    save = next;
    persist(next);
  }

  function onDown(event: PointerEvent) {
    if (!puzzle || complete) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const cell = cellAt(event);
    if (!cell) return;
    window.clearTimeout(missTimer);
    dragBad = false;
    dragStart = cell;
    dragCells = [cell];
    dragId = event.pointerId;
    boardEl?.setPointerCapture(event.pointerId);
  }

  function onMove(event: PointerEvent) {
    if (dragId !== event.pointerId || !puzzle || !dragStart) return;
    event.preventDefault();
    const cell = cellAt(event);
    if (!cell) return;
    dragCells = snapLine(dragStart, cell, puzzle.size, puzzle.allowDiagonal);
  }

  function onUp(event: PointerEvent) {
    if (dragId !== event.pointerId || !puzzle || !save) return;
    dragId = null;
    dragStart = null;
    const cells = dragCells;
    const hit = judgeSelection(
      puzzle.letters,
      puzzle.size,
      cells,
      puzzle.words.map((word) => ({ id: word.id, word: word.word })),
      new Set(shownFound.map((mark) => mark.id)),
    );
    if (!hit) {
      if (cells.length > 1) {
        dragBad = true;
        sfx.wrong();
        buzz('wrong', initialSettings.haptics);
        window.clearTimeout(missTimer);
        missTimer = window.setTimeout(() => {
          dragCells = [];
          dragBad = false;
        }, 460);
      } else {
        dragCells = [];
      }
      return;
    }
    dragCells = [];
    dragBad = false;
    const marks = [...shownFound, { id: hit.id, cells: hit.cells }];
    const done = marks.length >= puzzle.words.length;
    const next: WordSearchSave = {
      ...save,
      puzzles: { ...save.puzzles, [puzzle.key]: marks },
      completed: done ? [...new Set([...save.completed, puzzle.key])] : save.completed,
      updatedAt: Date.now(),
    };
    const spoken = puzzle.words.find((word) => word.id === hit.id)?.facts[0] ?? '';
    if (done && spoken) speak(spoken, initialSettings.language);
    save = next;
    persist(next);
    if (done) {
      sfx.win();
      buzz('finish', initialSettings.haptics);
    } else {
      sfx.colorDone();
      buzz('done', initialSettings.haptics);
    }
  }

  function onCancel(event: PointerEvent) {
    if (dragId !== event.pointerId) return;
    dragId = null;
    dragStart = null;
    dragCells = [];
    dragBad = false;
  }
</script>

<div class="word-search">
  <header class="topbar">
    <a class="icon-btn" href={asset('')} aria-label={copy.back}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
    <div class="titles">
      <h1>{copy.title}</h1>
      <p class="sub">{copy.hint}</p>
    </div>
  </header>

  <div class="levels" role="group" aria-label={copy.levels}>
    {#each levels as level (level)}
      <button type="button" aria-pressed={save?.difficulty === level} data-testid="level-{level}" onclick={() => setLevel(level)}>
        {copy[level]}
      </button>
    {/each}
  </div>

  {#if puzzle}
    <div class="pics" style="--pics: {puzzle.words.length}">
      {#each puzzle.words as word (word.id)}
        {@const found = shownFound.some((mark) => mark.id === word.id)}
        <button
          type="button"
          class="pic"
          class:found
          data-testid="picture"
          data-found={found ? 'yes' : 'no'}
          aria-label={found ? copy.hearFound : copy.hear}
          onclick={() => hear(word)}
        >
          <img alt="" draggable="false" src={asset(`art/${word.art}.jpg`)} />
          {#if found}
            <span class="check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M5 12.5 9.2 17 19 7.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="board-wrap">
      <div
        class="board"
        bind:this={boardEl}
        role="grid"
        aria-label={copy.grid}
        data-testid="word-grid"
        style="--n: {puzzle.size}"
        onpointerdown={onDown}
        onpointermove={onMove}
        onpointerup={onUp}
        onpointercancel={onCancel}
        oncontextmenu={(event) => event.preventDefault()}
      >
        <svg class="marks" viewBox="0 0 {puzzle.size} {puzzle.size}" aria-hidden="true">
          {#each shownFound as mark (mark.id)}
            {@const line = capsule(mark.cells)}
            {#if line}
              <line class="found-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={colorFor(puzzle, mark.id)} />
            {/if}
          {/each}
          {#if dragCells.length > 1}
            {@const line = capsule(dragCells)}
            {#if line}
              <line class="live" class:miss={dragBad} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            {/if}
          {/if}
        </svg>
        <div class="cells" bind:this={cellsEl}>
          {#each puzzle.letters as letter, index (index)}
            {@const row = Math.floor(index / puzzle.size)}
            {@const col = index % puzzle.size}
            <span
              class="cell"
              role="gridcell"
              class:hot={dragCells.some((cell) => cell.row === row && cell.col === col)}
              data-row={row}
              data-col={col}
            >{letter}</span>
          {/each}
        </div>
      </div>
    </div>

    {#if complete}
      <div class="done" data-testid="complete" role="status">
        <div class="confetti" aria-hidden="true">
          {#each confetti as piece, i (i)}
            <i style="left:{piece.x}%; background:{piece.color}; animation-delay:{piece.delay}s; animation-duration:{piece.dur}s"></i>
          {/each}
        </div>
        <div class="card-pop">
          <p class="eyebrow">{copy.doneEyebrow}</p>
          <h2>{copy.done}</h2>
          {#if fact}
            <div class="facts-row">
              <ul class="facts">
                <li>{fact}</li>
              </ul>
              <button class="speaker" type="button" data-testid="read-facts" aria-label={copy.readFacts} onclick={readFact}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M4 9.5v5h3.2L12 19V5L7.2 9.5H4Z" fill="currentColor" />
                  <path d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6M17.6 6.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
                {copy.listen}
              </button>
            </div>
          {/if}
          <div class="actions">
            <button class="btn" type="button" data-testid="next-puzzle" onclick={() => shift(1)}>{copy.next}</button>
            <button class="btn secondary" type="button" data-testid="replay" onclick={replay}>{copy.again}</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .word-search {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    background: var(--paper);
    overscroll-behavior: none;
  }

  .word-search .sub {
    color: #2a211e;
  }

  .levels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin: 0 14px 8px;
    padding: 4px;
    background: #efe6da;
    border-radius: 14px;
  }

  .levels button {
    border: 0;
    background: transparent;
    border-radius: 10px;
    min-height: 40px;
    padding: 8px 4px;
    font-weight: 800;
    color: var(--ink);
    touch-action: manipulation;
  }

  .levels button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--paper-2);
  }

  .pics {
    display: grid;
    grid-template-columns: repeat(var(--pics), minmax(0, 104px));
    justify-content: center;
    gap: 8px;
    padding: 2px 12px 8px;
  }

  .pic {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 3px solid transparent;
    border-radius: 16px;
    overflow: hidden;
    background: white;
    box-shadow: 0 4px 12px rgba(80, 50, 30, 0.12);
    touch-action: manipulation;
  }

  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }

  .pic.found {
    border-color: #1f7a4d;
  }

  .check {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #1f7a4d;
    color: white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .board-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0 12px 8px;
  }

  .board {
    position: relative;
    width: min(100%, 100%);
    max-height: 100%;
    aspect-ratio: 1;
    touch-action: none;
    background: #fffdf8;
    border-radius: 22px;
    box-shadow: 0 10px 28px rgba(80, 50, 30, 0.1);
    overflow: hidden;
    container-type: inline-size;
  }

  .marks,
  .cells {
    position: absolute;
    inset: 6px;
  }

  .marks {
    z-index: 0;
    pointer-events: none;
    overflow: visible;
  }

  .marks line {
    stroke-width: 0.84;
    stroke-linecap: round;
  }

  .marks .found-line {
    opacity: 0.95;
  }

  .marks .live {
    stroke: #b7ddfb;
    stroke-width: 0.84;
    opacity: 0.72;
  }

  .marks .live.miss {
    animation: ws-miss 0.46s ease forwards;
  }

  .cells {
    z-index: 1;
    pointer-events: none;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    grid-template-rows: repeat(var(--n), 1fr);
  }

  .cell {
    display: grid;
    place-items: center;
    font-weight: 800;
    line-height: 1;
    color: #140e0c;
    font-size: calc(100cqi / var(--n) * 0.58);
    box-shadow: inset 0 0 0 1px rgba(60, 47, 44, 0.08);
  }

  .cell.hot {
    color: #140e0c;
  }

  .done {
    position: relative;
    z-index: 2;
    margin: 0 12px calc(12px + env(safe-area-inset-bottom));
  }

  .done .card-pop {
    max-height: 34vh;
  }

  .done .confetti {
    position: fixed;
    inset: 0;
    height: auto;
    z-index: 1;
  }

  .done .card-pop {
    position: relative;
    z-index: 2;
  }

  @keyframes ws-miss {
    from { opacity: 0.9; }
    to { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .marks .live.miss { animation: none; opacity: 0.2; }
    .done .confetti { display: none; }
  }
</style>
