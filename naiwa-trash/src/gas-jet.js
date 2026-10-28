export class GasJet {
  constructor(canvas, pet, config) {
    Object.assign(this, {canvas, pet, config});
    this.context = canvas.getContext('2d');
    this.particles = [];
    this.emitting = false;
    this.frame = null;
    this.nextEmission = 0;
  }

  start() {
    this.emitting = true;
    this.nextEmission = performance.now();
    if (this.frame === null) this.frame = requestAnimationFrame(time => this.paint(time));
  }

  stop() { this.emitting = false; }

  clear() {
    this.emitting = false;
    this.particles = [];
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  paint(time) {
    const {canvas, context: ctx, config: cfg} = this;
    const bounds = canvas.getBoundingClientRect();
    const pet = this.pet.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    const interval = 1000 / cfg.particles_per_second;
    if (this.emitting) {
      this.nextEmission = Math.max(this.nextEmission, time - cfg.life_ms);
      while (this.nextEmission <= time) {
        this.particles.push({born: this.nextEmission, spread: Math.random() * 2 - 1,
          variation: Math.random(), phase: Math.random() * Math.PI * 2});
        this.nextEmission += interval;
      }
    }
    const anchorX = pet.left - bounds.left + pet.width * cfg.anchor.x;
    const anchorY = pet.top - bounds.top + pet.height * cfg.anchor.y;
    if (this.emitting) {
      const length = pet.width * cfg.core_length;
      const halfWidth = pet.height * cfg.core_width;
      const core = ctx.createLinearGradient(anchorX, anchorY, anchorX + length, anchorY);
      core.addColorStop(0, `rgba(${cfg.color.join(',')},${cfg.core_opacity})`);
      core.addColorStop(1, `rgba(${cfg.color.join(',')},0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.quadraticCurveTo(anchorX + length * 0.45, anchorY - halfWidth * 0.3, anchorX + length, anchorY - halfWidth);
      ctx.lineTo(anchorX + length, anchorY + halfWidth);
      ctx.quadraticCurveTo(anchorX + length * 0.45, anchorY + halfWidth * 0.3, anchorX, anchorY);
      ctx.fill();
    }
    this.particles = this.particles.filter(particle => time - particle.born < cfg.life_ms);
    for (const particle of this.particles) {
      const age = Math.max(0, (time - particle.born) / cfg.life_ms);
      const x = anchorX + pet.width * cfg.speed * (time - particle.born) / 1000;
      const y = anchorY + particle.spread * pet.height * cfg.spread * age +
        Math.sin(age * Math.PI * 2 + particle.phase) * pet.height * cfg.turbulence * age;
      const radius = pet.width * (cfg.radius_start + (cfg.radius_end - cfg.radius_start) * age) *
        (cfg.size_min + particle.variation * (1 - cfg.size_min));
      const opacity = Math.sin(Math.PI * age) * cfg.opacity;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(cfg.stretch, 1);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(${cfg.color.join(',')},${opacity})`);
      gradient.addColorStop(1, `rgba(${cfg.color.join(',')},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.emitting || this.particles.length) this.frame = requestAnimationFrame(next => this.paint(next));
    else this.frame = null;
  }
}
