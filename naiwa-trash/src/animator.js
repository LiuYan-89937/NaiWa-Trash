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
    if (this.sound) {
      this.sound.pause();
      this.sound.loop = false;
    }
    this.sound = null;
    clearTimeout(this.timer);
    this.wake?.();
    this.wake = null;
  }

  async play(id, {loop = false, durationMs, onCycleChange} = {}) {
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
    if (clip.cycle && Number.isFinite(durationMs)) {
      return this.playTimed(clip, sound, generation, durationMs, onCycleChange);
    }
    if (sound) {
      this.sound = sound;
      sound.currentTime = 0;
      try { await sound.play(); }
      catch (error) {
        if (generation !== this.generation) return false;
        this.onError('音频无法播放：' + String(error));
        sound.loop = false;
        this.sound = null;
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

  async playTimed(clip, sound, generation, durationMs, onCycleChange) {
    const {start, end} = clip.cycle;
    const intro = clip.sequence.slice(0, start);
    const cycle = clip.sequence.slice(start, end);
    const outro = clip.sequence.slice(end);
    if (!cycle.length) throw new Error('动作的循环段为空：' + clip.label);
    const endTime = performance.now() + durationMs;
    const loopEnd = endTime - outro.reduce((sum, step) => sum + step.duration, 0);
    const playSteps = async (steps, deadline) => {
      for (const step of steps) {
        if (generation !== this.generation) return false;
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        this.image.src = this.base + clip.frames[step.frame];
        await new Promise(resolve => {
          this.wake = resolve;
          this.timer = setTimeout(resolve, Math.min(step.duration, remaining));
        });
      }
      return generation === this.generation;
    };
    if (!await playSteps(intro, loopEnd)) return false;
    if (performance.now() < loopEnd) {
      this.image.src = this.base + clip.frames[cycle[0].frame];
      onCycleChange?.(true);
      try {
        if (sound) {
          this.sound = sound;
          sound.currentTime = 0;
          sound.loop = true;
          try { await sound.play(); }
          catch (error) {
            if (generation !== this.generation) return false;
            this.onError('音频无法播放：' + String(error));
            sound.loop = false;
            this.sound = null;
            sound = null;
          }
        }
        while (generation === this.generation && performance.now() < loopEnd) {
          if (!await playSteps(cycle, loopEnd)) return false;
        }
      } finally {
        onCycleChange?.(false);
        if (sound && this.sound === sound) {
          sound.pause();
          sound.loop = false;
          this.sound = null;
        }
      }
    }
    return playSteps(outro, endTime);
  }
}
