const lerp = (a, b, t) => a + (b - a) * t;
const clamp = t => Math.max(0, Math.min(1, t));
const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => t * t * (3 - 2 * t);
const curve = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;

function paperPath(ctx, width, height, fold) {
  ctx.beginPath();
  ctx.moveTo(-width / 2, -height / 2);
  ctx.lineTo(width / 2 - fold, -height / 2);
  ctx.lineTo(width / 2, -height / 2 + fold);
  ctx.lineTo(width / 2, height / 2);
  ctx.quadraticCurveTo(width / 2, height / 2 + 2, width / 2 - 2, height / 2 + 2);
  ctx.lineTo(-width / 2 + 2, height / 2 + 2);
  ctx.quadraticCurveTo(-width / 2, height / 2 + 2, -width / 2, height / 2);
  ctx.closePath();
}

function drawPaper(ctx, card, pose, width, height, remaining, cfg) {
  if (remaining <= 0) return;
  const fold = width * 0.2;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rotation);
  ctx.scale(pose.scale, pose.scale);
  ctx.globalAlpha = pose.opacity;
  if (remaining < width) {
    ctx.beginPath();
    ctx.rect(-width / 2 - 3, -height / 2 - 4, remaining + 3, height + 11);
    ctx.clip();
  }
  const shade = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  shade.addColorStop(0, cfg.paper_highlight);
  shade.addColorStop(1, card.color);
  ctx.fillStyle = shade;
  ctx.shadowColor = cfg.shadow;
  ctx.shadowBlur = width * 0.12;
  ctx.shadowOffsetY = width * 0.05;
  paperPath(ctx, width, height, fold);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = cfg.outline;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - fold, -height / 2);
  ctx.lineTo(width / 2 - fold, -height / 2 + fold);
  ctx.lineTo(width / 2, -height / 2 + fold);
  ctx.closePath();
  ctx.fillStyle = cfg.fold;
  ctx.fill();
  ctx.fillStyle = cfg.ink;
  ctx.font = '700 ' + Math.round(width * 0.17) + 'px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(card.extension, -width * 0.33, -height * 0.12, width * 0.7);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, width * 0.035);
  for (let line = 0; line < cfg.text_lines; line++) {
    const y = height * (0.08 + line * 0.13);
    ctx.globalAlpha = pose.opacity * 0.35;
    ctx.beginPath();
    ctx.moveTo(-width * 0.31, y);
    ctx.lineTo(width * (line === cfg.text_lines - 1 ? 0.02 : 0.26), y);
    ctx.strokeStyle = cfg.ink;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRibbon(ctx, ribbon, origin, mouth, progress, width, height, card, cfg) {
  const t = easeInOut(progress);
  const x = curve(origin.x, lerp(origin.x, mouth.x, 0.6), mouth.x, t);
  const y = curve(origin.y, origin.y - height * ribbon.lift, mouth.y, t);
  const length = height * (1 - t ** 2);
  const breadth = width * (1 - t ** 3);
  const curl = Math.sin(progress * Math.PI) * width * cfg.curl;
  const heading = Math.atan2(mouth.y - origin.y, mouth.x - origin.x) - Math.PI / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lerp(cfg.feed_rotation, heading, t));
  ctx.globalAlpha = 1 - progress ** 5;
  const points = [];
  for (let i = 0; i <= cfg.ribbon_segments; i++) {
    const along = i / cfg.ribbon_segments;
    const wave = Math.sin(along * Math.PI * 2 - progress * cfg.flutter_cycles * Math.PI * 2 + ribbon.phase);
    points.push({x: wave * curl * Math.sin(along * Math.PI),
      y: (along - 0.5) * length});
  }
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (i === 0) ctx.moveTo(point.x - breadth / 2, point.y);
    else ctx.lineTo(point.x - breadth / 2, point.y);
  }
  for (let i = points.length - 1; i >= 0; i--) {
    ctx.lineTo(points[i].x + breadth / 2, points[i].y);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-breadth, -length / 2, breadth, length / 2);
  gradient.addColorStop(0, cfg.paper_highlight);
  gradient.addColorStop(0.5, card.color);
  gradient.addColorStop(1, cfg.fold);
  ctx.fillStyle = gradient;
  ctx.shadowColor = cfg.shadow;
  ctx.shadowBlur = breadth * 0.8;
  ctx.shadowOffsetY = breadth * 0.25;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = cfg.outline;
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.restore();
}

function drawSparkles(ctx, mouth, t, radius, cfg) {
  if (t < 0 || t > 1) return;
  ctx.save();
  ctx.globalAlpha = Math.sin(t * Math.PI) * 0.75;
  ctx.strokeStyle = cfg.ink;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let index = 0; index < cfg.sparkles; index++) {
    const angle = Math.PI + (index / Math.max(1, cfg.sparkles - 1) - 0.5) * Math.PI;
    const x = mouth.x + Math.cos(angle) * radius * (0.4 + t);
    const y = mouth.y + Math.sin(angle) * radius * (0.4 + t);
    const size = radius * 0.15 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
  ctx.restore();
}

export class Shredder {
  constructor(canvas, pet, config) {
    this.canvas = canvas;
    this.pet = pet;
    this.config = config;
    this.context = canvas.getContext('2d');
  }

  async eat(names) {
    if (!names.length) return;
    const {canvas, context: ctx, config: cfg} = this;
    const bounds = canvas.getBoundingClientRect();
    const pet = this.pet.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const mouth = {x: pet.left - bounds.left + pet.width * cfg.mouth.x,
      y: pet.top - bounds.top + pet.height * cfg.mouth.y};
    const width = pet.width * cfg.paper_width_ratio;
    const height = width * cfg.paper_height_ratio;
    const dock = {x: Math.max(width * 0.7, mouth.x - width * 1.2),
      y: Math.max(height * 0.6, mouth.y - height * 0.45)};
    const cards = names.slice(0, cfg.max_visible_files).map((name, index) => ({
      extension: (name.includes('.') ? name.split('.').at(-1) : 'FILE').slice(0, 6).toUpperCase(),
      color: cfg.colors[index % cfg.colors.length], delay: index * cfg.stagger_ms,
      start: {x: Math.max(width * 0.7, dock.x - width * 0.55),
        y: Math.max(height * 0.6, dock.y - height * 0.9)},
      ribbons: Array.from({length: cfg.columns}, (_, column) => ({
        column, delay: (cfg.columns - 1 - column) * cfg.tear_stagger_ms,
        phase: Math.random() * Math.PI * 2, lift: 0.2 + Math.random() * 0.35,
      })),
    }));
    const tearEnd = cfg.approach_ms + (cfg.columns - 1) * cfg.tear_stagger_ms + cfg.flight_ms;
    const duration = tearEnd + cfg.finish_ms + cards.at(-1).delay;
    await new Promise(resolve => {
      const start = performance.now();
      const paint = now => {
        const elapsed = now - start;
        ctx.clearRect(0, 0, bounds.width, bounds.height);
        for (const card of [...cards].reverse()) {
          const age = elapsed - card.delay;
          if (age < 0 || age > tearEnd + cfg.finish_ms) continue;
          const approach = easeOut(clamp(age / cfg.approach_ms));
          const pose = {
            x: lerp(card.start.x, dock.x, approach),
            y: lerp(card.start.y, dock.y, approach),
            rotation: lerp(cfg.entry_rotation, cfg.feed_rotation, approach),
            scale: lerp(0.8, 1, approach), opacity: clamp(approach * 3),
          };
          const launched = card.ribbons.filter(ribbon => age >= cfg.approach_ms + ribbon.delay).length;
          const stripWidth = width / cfg.columns;
          drawPaper(ctx, card, pose, width, height, width - launched * stripWidth, cfg);
          for (const ribbon of card.ribbons) {
            const progress = (age - cfg.approach_ms - ribbon.delay) / cfg.flight_ms;
            if (progress < 0 || progress >= 1) continue;
            const offset = -width / 2 + (ribbon.column + 0.5) * stripWidth;
            const origin = {x: dock.x + offset * Math.cos(cfg.feed_rotation),
              y: dock.y + offset * Math.sin(cfg.feed_rotation)};
            drawRibbon(ctx, ribbon, origin, mouth, progress, stripWidth, height, card, cfg);
          }
          drawSparkles(ctx, mouth, (age - tearEnd) / cfg.finish_ms, width * 0.32, cfg);
        }
        if (elapsed < duration) requestAnimationFrame(paint);
        else { ctx.clearRect(0, 0, bounds.width, bounds.height); resolve(); }
      };
      requestAnimationFrame(paint);
    });
  }
}
