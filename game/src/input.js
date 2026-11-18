// Keyboard + mouse state. Keys clear on window blur so a held key can never
// stick after alt-tab, and game keys never scroll the page.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    keys,
    pressed,
    mouseDown: false,
    mouseClicked: false,
    dragDX: 0,
    dragDY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyH', 'KeyJ', 'KeyM',
    'KeyP', 'KeyQ', 'KeyR', 'Digit1', 'Digit2', 'Space', 'ShiftLeft',
    'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape',
  ]);

  function onKeyDown(event) {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function clearAllKeys() {
    keys.clear();
    state.mouseDown = false;
    state.dragging = false;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    state.mouseDown = true;
    state.mouseClicked = true;
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
  }

  function onMouseMove(event) {
    if (!state.dragging) return;
    state.dragDX += event.clientX - state.lastX;
    state.dragDY += event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
  }

  function onMouseUp() {
    state.mouseDown = false;
    state.dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAllKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAllKeys();
  });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    state,
    isDown(code) { return keys.has(code); },
    wasPressed(code) { return pressed.has(code); },
    axis() {
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return [x, z];
    },
    endFrame() {
      pressed.clear();
      state.mouseClicked = false;
      state.dragDX = 0;
      state.dragDY = 0;
    },
    clearAllKeys,
  };
}
