import {invoke} from '@tauri-apps/api/core';
import {listen, emitTo} from '@tauri-apps/api/event';
import './settings.css';

const element = id => document.getElementById(id);
let dirty = false;
let current;
const dateText = value => new Date(value * 1000).toLocaleString('zh-CN');
function bytesText(bytes) {
  if (bytes == null) return '容量暂时无法读取';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return (bytes / 1024 ** index).toFixed(index ? 1 : 0) + ' ' + units[index];
}
function feedback(message, error = false) {
  element('feedback').textContent = message;
  element('feedback').classList.toggle('failed', error);
}
function triggerInputs() {
  for (const [toggle, value] of [['interval-enabled','interval-hours'], ['count-enabled','item-limit'], ['size-enabled','size-limit']]) {
    element(value).disabled = !element(toggle).checked;
    element(value).required = element(toggle).checked;
  }
  element('scale-value').textContent = element('pet-scale').value + '%';
}
function fill(settings) {
  element('cleanup-enabled').checked = settings.cleanup.enabled;
  element('interval-enabled').checked = settings.cleanup.interval_hours != null;
  element('count-enabled').checked = settings.cleanup.item_limit != null;
  element('size-enabled').checked = settings.cleanup.size_limit_mib != null;
  element('interval-hours').value = settings.cleanup.interval_hours ?? '';
  element('item-limit').value = settings.cleanup.item_limit ?? '';
  element('size-limit').value = settings.cleanup.size_limit_mib ?? '';
  element('laugh-base').value = settings.reactions.laugh_base * 100;
  element('laugh-increment').value = settings.reactions.laugh_per_extra_item * 100;
  element('laugh-cap').value = settings.reactions.laugh_cap * 100;
  element('pet-scale').value = settings.pet_scale * 100;
  triggerInputs();
}
function render(state) {
  current = state;
  if (!dirty) fill(state.settings);
  element('lifetime').textContent = state.lifetime_items.toLocaleString();
  element('cleanup-count').textContent = state.cleanup_runs.toLocaleString();
  element('last-cleanup').textContent = state.last_cleanup_at ? dateText(state.last_cleanup_at) : '尚未清理';
  element('trash-count').textContent = state.trash ? state.trash.items.toLocaleString() + ' 项' : '未读取';
  element('trash-size').textContent = state.trash ? bytesText(state.trash.bytes) : '点击刷新读取数量与容量';
  element('measurement-time').textContent = state.trash ? '更新于 ' + dateText(state.trash.measured_at) : '';
  element('problem').hidden = !state.problem;
  element('problem').textContent = state.problem ?? '';
  const history = element('history');
  history.replaceChildren();
  for (const entry of state.history) {
    const item = document.createElement('li');
    const time = document.createElement('time');
    const message = document.createElement('span');
    time.textContent = dateText(entry.at);
    message.textContent = entry.message;
    item.append(time, message);
    history.append(item);
  }
  if (!state.history.length) {
    const empty = document.createElement('li');
    empty.textContent = '还没有记录，先拖一份不用的文件给奶蛙。';
    history.append(empty);
  }
}
const number = id => Number(element(id).value);
const optional = (toggle, id) => element(toggle).checked ? number(id) : null;
element('preferences').addEventListener('input', () => { dirty = true; triggerInputs(); });
element('preferences').addEventListener('submit', async event => {
  event.preventDefault();
  const settings = {
    cleanup: {enabled: element('cleanup-enabled').checked,
      interval_hours: optional('interval-enabled','interval-hours'),
      item_limit: optional('count-enabled','item-limit'),
      size_limit_mib: optional('size-enabled','size-limit')},
    reactions: {laugh_base: number('laugh-base') / 100,
      laugh_per_extra_item: number('laugh-increment') / 100, laugh_cap: number('laugh-cap') / 100},
    pet_scale: number('pet-scale') / 100,
  };
  element('save').disabled = true;
  try {
    const state = await invoke('save_settings', {settings});
    dirty = false;
    render(state);
    feedback('已保存');
  } catch (error) { feedback(String(error), true); }
  finally { element('save').disabled = false; }
});
function action(id, handler) {
  element(id).addEventListener('click', async () => {
    element(id).disabled = true;
    try { await handler(); } catch (error) { feedback(String(error), true); }
    finally { element(id).disabled = false; }
  });
}
action('refresh', async () => { render(await invoke('refresh_trash')); feedback('废纸篓状态已更新'); });
action('open-trash', () => invoke('open_trash'));
action('quit', () => invoke('exit_app'));
action('clean-now', async () => {
  feedback('正在清空整个系统废纸篓…');
  const result = await invoke('clean_now');
  feedback(result.removed_items
    ? '清理完成，减少 ' + result.removed_items + ' 项，剩余 ' + result.remaining_items + ' 项。'
    : '没有清理掉任何项目，奶蛙不播放放屁动作。');
  if (result.warning) feedback(result.warning, true);
});
async function main() {
  render(await invoke('get_state'));
  const unlisten = await listen('state-changed', ({payload}) => render(payload));
  window.addEventListener('pagehide', unlisten, {once: true});
  const catalog = await fetch('./pet/catalog.json').then(response => response.json());
  for (const action of catalog.previews) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = catalog.clips[action].label;
    button.addEventListener('click', () => emitTo('pet', 'preview-action', {action})
      .catch(error => feedback(String(error), true)));
    element('action-buttons').append(button);
  }
}
main().catch(error => feedback('设置加载失败：' + String(error), true));
