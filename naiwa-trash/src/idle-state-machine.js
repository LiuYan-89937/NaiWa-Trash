export class IdleStateMachine {
  constructor(animator, policy, onError) {
    this.animator = animator;
    this.policy = policy;
    this.actions = [...new Set(policy.interludes)];
    this.onError = onError;
    this.pending = [];
    this.previous = null;
    this.active = false;
    this.generation = 0;
  }

  next() {
    if (!this.pending.length) {
      this.pending = [...this.actions];
      for (let i = this.pending.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.pending[i], this.pending[j]] = [this.pending[j], this.pending[i]];
      }
      if (this.pending.length > 1 && this.pending[0] === this.previous) {
        const other = 1 + Math.floor(Math.random() * (this.pending.length - 1));
        [this.pending[0], this.pending[other]] = [this.pending[other], this.pending[0]];
      }
    }
    this.previous = this.pending.shift();
    return this.previous;
  }

  start() {
    if (this.active) return;
    this.active = true;
    const generation = ++this.generation;
    this.run(generation).catch(error => this.onError(String(error)));
  }

  async run(generation) {
    try {
      while (this.active && generation === this.generation) {
        const duration = this.policy.base_min_ms + Math.random() *
          (this.policy.base_max_ms - this.policy.base_min_ms);
        const until = performance.now() + duration;
        do {
          if (!await this.animator.play(this.policy.base_action)) return;
        } while (this.active && generation === this.generation && performance.now() < until);
        if (!this.active || generation !== this.generation) return;
        if (this.actions.length && !await this.animator.play(this.next())) return;
      }
    } finally {
      if (generation === this.generation) this.active = false;
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    this.animator.stop();
  }
}
