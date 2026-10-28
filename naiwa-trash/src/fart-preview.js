import {FrameAnimator} from './animator.js';
import {fartDurationMs} from './fart-duration.js';
import {GasJet} from './gas-jet.js';

const pet = document.querySelector('#pet');
const play = document.querySelector('#play');
const stop = document.querySelector('#stop');
const items = document.querySelector('#items');
const duration = document.querySelector('#duration');
const feedback = message => { document.querySelector('#feedback').textContent = message; };
async function main() {
  const [catalog, defaults] = await Promise.all([
    fetch('./pet/catalog.json').then(response => response.json()),
    fetch('./config/defaults.json').then(response => response.json()),
  ]);
  const size = defaults.runtime.pet;
  const policy = defaults.runtime.fart;
  pet.style.width = size.width * size.scale + 'px';
  pet.style.height = size.height * size.scale + 'px';
  const rest = './pet/' + catalog.clips.blink.frames[0];
  pet.src = rest;
  items.value = policy.preview_items;
  const updateDuration = () => {
    const count = Number(items.value);
    if (!Number.isSafeInteger(count) || count < 1) {
      duration.textContent = '请输入大于零的整数';
      play.disabled = true;
      return;
    }
    duration.textContent = `约 ${(fartDurationMs(count, policy) / 1000).toFixed(1)} 秒 · 最长 ${policy.max_ms / 1000} 秒`;
    play.disabled = false;
  };
  const animator = new FrameAnimator(pet, catalog, './pet/', feedback);
  const gas = new GasJet(document.querySelector('#gas'), pet, policy.jet);
  await animator.preload();
  items.addEventListener('input', updateDuration);
  updateDuration();
  play.textContent = '播放放屁';
  play.addEventListener('click', async () => {
    const durationMs = fartDurationMs(Number(items.value), policy);
    play.disabled = true;
    items.disabled = true;
    stop.disabled = false;
    feedback('');
    try { await animator.play('fart', {durationMs,
      onCycleChange: active => active ? gas.start() : gas.stop()}); }
    catch (error) { feedback(String(error)); }
    finally {
      pet.src = rest;
      pet.style.transform = 'none';
      items.disabled = false;
      updateDuration();
      play.textContent = '再放一次';
      stop.disabled = true;
    }
  });
  stop.addEventListener('click', () => animator.stop());
  window.addEventListener('pagehide', () => { animator.stop(); gas.clear(); }, {once: true});
}
main().catch(error => feedback('预览加载失败：' + String(error)));
