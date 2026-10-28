export class FrameAnimator {
  constructor(image, catalog, base) {
    this.image = image;
    this.catalog = catalog;
    this.base = base;
    this.generation = 0;
    this.timer = null;
    this.wake = null;
  }

  async preload() {
    const paths = new Set(Object.values(this.catalog.clips).flatMap(clip => clip.frames));
    await Promise.all([...paths].map(async path => {
      const image = new Image();
      image.src = this.base + path;
      await image.decode();
    }));
  }

  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.wake?.();
    this.wake = null;
  }

  async play(id, {loop = false} = {}) {
    const clip = this.catalog.clips[id];
    if (!clip) throw new Error('找不到动作：' + id);
    this.stop();
    const generation = this.generation;
    do {
      for (const step of clip.sequence) {
        if (generation !== this.generation) return false;
        this.image.src = this.base + clip.frames[step.frame];
        await new Promise(resolve => {
          this.wake = resolve;
          this.timer = setTimeout(resolve, step.duration);
        });
      }
    } while (loop && generation === this.generation);
    return generation === this.generation;
  }
}
