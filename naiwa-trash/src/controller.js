import {IdleStateMachine} from './idle-state-machine.js';

export class PetController {
  constructor({animator, shredder, runtime, recycle, notify, showBusy}) {
    Object.assign(this, {animator, shredder, runtime, recycle, notify, showBusy});
    this.queue = [];
    this.running = false;
    this.hovering = false;
    this.mode = 'idle';
    this.idleState = new IdleStateMachine(animator, runtime.idle, notify);
  }

  idle() {
    this.mode = 'idle';
    this.idleState.start();
  }

  async hover(active) {
    this.hovering = active;
    if (this.running) return;
    if (active && this.mode !== 'hover') {
      this.idleState.stop();
      this.mode = 'hover';
      const completed = await this.animator.play('mouth-open');
      if (completed && this.hovering && !this.running) this.animator.play('mouth-hold', {loop: true});
    } else if (!active && this.mode === 'hover') {
      this.mode = 'closing';
      const completed = await this.animator.play('mouth-close');
      if (completed && !this.running && !this.hovering) this.idle();
    }
  }

  enqueue(task) {
    this.queue.push(task);
    if (!this.running) this.drain();
  }

  async drain() {
    this.running = true;
    this.idleState.stop();
    this.showBusy(true);
    while (this.queue.length) {
      this.mode = 'busy';
      try { await this.queue.shift()(); }
      catch (error) {
        this.notify(String(error));
        await this.animator.play('surprised');
      }
    }
    this.running = false;
    this.showBusy(false);
    this.mode = 'idle';
    if (this.hovering) this.hover(true); else this.idle();
  }

  feed(token, count) {
    this.hovering = false;
    this.enqueue(async () => {
      this.notify('正在接住 ' + count + ' 项文件…');
      await this.animator.play('mouth-open');
      this.animator.play('mouth-hold', {loop: true});
      const result = await this.recycle(token);
      if (result.accepted.length) {
        await this.shredder.eat(result.accepted);
        await this.animator.play('mouth-close');
        this.notify('已吃掉 ' + result.accepted.length + ' 项，放进系统废纸篓了');
        if (result.reaction) await this.animator.play(result.reaction);
      }
      if (result.failures.length) {
        const failed = result.failures.map(item => item.name + '：' + item.message).join('\n');
        this.notify('这些文件没有回收成功：\n' + failed);
        await this.animator.play('surprised');
      }
      if (result.warning) this.notify(result.warning);
    });
  }

  cleaned(result) {
    this.enqueue(async () => {
      this.notify('清理完成，减少 ' + result.removed_items + ' 项');
      await this.animator.play('fart');
      if (result.warning) this.notify(result.warning);
    });
  }

  clicked() {
    if (this.running) return;
    this.enqueue(() => this.animator.play(this.runtime.interaction.click_action));
  }
}
