import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { animalsIn, FOODS, FOOD_LABELS, type Food, type ZooAnimal } from '../animals/catalog';
import { AREAS, areaById, type AreaId } from '../map/areas';
import { loadProfile, saveProfile } from '../save/db';
import { profileIdFromSearch, type ZooKeeperSave, type ZooSave } from '../save/shape';
import { getPhaser } from './phaser-host';
import { speak } from './speak';
import { createControls, type ZooControls } from './types';
import '../shell.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function installTouchGuards(root: HTMLElement): () => void {
  const block = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-scroll]')) return;
    if (event.cancelable) event.preventDefault();
  };
  const gesture = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  root.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('gesturestart', gesture);
  document.addEventListener('gesturechange', gesture);
  const htmlTouch = document.documentElement.style.touchAction;
  const bodyTouch = document.body.style.touchAction;
  document.documentElement.style.touchAction = 'none';
  document.body.style.touchAction = 'none';
  return () => {
    root.removeEventListener('touchmove', block);
    document.removeEventListener('gesturestart', gesture);
    document.removeEventListener('gesturechange', gesture);
    document.documentElement.style.touchAction = htmlTouch;
    document.body.style.touchAction = bodyTouch;
  };
}

function bindJoystick(joy: HTMLElement, knob: HTMLElement, controls: ZooControls): () => void {
  const max = 42;
  let pointerId = -1;
  const place = (event: PointerEvent) => {
    const rect = joy.getBoundingClientRect();
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    dx = (dx / len) * clamped;
    dy = (dy / len) * clamped;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    controls.joyX = dx / max;
    controls.joyY = dy / max;
    controls.joy = clamped > 10;
  };
  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = -1;
    controls.joy = false;
    controls.joyX = 0;
    controls.joyY = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };
  const down = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    joy.setPointerCapture(event.pointerId);
    place(event);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    place(event);
  };
  joy.addEventListener('pointerdown', down);
  joy.addEventListener('pointermove', move);
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  return () => {
    joy.removeEventListener('pointerdown', down);
    joy.removeEventListener('pointermove', move);
    joy.removeEventListener('pointerup', end);
    joy.removeEventListener('pointercancel', end);
  };
}

export async function mountZoo(host: HTMLElement): Promise<() => void> {
  const profileId = profileIdFromSearch(window.location.search);
  let save = await loadProfile(profileId);
  const controls = createControls();
  const root = el('div', 'zoo-root');
  const stage = el('div', 'zoo-stage');
  const home = el('a', 'zoo-home', 'Color Cozy');
  home.href = import.meta.env.BASE_URL || '/';
  const where = el('p', 'zoo-where', 'Savannah');
  const note = el('p', 'zoo-note');
  note.hidden = true;
  const careButton = el('button', 'zoo-care', 'Care');
  careButton.type = 'button';
  const journalButton = el('button', 'zoo-journal', 'Journal');
  journalButton.type = 'button';
  const panel = el('div', 'zoo-panel');
  panel.hidden = true;
  panel.dataset.scroll = 'true';
  const joy = el('div', 'zoo-joy');
  joy.setAttribute('role', 'application');
  joy.setAttribute('aria-label', 'Joystick. Drag to walk.');
  const knob = el('div', 'zoo-knob');
  joy.append(knob);
  root.append(stage, home, where, note, careButton, journalButton, panel, joy);
  host.replaceChildren(root);

  let areaId: AreaId = 'savannah';
  const open = new Set(save.openAreaIds);
  const unguard = installTouchGuards(root);
  const unjoy = bindJoystick(joy, knob, controls);

  const showNote = (text: string) => {
    note.textContent = text;
    note.hidden = text.length === 0;
  };

  const setPaused = (paused: boolean) => {
    controls.paused = paused;
    panel.hidden = !paused;
    joy.hidden = paused;
    if (!paused) panel.replaceChildren();
  };

  const learn = (animal: ZooAnimal) => {
    if (save.learned.some((row) => row.animalId === animal.id)) return;
    save = {
      ...save,
      learned: [...save.learned, { animalId: animal.id, fact: animal.fact }],
      progress: { ...save.progress, [`fed:${animal.id}`]: true },
      updatedAt: Date.now(),
    };
    void saveProfile(save);
  };

  const showFood = (animal: ZooAnimal) => {
    panel.replaceChildren();
    panel.append(el('h2', '', animal.name), el('p', '', `What should the ${animal.name.toLowerCase()} eat?`));
    for (const food of FOODS) {
      const choice = el('button', '', FOOD_LABELS[food]);
      choice.type = 'button';
      choice.addEventListener('click', () => chooseFood(animal, food));
      panel.append(choice);
    }
    const back = el('button', 'zoo-close', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => showCare());
    panel.append(back);
  };

  const chooseFood = (animal: ZooAnimal, food: Food) => {
    if (food === animal.eats) {
      learn(animal);
      showNote(animal.fact);
      speak(animal.fact);
      showFood(animal);
      const done = el('p', '', 'You helped.');
      panel.insertBefore(done, panel.lastElementChild);
      return;
    }
    showNote(animal.hint);
    speak(animal.hint);
  };

  const showCare = () => {
    const area = areaById(areaId);
    if (!area || !open.has(areaId)) {
      const line = `${area?.name ?? 'This area'} opens later.`;
      showNote(line);
      speak(line);
      return;
    }
    setPaused(true);
    panel.replaceChildren(el('h2', '', area.name), el('p', '', 'Who needs you?'));
    for (const animal of animalsIn(areaId)) {
      const row = el('button', '', save.learned.some((item) => item.animalId === animal.id) ? `${animal.name} · learned` : animal.name);
      row.type = 'button';
      row.addEventListener('click', () => showFood(animal));
      panel.append(row);
    }
    const close = el('button', 'zoo-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => setPaused(false));
    panel.append(close);
  };

  const showJournal = () => {
    setPaused(true);
    panel.replaceChildren(el('h2', '', 'Animal Journal'));
    for (const area of AREAS) {
      panel.append(el('p', 'zoo-area-label', open.has(area.id) ? area.name : `${area.name} · opens later`));
      for (const animal of animalsIn(area.id)) {
        const known = save.learned.find((item) => item.animalId === animal.id);
        const row = el('div', 'zoo-row', known ? `${animal.name}. ${known.fact}` : `${animal.name}. Not yet.`);
        panel.append(row);
      }
    }
    const close = el('button', 'zoo-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => setPaused(false));
    panel.append(close);
  };

  careButton.addEventListener('click', () => {
    if (controls.paused) return;
    showCare();
  });
  journalButton.addEventListener('click', () => {
    if (controls.paused) return;
    showJournal();
  });

  const syncCare = () => {
    careButton.hidden = !open.has(areaId);
  };
  syncCare();

  await ensurePhaser();
  const { ZooScene } = await import('../map/scene');
  const Phaser = getPhaser();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: '#c6a56b',
    banner: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: stage.clientWidth || window.innerWidth,
      height: stage.clientHeight || window.innerHeight,
    },
    audio: { noAudio: true },
    input: { activePointers: 2 },
    scene: ZooScene,
    callbacks: {
      preBoot: (created: { registry: { set: (key: string, value: unknown) => void } }) => {
        created.registry.set('zoo', {
          controls,
          save,
          onArea: (id: string, name: string) => {
            if (areaById(id)) areaId = id as AreaId;
            where.textContent = name;
            syncCare();
          },
          onNote: showNote,
          onSpeak: speak,
          onKeeper: (keeper: ZooKeeperSave) => {
            save = { ...save, keeper, updatedAt: Date.now() };
            void saveProfile(save);
          },
        });
      },
      postBoot: (created: { canvas: HTMLCanvasElement }) => {
        created.canvas.style.touchAction = 'none';
      },
    },
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') void saveProfile(save);
  };
  document.addEventListener('visibilitychange', onHide);

  return () => {
    document.removeEventListener('visibilitychange', onHide);
    unjoy();
    unguard();
    game.destroy(true);
    host.replaceChildren();
  };
}

async function ensurePhaser(): Promise<void> {
  if ((globalThis as { Phaser?: unknown }).Phaser) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/phaser.min.js', import.meta.url).href;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Phaser did not load'));
    document.head.append(script);
  });
}
