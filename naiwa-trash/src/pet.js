import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {LogicalSize} from '@tauri-apps/api/dpi';
import defaults from '../config/defaults.json';
import {FrameAnimator} from './animator.js';
import {Shredder} from './shredder.js';
import {PetController} from './controller.js';
import {bindPetGesture} from './pet-gesture.js';
import './pet.css';

const pet = document.querySelector('#pet');
const stage = document.querySelector('#stage');
const toast = document.querySelector('#toast');
const windowHandle = getCurrentWindow();
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('shown'), defaults.runtime.toast_duration_ms);
}
const invokeAction = (command, args) => invoke(command, args).catch(error => notify(String(error)));
document.querySelector('#settings').addEventListener('click', () => invokeAction('show_settings'));
stage.addEventListener('contextmenu', event => {
  event.preventDefault();
  invokeAction('show_settings');
});
document.querySelector('#move').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  windowHandle.startDragging().catch(error => notify(String(error)));
});

async function main() {
  const catalog = await fetch('./pet/catalog.json').then(response => response.json());
  const animator = new FrameAnimator(pet, catalog, './pet/', notify);
  await animator.preload();
  const controller = new PetController({
    animator, runtime: defaults.runtime,
    shredder: new Shredder(document.querySelector('#shreds'), pet, defaults.runtime.shred),
    recycle: token => invoke('recycle_drop', {token}), notify,
    showBusy: value => stage.classList.toggle('busy', value),
  });
  bindPetGesture(pet, {
    distance: defaults.runtime.interaction.drag_threshold_px,
    drag: () => windowHandle.startDragging(),
    click: () => controller.clicked(), onError: notify,
  });
  let scale;
  let pixelRatio = await windowHandle.scaleFactor();
  async function updateState(state) {
    const nextScale = state.settings.pet_scale * defaults.runtime.pet.scale;
    if (scale === nextScale) return;
    scale = nextScale;
    document.documentElement.style.setProperty('--pet-width', defaults.runtime.pet.width * scale + 'px');
    document.documentElement.style.setProperty('--pet-height', defaults.runtime.pet.height * scale + 'px');
    await windowHandle.setSize(new LogicalSize(
      defaults.runtime.pet.window_width * scale, defaults.runtime.pet.window_height * scale,
    ));
    pixelRatio = await windowHandle.scaleFactor();
  }
  function hit(x, y) {
    const rect = pet.getBoundingClientRect();
    const px = x / pixelRatio, py = y / pixelRatio;
    return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
  }
  const cleanup = [];
  cleanup.push(await windowHandle.onScaleChanged(({payload}) => { pixelRatio = payload.scaleFactor; }));
  cleanup.push(await windowHandle.onDragDropEvent(event => {
    const drop = event.payload;
    if (drop.type === 'enter' || drop.type === 'over') {
      const active = hit(drop.position.x, drop.position.y);
      stage.classList.toggle('hovering', active);
      controller.hover(active);
    } else if (drop.type === 'leave' || drop.type === 'drop') {
      stage.classList.remove('hovering');
      controller.hover(false);
    }
  }));
  cleanup.push(await listen('files-dropped', ({payload}) => {
    if (hit(payload.x, payload.y)) controller.feed(payload.token, payload.count);
    else invokeAction('discard_drop', {token: payload.token});
  }));
  cleanup.push(await listen('cleanup-complete', ({payload}) => controller.cleaned(payload)));
  cleanup.push(await listen('operation-error', ({payload}) => notify(payload)));
  cleanup.push(await listen('state-changed', ({payload}) => updateState(payload).catch(error => notify(String(error)))));
  await updateState(await invoke('get_state'));
  window.addEventListener('pagehide', () => cleanup.forEach(unlisten => unlisten()), {once: true});
  controller.idle();
}
main().catch(error => notify('奶蛙启动失败：' + String(error)));
