import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { mount } from 'svelte';
import '../../app.css';
import { installAudio } from '../../lib/audio';
import { loadSettings } from '../../lib/storage';
import WordSearch from './WordSearch.svelte';

installAudio();

const initialSettings = await loadSettings();
const target = document.getElementById('app');
if (!target) throw new Error('Missing app root');

mount(WordSearch, { target, props: { initialSettings } });
