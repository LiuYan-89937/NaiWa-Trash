export class FrameAnimator {
  constructor(image, catalog, base, onError) {
    this.image = image;
    this.catalog = catalog;
    this.base = base;
    this.onError = onError;
    this.sounds = new Map();
    this.sound = null;
    this.generation = 0;
    this.timer = null;
    this.wake = null;
  }

  async preload() {
    const paths = new Set(Object.values(this.catalog.clips).flatMap(clip => clip.frames));
    const images = [...paths].map(async path => {
      const image = new Image();
      image.src = this.base + path;
      await image.decode();
    });
    const sounds = Object.entries(this.catalog.clips).filter(([, clip]) => clip.audio).map(async ([id, clip]) => {
      const sound = new Audio(this.base + clip.audio.source);
      sound.preload = 'auto';
      sound.volume = clip.audio.volume;
      try {
        await new Promise((resolve, reject) => {
          const clear = () => {
            sound.removeEventListener('canplaythrough', ready);
            sound.removeEventListener('error', failed);
          };
          const ready = () => { clear(); resolve(); };
          const failed = () => { clear(); reject(new Error(sound.error?.message || clip.audio.source)); };
          sound.addEventListener('canplaythrough', ready);
          sound.addEventListener('error', failed);
          sound.load();
          if (sound.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) ready();
        });
        this.sounds.set(id, sound);
      } catch (error) { this.onError('音频加载失败：' + String(error)); }
    });
    await Promise.all([...images, ...sounds]);
  }

  stop() {
    this.generation++;
    this.sound?.pause();
    this.sound = null;
    clearTimeout(this.timer);
    this.wake?.();
    this.wake = null;
  }

  async play(id, {loop = false} = {}) {
    const clip = this.catalog.clips[id];
    if (!clip) throw new Error('找不到动作：' + id);
    this.stop();
    const generation = this.generation;
    const registration = clip.registration;
    this.image.style.transformOrigin = '0 0';
    this.image.style.transform = registration
      ? `translate(${registration.x / this.catalog.width * 100}%, ${registration.y / this.catalog.height * 100}%) scale(${registration.scale})`
      : 'none';
    let sound = this.sounds.get(id);
    if (sound) {
      this.sound = sound;
      sound.currentTime = 0;
      try { await sound.play(); }
      catch (error) {
        if (generation !== this.generation) return false;
        this.onError('笑声音频无法播放：' + String(error));
        sound = null;
      }
    }
    do {
      for (const step of clip.sequence) {
        if (generation !== this.generation) return false;
        if (sound?.ended) return true;
        this.image.src = this.base + clip.frames[step.frame];
        await new Promise(resolve => {
          this.wake = resolve;
          this.timer = setTimeout(resolve, step.duration);
        });
      }
    } while ((loop || (sound && !sound.ended)) && generation === this.generation);
    return generation === this.generation;
  }
}
