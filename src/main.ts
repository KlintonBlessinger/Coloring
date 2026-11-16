import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';
import { APP_NAME } from './lib/brand';
import { loadSettings } from './lib/storage';

document.title = APP_NAME;

registerSW({ immediate: true });

const initialSettings = await loadSettings();
const target = document.getElementById('app');
if (!target) throw new Error('Missing app root');

mount(App, { target, props: { initialSettings } });
