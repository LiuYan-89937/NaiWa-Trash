export function bindPetGesture(element, {distance, drag, click, onError}) {
  let press = null;
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    press = {id: event.pointerId, x: event.clientX, y: event.clientY};
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!press || press.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < distance) return;
    press = null;
    element.releasePointerCapture(event.pointerId);
    drag().catch(error => onError(String(error)));
  });
  element.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    press = null;
    element.releasePointerCapture(event.pointerId);
    click();
  });
  element.addEventListener('pointercancel', () => { press = null; });
  element.addEventListener('lostpointercapture', () => { press = null; });
}
