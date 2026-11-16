<script lang="ts">
  import { untrack } from 'svelte';
  import Gallery from './components/Gallery.svelte';
  import PlayView from './components/PlayView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import { getPuzzle } from './lib/catalog';
  import type { Settings } from './lib/settings';
  import { loadAllProgress, saveSettings, type ProgressSave } from './lib/storage';

  let { initialSettings }: { initialSettings: Settings } = $props();

  type Screen = 'gallery' | 'play' | 'settings';

  let settings = $state(untrack(() => initialSettings));
  let screen = $state<Screen>('gallery');
  let puzzleId = $state<string | null>(null);
  let progress = $state<Record<string, ProgressSave>>({});

  function show(state: { screen?: Screen; puzzleId?: string | null } | null) {
    if (state?.screen === 'play' && state.puzzleId && getPuzzle(state.puzzleId)) {
      screen = 'play';
      puzzleId = state.puzzleId;
      return;
    }
    if (state?.screen === 'settings') {
      screen = 'settings';
      puzzleId = null;
      return;
    }
    screen = 'gallery';
    puzzleId = null;
  }

  $effect(() => {
    if (!history.state || !history.state.screen) history.replaceState({ screen: 'gallery' }, '');
    show(history.state);
    const onPop = () => show(history.state);
    window.addEventListener('popstate', onPop);
    void loadAllProgress().then((saved) => {
      progress = saved;
    });
    return () => window.removeEventListener('popstate', onPop);
  });

  function openPuzzle(id: string) {
    history.pushState({ screen: 'play', puzzleId: id }, '');
    show(history.state);
  }

  function openSettings() {
    history.pushState({ screen: 'settings' }, '');
    show(history.state);
  }

  function back() {
    history.back();
  }

  function updateSettings(next: Settings) {
    settings = next;
    void saveSettings(next);
  }
</script>

<div class="app">
  {#if screen === 'play' && puzzleId}
    {#key puzzleId}
      <PlayView
        {puzzleId}
        {settings}
        onBack={back}
        onSaved={(id, save) => {
          progress = { ...progress, [id]: save };
        }}
      />
    {/key}
  {:else if screen === 'settings'}
    <SettingsPanel
      {settings}
      onBack={back}
      onChange={updateSettings}
      onProgress={(next) => {
        progress = next;
      }}
      onSettings={(next) => {
        settings = next;
      }}
    />
  {:else}
    <Gallery {progress} onOpen={openPuzzle} onSettings={openSettings} />
  {/if}
</div>
