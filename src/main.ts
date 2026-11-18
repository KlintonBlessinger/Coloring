import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';
import { installAudio } from './lib/audio';
import { APP_NAME } from './lib/brand';
import { load as loadWordSearch } from './lib/games/entries/word-search';
import { isWordSearchPath } from './lib/games/word-search/route';
import { loadSettings } from './lib/storage';

document.title = APP_NAME;
installAudio();

registerSW({ immediate: true });

const initialSettings = await loadSettings();
const target = document.getElementById('app');
if (!target) throw new Error('Missing app root');

if (isWordSearchPath(window.location.pathname, import.meta.env.BASE_URL)) {
  const { default: WordSearch } = await loadWordSearch();
  mount(WordSearch, { target, props: { initialSettings } });
} else {
  mount(App, { target, props: { initialSettings } });
}
