import { mountZoo } from './engine/shell';

const host = document.querySelector('#zoo');
if (host instanceof HTMLElement) {
  document.title = 'Little Zookeeper';
  void mountZoo(host);
}
