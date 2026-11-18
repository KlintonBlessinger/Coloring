<script lang="ts">
  import App from '../App.svelte';
  import { installAudio } from '../lib/audio';
  import type { Settings } from '../lib/settings';
  import { loadSettings } from '../lib/storage';

  let settings = $state<Settings | null>(null);

  $effect(() => {
    installAudio();
    let live = true;
    void loadSettings().then((value) => {
      if (live) settings = value;
    });
    return () => {
      live = false;
    };
  });
</script>

{#if settings}
  <App initialSettings={settings} />
{:else}
  <div class="screen">
    <p class="lede shelf-wait">Opening Color Cozy…</p>
  </div>
{/if}
