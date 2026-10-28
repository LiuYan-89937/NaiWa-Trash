import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import defaults from '../config/defaults.json';
import './settings.css';

const element = id => document.getElementById(id);
const methods = {
  interval_hours: {prefix: '每隔', unit: '小时', min: '0.01', max: '8760', step: '0.01'},
  item_limit: {prefix: '装够', unit: '项', min: '1', step: '1'},
  size_limit_mib: {prefix: '装到', unit: 'MiB', min: '1', step: '1'},
};
let current;
let dirty = false;
let selected;
let values = {...defaults.runtime.cleanup_presets};

function feedback(message, error = false) {
  element('feedback').textContent = message;
  element('feedback').classList.toggle('failed', error);
}
function showMethod(method) {
  selected = method;
  const spec = methods[method];
  element('cleanup-method').value = method;
  element('threshold-prefix').textContent = spec.prefix;
  element('threshold-unit').textContent = spec.unit;
  const input = element('threshold');
  input.min = spec.min;
  input.step = spec.step;
  if (spec.max) input.max = spec.max; else input.removeAttribute('max');
  input.value = values[method];
}
function render(state) {
  current = state;
  if (!dirty) {
    element('cleanup-enabled').checked = state.settings.cleanup.enabled;
    for (const method of Object.keys(methods)) {
      values[method] = state.settings.cleanup[method] ?? defaults.runtime.cleanup_presets[method];
    }
    const method = ['item_limit', 'size_limit_mib', 'interval_hours']
      .find(key => state.settings.cleanup[key] != null) ?? 'interval_hours';
    showMethod(method);
  }
  if (state.problem) feedback(state.problem, true);
}
element('preferences').addEventListener('input', () => { dirty = true; });
element('cleanup-method').addEventListener('change', () => {
  values[selected] = Number(element('threshold').value);
  showMethod(element('cleanup-method').value);
  dirty = true;
});
element('preferences').addEventListener('submit', async event => {
  event.preventDefault();
  const cleanup = {
    enabled: element('cleanup-enabled').checked,
    interval_hours: null, item_limit: null, size_limit_mib: null,
    [selected]: Number(element('threshold').value),
  };
  element('save').disabled = true;
  try {
    const state = await invoke('save_settings', {settings: {...current.settings, cleanup}});
    dirty = false;
    render(state);
    feedback('记住啦！');
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
action('open-trash', () => invoke('open_trash'));
action('clean-now', async () => {
  feedback('清理中…');
  const result = await invoke('clean_now');
  feedback(result.removed_items ? '清理完成，噗～' : '废纸篓没有减少项目，这次不放屁。');
  if (result.warning) feedback(result.warning, true);
});
async function main() {
  render(await invoke('get_state'));
  element('save').disabled = false;
  const unlisten = await listen('state-changed', ({payload}) => render(payload));
  window.addEventListener('pagehide', unlisten, {once: true});
}
main().catch(error => feedback('设置加载失败：' + String(error), true));
