import test from "node:test";
import assert from "node:assert/strict";
import { installInputViewport, KEYBOARD_VISIBILITY_EVENT } from "./inputViewport.js";

class Events {
  listeners = new Map();
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, detail) { for (const fn of this.listeners.get(name) || []) fn({ detail }); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function setup() {
  const win = new Events();
  const doc = new Events();
  const properties = new Map();
  const frames = new Map();
  let id = 0;
  let scrolls = 0;
  win.innerHeight = 844;
  win.visualViewport = Object.assign(new Events(), { height: 844, scale: 1 });
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  win.cancelAnimationFrame = key => frames.delete(key);
  doc.documentElement = { dataset: {}, style: {
    setProperty: (key, value) => properties.set(key, value),
    removeProperty: key => properties.delete(key),
  } };
  const input = { matches: () => true, scrollIntoView: () => { scrolls++; } };
  const cleanup = installInputViewport(win, doc);
  const flush = () => { for (const [key, fn] of [...frames]) { frames.delete(key); fn(); } };
  return { win, doc, properties, frames, input, cleanup, flush, scrolls: () => scrolls };
}

test("input viewport uses the visible height and restores it after keyboard dismissal", () => {
  const s = setup();
  assert.equal(s.properties.get("--appViewportHeight"), "844px");
  s.doc.activeElement = s.input;
  s.win.visualViewport.height = 380;
  s.win.visualViewport.emit("resize"); s.flush();
  assert.equal(s.properties.get("--appViewportHeight"), "380px");
  assert.equal(s.doc.documentElement.dataset.keyboardOpen, "true");
  assert.equal(s.scrolls(), 1);
  s.win.visualViewport.height = 844;
  s.win.visualViewport.emit("resize"); s.flush();
  assert.equal(s.properties.get("--appViewportHeight"), "844px");
  assert.equal(s.doc.documentElement.dataset.keyboardOpen, undefined);
  s.cleanup();
});

test("native keyboard events work when Android resizes both viewports equally", () => {
  const s = setup(); s.doc.activeElement = s.input;
  s.win.innerHeight = s.win.visualViewport.height = 380;
  s.win.emit(KEYBOARD_VISIBILITY_EVENT, { visible: true }); s.flush();
  assert.equal(s.doc.documentElement.dataset.keyboardOpen, "true");
  s.win.emit(KEYBOARD_VISIBILITY_EVENT, { visible: false }); s.flush();
  assert.equal(s.doc.documentElement.dataset.keyboardOpen, undefined);
  s.cleanup();
});

test("small viewports without a focused text field do not hide navigation", () => {
  const s = setup();
  s.win.visualViewport.height = 320;
  s.win.emit(KEYBOARD_VISIBILITY_EVENT, { visible: true }); s.flush();
  assert.equal(s.doc.documentElement.dataset.keyboardOpen, undefined);
  assert.equal(s.scrolls(), 0);
  s.cleanup();
});

test("focus changes scroll the focused field, not an old field", () => {
  const s = setup(); s.doc.activeElement = s.input;
  s.doc.emit("focusin"); s.flush();
  assert.equal(s.scrolls(), 1);
  s.doc.activeElement = null;
  s.doc.emit("focusout"); s.flush();
  assert.equal(s.scrolls(), 1);
  s.cleanup();
});

test("pinch zoom does not resize the app layout", () => {
  const s = setup();
  s.win.visualViewport.scale = 2;
  s.win.visualViewport.height = 422;
  s.win.visualViewport.emit("resize"); s.flush();
  assert.equal(s.properties.get("--appViewportHeight"), "844px");
  s.cleanup();
});

test("viewport listeners and pending frames are cleaned up on unmount", () => {
  const s = setup();
  s.doc.emit("focusin"); s.win.emit("resize");
  assert.equal(s.frames.size, 1);
  s.cleanup();
  assert.equal(s.frames.size, 0);
  assert.equal(s.win.count() + s.doc.count() + s.win.visualViewport.count(), 0);
  assert.equal(s.properties.has("--appViewportHeight"), false);
});
