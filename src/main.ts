import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import Shell from './landing/Shell.svelte';
import './app.css';
import { legacyColorTarget, siteBase } from './lib/games/paths';

const base = siteBase();
const next = legacyColorTarget(base, window.location.pathname, window.location.search);
const here = `${window.location.pathname}${window.location.search}`;
if (next && next !== here) {
  window.location.replace(`${next}${window.location.hash}`);
} else {
  registerSW({ immediate: true });

  const target = document.getElementById('app');
  if (!target) throw new Error('Missing app root');

  mount(Shell, { target });
}
