import { getPhaser } from '../engine/phaser-host';
import type { ZooHooks } from '../engine/types';
import type { ZooKeeperSave } from '../save/shape';
import { HABITAT_ART, KEEPER_META, KEEPER_URL, PATH_URL } from './art';
import {
  AREAS,
  DEFAULT_KEEPER,
  MAP_TILES_X,
  MAP_TILES_Y,
  TILE,
  WORLD_H,
  WORLD_W,
  blockedArea,
  cardPixels,
  cropBox,
  feetWalkable,
  isWalkableTile,
  nearestArea,
  pixelToTile,
  tileCenter,
  type AreaId,
} from './areas';
import { findPath, nearestWalkable, stepJoy, stepToward } from './walk';

const Phaser = getPhaser();
const KEEPER_HEIGHT = 250;

interface SourceImage {
  width: number;
  height: number;
}

export class ZooScene extends Phaser.Scene {
  private hooks!: ZooHooks;
  private open = new Set<string>();
  private keeper!: { setPosition: (x: number, y: number) => void; setFlipX: (flip: boolean) => void; play: (key: string, ignore?: boolean) => void; anims: { currentAnim?: { key?: string } } };
  private feetX = DEFAULT_KEEPER.x;
  private feetY = DEFAULT_KEEPER.y;
  private facing: 'left' | 'right' = 'right';
  private path: { x: number; y: number }[] = [];
  private areaId = '';
  private wasJoy = false;

  constructor() {
    super('zoo');
  }

  init(): void {
    this.hooks = this.game.registry.get('zoo') as ZooHooks;
    this.open = new Set(this.hooks.save.openAreaIds);
    this.open.add('savannah');
  }

  preload(): void {
    this.load.image('path', PATH_URL);
    this.load.spritesheet('keeper', KEEPER_URL, {
      frameWidth: KEEPER_META.frameWidth,
      frameHeight: KEEPER_META.frameHeight,
    });
    for (const [id, url] of Object.entries(HABITAT_ART)) this.load.image(id, url);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#c6a56b');
    this.input.mouse?.disableContextMenu();
    const spawn = this.snap(this.hooks.save.keeper);
    this.feetX = spawn.x;
    this.feetY = spawn.y;
    this.facing = spawn.facing;
    this.paintMap();
    this.keeper = this.add.sprite(this.feetX, this.feetY, 'keeper', 0).setOrigin(0.5, 1).setScale(KEEPER_HEIGHT / KEEPER_META.frameHeight).setDepth(10);
    this.anims.create({
      key: 'idle',
      frames: this.anims.generateFrameNumbers('keeper', { start: 0, end: KEEPER_META.idleFrames - 1 }),
      frameRate: 2,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('keeper', {
        start: KEEPER_META.idleFrames,
        end: KEEPER_META.idleFrames + KEEPER_META.walkFrames - 1,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.keeper.play('idle');
    this.fit();
    this.scale.on('resize', () => this.fit());
    this.input.on('pointerup', (pointer: { worldX: number; worldY: number; getDistance: () => number }) => {
      if (this.hooks.controls.paused || this.hooks.controls.joy) return;
      if (pointer.getDistance() > 18) return;
      this.walkTo(pointer.worldX, pointer.worldY);
    });
    const hide = () => {
      if (document.visibilityState === 'hidden') this.hooks.onKeeper(this.keeperSave());
    };
    document.addEventListener('visibilitychange', hide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', hide));
    this.syncArea(false);
    if (spawn.x !== this.hooks.save.keeper.x || spawn.y !== this.hooks.save.keeper.y) this.hooks.onKeeper(this.keeperSave());
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const joy = this.hooks.controls;
    let moving = false;
    if (joy.paused) {
      this.path = [];
    } else if (joy.joy) {
      this.path = [];
      const step = stepJoy(this.feetX, this.feetY, joy.joyX, joy.joyY, dt, this.open);
      this.face(step.x, step.y);
      this.feetX = step.x;
      this.feetY = step.y;
      moving = step.moving;
      this.wasJoy = true;
      this.syncArea(true);
    } else {
      if (this.wasJoy) {
        this.wasJoy = false;
        this.hooks.onKeeper(this.keeperSave());
      }
      moving = this.follow(dt);
      this.syncArea(false);
    }
    this.keeper.setPosition(this.feetX, this.feetY);
    this.keeper.setFlipX(this.facing === 'left');
    const anim = moving ? 'walk' : 'idle';
    if (this.keeper.anims.currentAnim?.key !== anim) this.keeper.play(anim, true);
  }

  private paintMap(): void {
    const data: number[][] = [];
    for (let ty = 0; ty < MAP_TILES_Y; ty += 1) {
      const row: number[] = [];
      for (let tx = 0; tx < MAP_TILES_X; tx += 1) row.push(isWalkableTile(tx, ty, this.open) ? 1 : 0);
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('path', 'path', TILE, TILE, 0, 0, 1);
    map.createLayer(0, tiles, 0, 0)?.setDepth(0);
    for (const area of AREAS) {
      area.cards.forEach((card, index) => {
        const align = area.id === 'birds' ? (index === 0 ? 'center' : 'right') : 'center';
        this.paintCard(area.id, card, align, `${area.id}-${index}`);
        const px = cardPixels(card);
        const closed = !this.open.has(area.id);
        this.add
          .text(px.x + 12, px.y + 12, closed ? `${area.name}\nOpens later` : area.name, {
            fontFamily: 'Nunito, sans-serif',
            fontSize: '52px',
            fontStyle: 'bold',
            color: '#3c2f2c',
            backgroundColor: '#fffaf3',
            padding: { x: 8, y: 6 },
            wordWrap: { width: px.w - 24 },
          })
          .setOrigin(0, 0)
          .setDepth(20);
      });
    }
  }

  private paintCard(areaId: AreaId, card: { tileX: number; tileY: number; tileW: number; tileH: number }, align: 'left' | 'center' | 'right', key: string): void {
    const source = this.textures.get(areaId).getSourceImage() as SourceImage;
    const box = cropBox(source.width, source.height, card.tileW / card.tileH, align);
    const canvas = document.createElement('canvas');
    canvas.width = box.sw;
    canvas.height = box.sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(source as CanvasImageSource, box.sx, box.sy, box.sw, box.sh, 0, 0, box.sw, box.sh);
    this.textures.addCanvas(key, canvas);
    const px = cardPixels(card);
    this.add.image(px.x, px.y, key).setOrigin(0, 0).setDisplaySize(px.w, px.h).setDepth(2);
  }

  private fit(): void {
    const cam = this.cameras.main;
    cam.setZoom(Math.min(cam.width / WORLD_W, cam.height / WORLD_H));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  private snap(keeper: ZooKeeperSave): ZooKeeperSave {
    if (feetWalkable(keeper.x, keeper.y, this.open)) return keeper;
    const near = nearestWalkable(pixelToTile(keeper.x), pixelToTile(keeper.y), this.open);
    if (!near) return { ...DEFAULT_KEEPER };
    const center = tileCenter(near.tx, near.ty);
    return { x: center.x, y: center.y, facing: keeper.facing };
  }

  private walkTo(worldX: number, worldY: number): void {
    const blocked = blockedArea(pixelToTile(worldX), pixelToTile(worldY), this.open);
    if (blocked) {
      const line = `${blocked.name} opens later.`;
      this.hooks.onNote(line);
      this.hooks.onSpeak(line);
    } else {
      this.hooks.onNote('');
      this.hooks.onSpeak(nearestArea(pixelToTile(worldX), pixelToTile(worldY)).name);
    }
    this.path = findPath(this.feetX, this.feetY, worldX, worldY, this.open);
  }

  private follow(dt: number): boolean {
    const point = this.path[0];
    if (!point) return false;
    const step = stepToward(this.feetX, this.feetY, point.x, point.y, dt, this.open);
    this.face(step.x, step.y);
    this.feetX = step.x;
    this.feetY = step.y;
    if (step.arrived) this.path.shift();
    if (this.path.length === 0) this.hooks.onKeeper(this.keeperSave());
    return true;
  }

  private face(x: number, y: number): void {
    if (x < this.feetX - 0.5) this.facing = 'left';
    else if (x > this.feetX + 0.5) this.facing = 'right';
  }

  private syncArea(announce: boolean): void {
    const area = nearestArea(pixelToTile(this.feetX), pixelToTile(this.feetY));
    if (area.id === this.areaId) return;
    this.areaId = area.id;
    this.hooks.onArea(area.id, area.name);
    if (announce) this.hooks.onSpeak(area.name);
  }

  private keeperSave(): ZooKeeperSave {
    return { x: this.feetX, y: this.feetY, facing: this.facing };
  }
}
