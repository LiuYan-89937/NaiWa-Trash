const lerp = (from, to, t) => from + (to - from) * t;
const curve = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;

export class Shredder {
  constructor(canvas, pet, config) {
    this.canvas = canvas;
    this.pet = pet;
    this.config = config;
    this.context = canvas.getContext('2d');
  }

  async eat(names) {
    const {canvas, context: ctx, config: cfg} = this;
    const bounds = canvas.getBoundingClientRect();
    const pet = this.pet.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const mouth = {
      x: pet.left - bounds.left + pet.width * cfg.mouth.x,
      y: pet.top - bounds.top + pet.height * cfg.mouth.y,
    };
    const count = Math.min(names.length, cfg.max_visible_files);
    const cards = Array.from({length: count}, (_, index) => ({
      name: names[index],
      color: cfg.colors[index % cfg.colors.length],
      delay: index * cfg.stagger_ms,
      x: Math.max(cfg.paper_width, mouth.x - cfg.paper_width * 1.6),
      y: Math.max(cfg.paper_height / 2, mouth.y - cfg.paper_height * 1.1),
      pieces: Array.from({length: cfg.rows * cfg.columns}, (_, part) => ({
        column: part % cfg.columns, row: Math.floor(part / cfg.columns),
        scatter: (Math.random() - 0.5) * cfg.spread,
        rotation: (Math.random() - 0.5) * Math.PI,
      })),
    }));
    const duration = cfg.duration_ms + Math.max(0, count - 1) * cfg.stagger_ms;
    await new Promise(resolve => {
      const start = performance.now();
      const paint = now => {
        const elapsed = now - start;
        ctx.clearRect(0, 0, bounds.width, bounds.height);
        for (const card of cards) {
          const t = Math.min(1, Math.max(0, (elapsed - card.delay) / cfg.duration_ms));
          if (elapsed < card.delay || t >= 1) continue;
          if (t < 0.3) {
            ctx.save();
            ctx.translate(card.x, card.y);
            ctx.globalAlpha = Math.min(1, t / 0.1);
            ctx.rotate((1 - t / 0.3) * -0.15);
            ctx.fillStyle = card.color;
            ctx.strokeStyle = '#aeaa94';
            ctx.lineWidth = 1;
            ctx.fillRect(-cfg.paper_width / 2, -cfg.paper_height / 2, cfg.paper_width, cfg.paper_height);
            ctx.strokeRect(-cfg.paper_width / 2, -cfg.paper_height / 2, cfg.paper_width, cfg.paper_height);
            ctx.fillStyle = '#6e7159';
            ctx.font = '600 9px system-ui';
            ctx.textAlign = 'center';
            const extension = card.name.includes('.') ? card.name.split('.').at(-1) : 'FILE';
            ctx.fillText(extension.slice(0, 6).toUpperCase(), 0, 2);
            ctx.restore();
          } else {
            const progress = (t - 0.3) / 0.7;
            const width = cfg.paper_width / cfg.columns;
            const height = cfg.paper_height / cfg.rows;
            for (const piece of card.pieces) {
              const px = card.x - cfg.paper_width / 2 + (piece.column + 0.5) * width;
              const py = card.y - cfg.paper_height / 2 + (piece.row + 0.5) * height;
              ctx.save();
              ctx.translate(
                curve(px, lerp(px, mouth.x, 0.65) + piece.scatter, mouth.x, progress),
                curve(py, mouth.y + piece.scatter, mouth.y, progress),
              );
              ctx.rotate(piece.rotation * Math.sin(progress * Math.PI));
              const scale = 1 - progress ** 3;
              ctx.scale(scale, scale);
              ctx.globalAlpha = 1 - progress ** 5;
              ctx.fillStyle = card.color;
              ctx.strokeStyle = '#c7c4b2';
              ctx.lineWidth = 0.5;
              ctx.fillRect(-width / 2, -height / 2, width * 0.82, height * 0.92);
              ctx.strokeRect(-width / 2, -height / 2, width * 0.82, height * 0.92);
              ctx.restore();
            }
          }
        }
        if (elapsed < duration) requestAnimationFrame(paint);
        else { ctx.clearRect(0, 0, bounds.width, bounds.height); resolve(); }
      };
      requestAnimationFrame(paint);
    });
  }
}
