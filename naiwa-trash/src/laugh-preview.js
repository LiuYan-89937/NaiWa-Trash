import {FrameAnimator} from './animator.js';

const pet = document.querySelector('#pet');
const play = document.querySelector('#play');
const stop = document.querySelector('#stop');
const feedback = message => { document.querySelector('#feedback').textContent = message; };
async function main() {
  const [catalog, defaults] = await Promise.all([
    fetch('./pet/catalog.json').then(response => response.json()),
    fetch('./config/defaults.json').then(response => response.json()),
  ]);
  const size = defaults.runtime.pet;
  pet.style.width = size.width * size.scale + 'px';
  pet.style.height = size.height * size.scale + 'px';
  const rest = './pet/' + catalog.clips.blink.frames[0];
  pet.src = rest;
  const animator = new FrameAnimator(pet, catalog, './pet/', feedback);
  await animator.preload();
  document.querySelector('#duration').textContent = `约 ${catalog.clips.laugh.audio.duration_seconds.toFixed(1)} 秒 · 大小 ${Math.round(size.scale * 100)}%`;
  play.disabled = false;
  play.textContent = '播放大笑';
  play.addEventListener('click', async () => {
    play.disabled = true;
    stop.disabled = false;
    try { await animator.play('laugh'); }
    catch (error) { feedback(String(error)); }
    finally {
      pet.src = rest;
      play.disabled = false;
      play.textContent = '再笑一次';
      stop.disabled = true;
    }
  });
  stop.addEventListener('click', () => animator.stop());
  window.addEventListener('pagehide', () => animator.stop(), {once: true});
}
main().catch(error => feedback('预览加载失败：' + String(error)));
