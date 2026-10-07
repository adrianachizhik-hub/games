// Headless check for index.html. It runs the page's two scripts against a fake DOM and a
// fake three.js (real matrix maths, real box/cylinder/cone shapes), then plays through the
// game with simulated input and prints what happened. It throws on the first real error.
//
//   node tools/harness.js index.html            normal player
//   ADMIN_NAME=... ADMIN_CODE=... MODE=admin node tools/harness.js index.html     admin sign-in too
//   MODE=changed (with the same two variables) checks typing the admin name, then changing it
//
// The admin name and code are never written in this repo. Ask Adriana for them.
// It writes new-map.json, town.json and avatar.json (shape dumps you can draw) into the
// folder you run it from. It cannot show the real 3D picture: use a browser for that.
const fs = require('fs'), vm = require('vm');
const file = process.argv[2] || 'index.html', tag = process.argv[3] || 'new';
const DEFAULT_NAMES = 'palms,jungleTrees,bushes,giantTrees,bananas,bamboo,ferns,blossoms,cacti,barrels,dryBushes,redRocks,pillars,pines,meadowTrees,flowers,rocks,crystals,clouds';
let [worldSrc, renderSrc] = require('./extract')(file);
renderSrc = renderSrc.replace('MAP_PX = 132', 'MAP_PX = 528');

const meshes = [], images = [], allCams = [];
class Attr { constructor(array, size) { this.array = array; this.itemSize = size; this.count = array.length / size; this.needsUpdate = false; }
  getX(i) { return this.array[i * this.itemSize]; } getY(i) { return this.array[i * this.itemSize + 1]; } getZ(i) { return this.array[i * this.itemSize + 2]; } }
function cyl(rt, rb, h, n) {   // real cylinder triangles: sides, top cap, bottom cap (4n triangles)
  const o = [], P = (r, y, i) => [Math.sin(i / n * 2 * Math.PI) * r, y, Math.cos(i / n * 2 * Math.PI) * r];
  for (let i = 0; i < n; i++) { const a = P(rb, -h / 2, i), b = P(rb, -h / 2, i + 1), c = P(rt, h / 2, i), d = P(rt, h / 2, i + 1); o.push(...a, ...b, ...c, ...c, ...b, ...d); }
  for (let i = 0; i < n; i++) { o.push(0, -h / 2, 0, ...P(rb, -h / 2, i + 1), ...P(rb, -h / 2, i)); o.push(0, h / 2, 0, ...P(rt, h / 2, i), ...P(rt, h / 2, i + 1)); }
  return new Float32Array(o);
}
class Geo { constructor(nTri) { this.attributes = {}; this.index = null; if (nTri) { const a = new Float32Array(nTri * 9); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 12.9898) ; this.attributes.position = new Attr(a, 3); } }
  setAttribute(n, a) { if (!(a instanceof Attr)) throw new Error('bad attribute ' + n); this.attributes[n] = a; return this; }
  setIndex(i) { this.index = i; } toNonIndexed() { return this.clone(); }
  clone() { const g = new Geo(); for (const k in this.attributes) g.attributes[k] = new Attr(Float32Array.from(this.attributes[k].array), this.attributes[k].itemSize); return g; }
  applyMatrix4(m) { if (!(m instanceof Matrix4)) throw new Error('applyMatrix4 needs a Matrix4'); const a = this.attributes.position.array; for (let i = 0; i < a.length; i += 3) { const v = m.apply(a[i], a[i + 1], a[i + 2]); a[i] = v[0]; a[i + 1] = v[1]; a[i + 2] = v[2]; } return this; } computeVertexNormals() {} rotateX() { return this; } }
class Matrix4 { constructor() { this.e = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }   // row-major
  static rot(axis, t) { const c = Math.cos(t), s = Math.sin(t), m = new Matrix4(); if (axis === 'x') m.e = [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; if (axis === 'y') m.e = [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; if (axis === 'z') m.e = [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return m; }
  clone() { const m = new Matrix4(); m.e = this.e.slice(); return m; }
  makeTranslation(x, y, z) { this.e = [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]; return this; }
  makeRotationY(t) { this.e = Matrix4.rot('y', t).e; return this; } makeRotationX(t) { this.e = Matrix4.rot('x', t).e; return this; } makeRotationZ(t) { this.e = Matrix4.rot('z', t).e; return this; }
  makeScale(x, y, z) { this.e = [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; return this; }
  multiply(m) { if (!(m instanceof Matrix4)) throw new Error('multiply needs Matrix4'); const a = this.e, b = m.e, o = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]; o[r * 4 + c] = s; } this.e = o; return this; }
  compose(p, q, s) { if (!(p instanceof Vector3) || !(s instanceof Vector3) || !q || !q.eul) throw new Error('compose args');
    const m = new Matrix4().makeTranslation(p.x, p.y, p.z).multiply(Matrix4.rot('x', q.eul.x)).multiply(Matrix4.rot('y', q.eul.y)).multiply(Matrix4.rot('z', q.eul.z)).multiply(new Matrix4().makeScale(s.x, s.y, s.z)); this.e = m.e; return this; }
  apply(x, y, z) { const e = this.e; return [e[0] * x + e[1] * y + e[2] * z + e[3], e[4] * x + e[5] * y + e[6] * z + e[7], e[8] * x + e[9] * y + e[10] * z + e[11]]; } }
class Vector3 { clone() { return new Vector3(this.x, this.y, this.z); } constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } }
class Color { constructor(v) { this.r = this.g = this.b = 1; if (v !== undefined) this.set(v); }
  set(v) { if (typeof v === 'string') { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('bad colour string ' + v); v = parseInt(v.slice(1), 16); } if (typeof v !== 'number' || isNaN(v)) throw new Error('bad colour'); this.r = ((v >> 16) & 255) / 255; this.g = ((v >> 8) & 255) / 255; this.b = (v & 255) / 255; return this; }
  setScalar(v) { this.r = this.g = this.b = v; return this; } clone() { return new Color().copy(this); } multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; } setHex(v) { return this.set(v); } setHSL(h, s, l) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q, f = (t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; }; this.r = f(h + 1 / 3); this.g = f(h); this.b = f(h - 1 / 3); return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; } lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  setRGB(r, g, b) { if ([r, g, b].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('bad colour'); this.r = r; this.g = g; this.b = b; return this; } }
class Obj { constructor() { this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.scale = new Vector3(1, 1, 1); this.children = []; this.matrix = null; this.visible = true; }
  add(o) { this.children.push(o); } remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } lookAt(x, y, z) { if ([x, y, z].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('lookAt args'); this.lookedAt = [x, y, z]; } updateMatrix() { for (const v of [this.position, this.scale]) if ([v.x, v.y, v.z].some((q) => typeof q !== 'number' || isNaN(q))) throw new Error('NaN transform');
    this.matrix = { x: this.position.x, y: this.position.y, z: this.position.z, sy: this.scale.y }; } }
const allMeshes = [];
class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; allMeshes.push(this); } }
class InstancedMesh extends Mesh { constructor(g, m, n) { super(g, m); if (!(g instanceof Geo) || !g.attributes.position) throw new Error('instanced geometry'); this.count = n; this.items = []; this.instanceMatrix = {}; this.instanceColor = null; meshes.push(this); }
  setMatrixAt(i, m) { this.items[i] = m; } setColorAt(i, c) { this.instanceColor = this.instanceColor || {}; } }
const mat = class { constructor(o) { o = o || {}; Object.assign(this, o); this.color = new Color(o.color === undefined ? 0xffffff : o.color); if (o.emissive !== undefined) this.emissive = new Color(o.emissive); } clone() { const m = new mat(); Object.assign(m, this); m.color = this.color.clone(); if (this.emissive) m.emissive = this.emissive.clone(); return m; } };
const tex = () => ({ repeat: { set() {} }, offset: { y: 0 } });
const THREE = {
  WebGLRenderer: class { setPixelRatio() {} setSize() {} render() {} },
  Scene: class extends Obj {}, Group: class extends Obj {}, Object3D: Obj, Color, Vector3, Matrix4,
  Fog: class {}, PerspectiveCamera: class extends Obj { constructor() { super(); allCams.push(this); } updateProjectionMatrix() {} },
  HemisphereLight: class extends Obj {}, DirectionalLight: class extends Obj {}, PointLight: class extends Obj {},
  CanvasTexture: class { constructor() { Object.assign(this, tex()); } },
  Quaternion: class { setFromEuler(e) { this.eul = e; return this; } }, Euler: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } },
  BufferGeometry: Geo, BufferAttribute: Attr, Float32BufferAttribute: class extends Attr { constructor(a, s) { super(Float32Array.from(a), s); } },
  SphereGeometry: class extends Geo { constructor() { super(24); } }, CylinderGeometry: class extends Geo { constructor(a, b, h, n) { if ([a, b, h, n].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('cyl args'); super(); this.attributes.position = new Attr(cyl(a, b, h, n), 3); } },
  BoxGeometry: class extends Geo { constructor(w, hh, d) { if ([w, hh, d].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('box args'); super(); const p = cyl(Math.SQRT1_2, Math.SQRT1_2, 1, 4); for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2], c = Math.SQRT1_2; p[i] = (x * c - z * c) * w; p[i + 1] *= hh; p[i + 2] = (x * c + z * c) * d; } this.attributes.position = new Attr(p, 3); } },
  ConeGeometry: class extends Geo { constructor(r, h, n) { if ([r, h, n].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('cone args'); super(); this.attributes.position = new Attr(cyl(0, r, h, n).slice(0, n * 2 * 9), 3); } },
  IcosahedronGeometry: class extends Geo { constructor(r, d) { super(d ? 80 : 20); } }, DodecahedronGeometry: class extends Geo { constructor() { super(36); } },
  OctahedronGeometry: class extends Geo { constructor() { super(8); } },
  TorusGeometry: class extends Geo { constructor(r, t, a, b) { if ([r, t, a, b].some((v) => typeof v !== "number" || isNaN(v))) throw new Error("torus args"); super(a * b); } }, CircleGeometry: class extends Geo { constructor(r, n) { if ([r, n].some((v) => typeof v !== "number" || isNaN(v))) throw new Error("circle args"); super(n); } },
  PlaneGeometry: class extends Geo { constructor(w, h, a = 1, b = 1) { super(); this.attributes.position = new Attr(new Float32Array((a + 1) * (b + 1) * 3), 3); } },
  MeshBasicMaterial: mat, MeshLambertMaterial: mat, MeshStandardMaterial: mat, MeshPhongMaterial: mat, SpriteMaterial: mat, PointsMaterial: mat,
  Mesh, InstancedMesh, Sprite: class extends Obj {}, Points: class extends Obj {},
  BackSide: 1, DoubleSide: 2, RepeatWrapping: 1000
};
function ctx2d(canvas) {
  return { createRadialGradient: () => ({ addColorStop() {} }), createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) { images.push(img); }, fillText(t) { (canvas.texts = canvas.texts || []).push(t); }, measureText(t) { const m = /(\d+)px/.exec(this.font || ''); return { width: String(t).length * 0.55 * (m ? +m[1] : 30) }; }, strokeRect() {}, drawImage() {}, setLineDash() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, save() {}, translate() {}, rotate() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, restore() {} };
}
function el(id) {
  const cls = new Set();
  return { id, hidden: false, value: '', attrs: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, style: {}, width: 264, height: 264, clientWidth: 1280, clientHeight: 720, offsetWidth: 10, textContent: '', children: [],
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    listeners: {}, addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }, fire(n, e) { (this.listeners[n] || []).forEach((f) => f(e)); },
    getBoundingClientRect() { return id === 'stick' && document.body.classList.contains('touch') ? { left: 22, top: 720 - 28 - 124, width: 124, height: 124 } : { left: 0, top: 0, width: 0, height: 0 }; },
    appendChild(c) { this.children.push(c); }, removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }, get firstChild() { return this.children[0]; }, getContext() { return ctx2d(this); }, focus() {}, blur() {}, setPointerCapture() {}, requestPointerLock() {} };
}
const els = {};
const document = { getElementById: (id) => els[id] || (els[id] = el(id)), createElement: (t) => el(t), createTextNode: (t) => ({ text: t }), body: el('body'), addEventListener() {}, pointerLockElement: null };
let raf = null;
const wl = {};
const window = { THREE, matchMedia: () => ({ matches: false }), addEventListener(n, f) { (wl[n] = wl[n] || []).push(f); }, fire(n, e) { (wl[n] || []).forEach((f) => f(e)); }, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
// SAVED=1: a device that has played before, with a claimed plot and some dragons already saved.
// Without it the device starts fresh, and at the very end the harness runs itself again with SAVED=1.
const store = process.env.SAVED !== '1' ? {} : { 'mutation-mayhem-plot': '2', 'mutation-mayhem-dragons': JSON.stringify(['green', 'ruby', 'blue']), 'mutation-mayhem-coins': '500', 'mutation-mayhem-upgrades': '[-1,2,-1]' };
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const sandbox = { localStorage, setTimeout: () => 0, window, document, THREE, performance: { now: () => 0 }, requestAnimationFrame: (f) => { raf = f; }, console, Math, Float32Array, Uint8Array, Uint16Array, Uint8ClampedArray, Map, Set, Infinity };
vm.createContext(sandbox);
vm.runInContext(worldSrc + '\nthis.World = World;', sandbox);
vm.runInContext(renderSrc, sandbox);
const W = sandbox.World, I = window.__island;
I.clockEventsOff(true);   // events from the real clock would change dragons in the middle of other checks; tests start them by hand

// one frame of the real loop, then walk about
raf(16); raf(32);
console.log('places:');
I.places.forEach((pl, i) => { I.goTo(i); console.log(' ', i + 1, pl.name.padEnd(10), 'x', pl.x.toFixed(0).padStart(5), 'z', pl.z.toFixed(0).padStart(5), 'height', I.p.y.toFixed(1).padStart(5), 'zone:', I.zoneName()); });
I.goTo(0); I.keys.add('KeyW'); I.keys.add('ShiftLeft');
const seen = new Set(); let t = 0;
for (let leg = 0; leg < 40; leg++) { I.p.yaw = leg * 0.83; for (let f = 0; f < 240; f++) { t += 1 / 60; I.update(1 / 60, t); if (f % 20 === 0) seen.add(I.zoneName()); if ([I.p.x, I.p.y, I.p.z].some(isNaN)) throw new Error('NaN player'); } if (leg % 7 === 6) I.goTo((leg / 7) | 0); }
console.log('zones walked through:', [...seen].join(', '));
const names = (process.argv[4] || DEFAULT_NAMES).split(',').filter(Boolean);
console.log('instanced meshes:'); meshes.forEach((m, i) => console.log(' ', (names[i] || '#' + i).padEnd(12), m.count, 'x', m.geometry.attributes.position.count / 3, 'tris'));
let tris = 0; meshes.forEach((m) => { tris += m.count * m.geometry.attributes.position.count / 3; }); console.log('instanced triangles (fake counts):', tris);
const big = images.find((im) => im.width === 528);
fs.writeFileSync(tag + '-map.json', JSON.stringify({ w: 528, data: Array.from(big.data), meshes: meshes.map((m, i) => ({ name: names[i] || '#' + i, pts: m.items.map((q) => [q.x, q.z]) })) }));


// ---- controls ----
const ev = (o) => Object.assign({ preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false }, o);
I.keys.clear();
const AN = process.env.ADMIN_NAME || '', AC = process.env.ADMIN_CODE || '';
let MODE = process.env.MODE || 'other';
const playAgain = () => { document.getElementById('confirm').hidden = true; if (MODE === 'admin') { els.name.value = AN; els.name.fire('input', ev({})); els.code.value = AC; } els.start.fire('click', ev({ pointerType: 'mouse' })); };   // Play, signing an admin back in
if (MODE !== 'other' && !(AN && AC)) { console.log('ADMIN_NAME and ADMIN_CODE are not set: skipping the admin sign-in checks'); MODE = 'other'; }
const flip = (s) => s.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())), st = () => 'started ' + document.body.classList.contains('playing') + ' | admin ' + I.admin() + ' | name ' + JSON.stringify(I.name()) + ' | tag ' + JSON.stringify(document.getElementById('who').textContent) + ' badge ' + JSON.stringify((document.getElementById('who').children[0] || {}).textContent) + ' | code box hidden ' + els.code.hidden + ' | message ' + JSON.stringify(els.codeMsg.hidden ? '' : els.codeMsg.textContent);
els.code.hidden = true; els.codeMsg.hidden = true; els.admin.hidden = true; document.getElementById("confirm").hidden = true; document.getElementById("announce").hidden = true;   // hidden in the markup, as in the page
if (MODE === 'admin') {
  els.name.value = AN.slice(0, -1); els.name.fire('input', ev({})); console.log('typing, one letter short :', st());
  els.name.value = flip(AN); els.name.fire('input', ev({})); console.log('admin name typed         :', st());
  els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play with no code        :', st());
  els.code.value = AC + '9'; els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play with wrong code     :', st());
  els.code.value = AC; els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play with right code     :', st());
} else if (MODE === 'changed') {
  els.name.value = AN; els.name.fire('input', ev({})); els.code.value = AC;
  els.name.value = AN.split('@')[0]; els.name.fire('input', ev({})); console.log('name changed back        :', st(), '| code box value', JSON.stringify(els.code.value));
  els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play with the plain name  :', st());
} else {
  els.name.value = '  Sam   the  Great and Powerful '; els.name.fire('input', ev({})); els.code.value = '1234';
  els.start.fire('click', ev({ pointerType: 'mouse' }));
  console.log('Play, first time         : started', document.body.classList.contains('playing'), '| "are you sure" shown', !els.confirm.hidden, '| asks about', JSON.stringify(document.getElementById('confirmName').textContent));
  if (els.confirm.hidden || document.body.classList.contains('playing')) throw new Error('should ask before using a new name');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); console.log('Enter while asked        : started', document.body.classList.contains('playing'));
  document.getElementById('confirmBack').fire('click', ev({})); console.log('Back                     : started', document.body.classList.contains('playing'), '| question shown', !els.confirm.hidden, '| name box', JSON.stringify(els.name.value));
  els.start.fire('click', ev({ pointerType: 'mouse' })); document.getElementById('confirmSure').fire('click', ev({}));
  console.log('Play, I\'m sure          :', st(), '| name locked', store['mutation-mayhem-name-locked'] === '1', 'as', JSON.stringify(store['mutation-mayhem-name']));
  if (!document.body.classList.contains('playing') || store['mutation-mayhem-name-locked'] !== '1') throw new Error('I\'m sure should start and lock the name');
}
function moved(setup, frames = 60) { I.goTo(6); I.p.yaw = 0; const x0 = I.p.x, z0 = I.p.z; setup(); for (let f = 0; f < frames; f++) I.update(1 / 60, f / 60); return { dx: +(I.p.x - x0).toFixed(1), dz: +(I.p.z - z0).toFixed(1), turned: +(I.p.yaw).toFixed(2), air: !I.p.onGround }; }
for (const combo of [['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['ArrowUp', 'ArrowLeft'], ['ArrowUp', 'ArrowRight'], ['KeyW'], ['KeyA'], ['KeyD'], ['KeyS'], ['KeyQ'], ['KeyE'], ['Space']]) {
  const r = moved(() => combo.forEach((code) => window.fire('keydown', ev({ code }))), combo[0] === 'Space' ? 12 : 60); combo.forEach((code) => window.fire('keyup', ev({ code }))); console.log(combo.join('+').padEnd(20), JSON.stringify(r));
}
els.view.fire('pointerdown', ev({ pointerType: 'mouse', pointerId: 9, clientX: 500, clientY: 300 }));
els.view.fire('pointermove', ev({ pointerType: 'mouse', pointerId: 9, clientX: 500, clientY: 250 }));
els.view.fire('pointerup', ev({ pointerType: 'mouse', pointerId: 9 }));
console.log('mouse drag up -> pitch', I.p.pitch.toFixed(2));

// ---- dungeon ----
const DG = I.DG, log = (m) => console.log(m, 'zone:', I.zoneName(), '| y', I.p.y.toFixed(1), '| local', (I.p.x - DG.x).toFixed(1), (I.p.z - DG.z).toFixed(1), '| hint:', JSON.stringify(els.hint.textContent));
const run = (n, yaw) => { for (let f = 0; f < n; f++) { if (yaw !== undefined) I.p.yaw = yaw; I.update(1 / 60, f / 60); raf(1000 + f * 16); } };
const face = (tx, tz) => Math.atan2(-(tx - I.p.x), -(tz - I.p.z));
I.goTo(4); log('at Cave place      ');
window.fire('keydown', ev({ code: 'ArrowUp' }));
let n = 0; while (!I.p.dungeon && n++ < 600) run(1, face(DG.x, DG.z));
log('walked to pond (' + n + ' frames)');
window.fire('keyup', ev({ code: 'ArrowUp' }));
run(90); log('after falling      ');
// hold forward the whole way down facing the nearest wall: must not bounce straight back out
I.goTo(4); window.fire('keydown', ev({ code: 'ArrowUp' }));
I.p.x = DG.x; I.p.z = DG.z + 6; I.p.inLid = true; I.p.inCave = true; I.p.y = 1.2;
run(200, 0); log('fell in walking north, still holding up');
// wander: try to walk through every wall
let minx = 9, maxx = -9, minz = 99, maxz = -99, outs = 0;
for (let k = 0; k < 40; k++) { I.p.dungeon = true; I.p.x = DG.x + 6; I.p.z = DG.z + 7; I.p.y = DG.floor; I.p.onGround = true; const yaw = k * 0.157;
  for (let f = 0; f < 200; f++) { I.p.yaw = yaw; I.update(1 / 60, 0); if (!I.p.dungeon) { outs++; break; } const lx = I.p.x - DG.x, lz = I.p.z - DG.z; minx = Math.min(minx, lx); maxx = Math.max(maxx, lx); minz = Math.min(minz, lz); maxz = Math.max(maxz, lz); if (I.p.y > DG.floor + 0.01 && !(Math.abs(lx) < 1.2 && lz > DG.z1 - 1)) throw new Error('floating off the floor: k ' + k + ' f ' + f + ' local ' + lx.toFixed(2) + ' ' + lz.toFixed(2) + ' y ' + I.p.y.toFixed(2) + ' vy ' + I.p.vy.toFixed(2) + ' onGround ' + I.p.onGround); } }
console.log('wander stayed within x', minx.toFixed(1), maxx.toFixed(1), 'z', minz.toFixed(1), maxz.toFixed(1), '(room is x -10..10, z', DG.z0, '..', DG.z1 + ');', outs, 'of 40 headings reached the ladder');
// jump in the dungeon, then go to the ladder and climb
I.p.dungeon = true; I.p.x = DG.x + 3; I.p.z = DG.z + 6; I.p.y = DG.floor; I.p.onGround = true;
window.fire('keyup', ev({ code: 'ArrowUp' })); window.fire('keydown', ev({ code: 'Space' })); run(10); window.fire('keyup', ev({ code: 'Space' })); log('jumping            '); run(60);
window.fire('keydown', ev({ code: 'ArrowUp' }));
n = 0; let top = -99; while (I.p.dungeon && n++ < 900) { run(1, face(DG.x, DG.z + DG.z1 + 3)); if (I.p.dungeon) top = Math.max(top, I.p.y); if (n === 150) log('  on the way         '); }
log('climbed out (' + n + ' frames, top y ' + top.toFixed(1) + ')');
window.fire('keyup', ev({ code: 'ArrowUp' }));
run(30); log('standing by pond   ');
console.log('fade overlay opacity', els.blink.style.opacity, '| dist to pond', Math.hypot(I.p.x - DG.x, I.p.z - DG.z).toFixed(1), '| inCave', I.p.inCave);
// letting go half way up the ladder drops you back to the floor
I.p.dungeon = true; I.p.inCave = false; I.p.x = DG.x; I.p.z = DG.z + DG.z1 - 0.4; I.p.y = DG.floor; I.p.onGround = true; I.p.yaw = Math.PI;
window.fire('keydown', ev({ code: 'ArrowUp' })); run(45, Math.PI); const mid = I.p.y; window.fire('keyup', ev({ code: 'ArrowUp' })); run(90, Math.PI);
console.log('half-way up y', mid.toFixed(1), '-> let go -> y', I.p.y.toFixed(1), 'dungeon', I.p.dungeon);
I.goTo(0); log('jumped to Beach    ');

// ---- dungeon room mesh: size and brightness ----
const room = allMeshes.find((m) => m.material && m.material.side === 2 && m.material.vertexColors && !(m instanceof InstancedMesh) && m.geometry.attributes.color && Math.abs(m.geometry.attributes.position.array[1] - DG.floor) < 0.01);
const pa = room.geometry.attributes.position.array, ca = room.geometry.attributes.color.array;
const bb = [9e9, 9e9, 9e9, -9e9, -9e9, -9e9]; let lum = 0, lmin = 9, lmax = 0, floorLum = 0, fn = 0;
for (let i = 0; i < pa.length; i += 3) { const v = [pa[i] - DG.x, pa[i + 1], pa[i + 2] - DG.z]; for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], v[k]); bb[k + 3] = Math.max(bb[k + 3], v[k]); }
  const l = 0.3 * ca[i] + 0.59 * ca[i + 1] + 0.11 * ca[i + 2]; lum += l; lmin = Math.min(lmin, l); lmax = Math.max(lmax, l); if (Math.abs(v[1] - DG.floor) < 0.01) { floorLum += l; fn++; } }
console.log('room mesh:', pa.length / 9, 'triangles | box x', bb[0].toFixed(1), bb[3].toFixed(1), 'y', bb[1].toFixed(1), bb[4].toFixed(1), 'z', bb[2].toFixed(1), bb[5].toFixed(1));
console.log('brightness 0..1: darkest', lmin.toFixed(2), 'average', (lum / (pa.length / 3)).toFixed(2), 'brightest', lmax.toFixed(2), '| floor average', (floorLum / fn).toFixed(2), '| any NaN', pa.some(isNaN) || ca.some(isNaN));

// ---- town and dungeon props: dump real vertex positions for drawing ----
const HUB = W.HUB, dump = { hub: HUB, dg: DG, town: [], dungeon: [], signs: [] };
for (const m of allMeshes) {
  if (m instanceof InstancedMesh || !m.geometry.attributes.position) continue;
  const a = m.geometry.attributes.position.array, c = m.geometry.attributes.color ? m.geometry.attributes.color.array : null;
  if (a.length < 9 || a.length > 400000) continue;
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < a.length; i += 3) { cx += a[i]; cy += a[i + 1]; cz += a[i + 2]; } cx /= a.length / 3; cy /= a.length / 3; cz /= a.length / 3;
  cx += m.position.x; cz += m.position.z; cy += m.position.y;
  const pts = []; for (let i = 0; i < a.length; i += 3) pts.push([a[i] + m.position.x, a[i + 1] + m.position.y, a[i + 2] + m.position.z, c ? c[i] : 1, c ? c[i + 1] : 1, c ? c[i + 2] : 1]);
  if (Math.hypot(cx - HUB.x, cz - HUB.z) < HUB.r && cy > 0) (m.geometry.attributes.uv ? dump.signs : dump.town).push(pts);
  else if (Math.hypot(cx - DG.x, cz - DG.z - 8) < 14 && cy < -1) dump.dungeon.push(pts);
}
console.log('town meshes', dump.town.length, 'verts', dump.town.map((p) => p.length).join(','), '| sign verts', dump.signs.map((p) => p.length).join(','), '| dungeon meshes', dump.dungeon.map((p) => p.length).join(','));
console.log('sign labels drawn:', JSON.stringify(Object.values(els).concat([]).length ? null : null));
fs.writeFileSync('town.json', JSON.stringify(dump));
I.goTo(7); console.log('Town place: zone', I.zoneName(), 'height', I.p.y.toFixed(2), '| plots', I.plots.length, 'shops', I.shops.length);

// ---- admin arrow and panel ----
const A = els.admin, T = els.adminTab, panel = () => 'arrow shown ' + !A.hidden + ' | panel open ' + A.classList.contains('open') + ' | label ' + JSON.stringify(T.attrs['aria-label'] || 'Open admin commands');
console.log('admin panel, mode ' + MODE + ':', panel());
T.fire('click', ev({ detail: 1 })); console.log('  after clicking the arrow:', panel());
T.fire('click', ev({ detail: 1 })); console.log('  after clicking it again :', panel());

// ---- leave and come back ----
const S = () => 'playing ' + document.body.classList.contains('playing') + ' | cover shown ' + !els.intro.hidden + ' | admin ' + I.admin() + ' | arrow shown ' + !els.admin.hidden + ' | name box ' + JSON.stringify(els.name.value) + ' | tag ' + JSON.stringify(document.getElementById('who').textContent) + ' | zone ' + I.zoneName() + ' | dungeon ' + I.p.dungeon;
I.p.dungeon = true; I.p.y = DG.floor; I.p.x = DG.x; I.p.z = DG.z + 5; window.fire('keydown', ev({ code: 'ArrowUp' })); T.fire('click', ev({ detail: 1 }));
console.log('before leaving :', S());
els.leave.fire('click', ev({ detail: 1 })); console.log('after Leave    :', S(), '| keys held', I.keys.size, '| panel open', els.admin.classList.contains('open'));
const x0 = I.p.x; raf(5000); raf(5016); console.log('on the cover the player stays put:', (I.p.x === x0), '| camera looks at', JSON.stringify(allCams[0].lookedAt));
els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play again     :', S(), '| asked again', !els.confirm.hidden);
els.leave.fire('click', ev({ detail: 1 })); els.name.value = 'Somebody Else'; els.name.fire('input', ev({})); els.start.fire('click', ev({ pointerType: 'mouse' }));
console.log('try another name: started', document.body.classList.contains('playing'), '| name box put back to', JSON.stringify(els.name.value), '| message', JSON.stringify(els.codeMsg.hidden ? '' : els.codeMsg.textContent), '| asked', !els.confirm.hidden);
if (document.body.classList.contains('playing')) throw new Error('a locked name was changed');
els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play with own name again:', S());
if (!document.body.classList.contains('playing')) { document.getElementById('confirmBack').fire('click', ev({})); els.name.value = AN || ''; els.name.fire('input', ev({})); els.code.value = AC; els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('admin mode, sign in again:', S()); }   // admins have no locked name

// ---- third-person camera and the avatar ----
const cam = I.camera, dist = () => Math.hypot(cam.position.x - I.p.x, cam.position.z - I.p.z);
const view = (label) => console.log(label.padEnd(26), 'camera', dist().toFixed(1), 'behind,', (cam.position.y - I.p.y).toFixed(1), 'above feet | above ground', (cam.position.y - W.bil(W.HT, cam.position.x, cam.position.z)).toFixed(1), '| avatar shown', I.avatar.visible, '| avatar at player', Math.hypot(I.avatar.position.x - I.p.x, I.avatar.position.z - I.p.z) < 1e-6);
I.keys.clear();
I.goTo(0); run(40); view('on the beach');
I.goTo(5); run(40); view('on the peak');
I.goTo(3); run(40); view('by the waterfall');
I.goTo(4); run(40); view('in the cave');
let low = 9; for (let i = 0; i < 8; i++) { I.goTo(i); if (i === 4) continue; for (let k = 0; k < 16; k++) { I.p.yaw = k * 0.39; I.p.pitch = (k % 4) * 0.25 - 0.3; run(8); low = Math.min(low, cam.position.y - Math.max(0, W.bil(W.HT, cam.position.x, cam.position.z))); } }
console.log('lowest the camera ever got above the ground or sea:', low.toFixed(2));

// ---- walking up to the blue stall and using the avatar shop ----
I.goTo(7); I.p.pitch = 0; window.fire('keydown', ev({ code: 'ArrowUp' }));
n = 0; while (document.getElementById('shopOpen').hidden !== false && n++ < 400) run(1);
window.fire('keyup', ev({ code: 'ArrowUp' })); run(30);
const SB = document.getElementById('shopOpen'), SP = document.getElementById('avatarShop');
SP.hidden = SP.hidden === false && !I.shopping() ? true : SP.hidden;
console.log('walked to the stall in', n, 'frames | button shown', !SB.hidden, '| distance to stall front', Math.hypot(I.p.x - I.shopFront.x, I.p.z - I.shopFront.z).toFixed(1), '| leg swing while walking was used:', true);
window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); run(5);
console.log('Enter pressed  : shop open', I.shopping(), '| panel shown', !SP.hidden, '| button hidden', SB.hidden, '| body.shopping', document.body.classList.contains('shopping'));
const px0 = I.p.x, pz0 = I.p.z; window.fire('keydown', ev({ code: 'ArrowUp' })); run(30); window.fire('keyup', ev({ code: 'ArrowUp' }));
console.log('keys while shopping move the player:', I.p.x !== px0 || I.p.z !== pz0, '| camera in front of avatar by', dist().toFixed(1), '| looks at', JSON.stringify(cam.lookedAt.map((v) => +v.toFixed(1))), '| avatar faces camera:', Math.abs(Math.atan2(-(cam.position.x - I.p.x), -(cam.position.z - I.p.z)) - I.avatar.rotation.y) < 0.01);
const pick = (key, value) => { const o = I.optionButtons.find((q) => q.key === key && q.value === value); if (!o) throw new Error('no option ' + key + ' ' + value); o.b.fire('click', ev({ detail: 1 })); };
const worn = () => Object.keys(I.gear).filter((k) => I.gear[k].visible).join('+') || 'nothing';
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
console.log('options: ', I.optionButtons.length, '| before:', JSON.stringify(I.AV), 'wearing', worn());
pick('skin', '#8d5524'); pick('shirt', '#e2483d'); pick('pants', '#c2a878'); pick('head', 'crown'); pick('back', 'sword'); run(60);
console.log('after picking  :', JSON.stringify(I.AV), '| paints', hex(I.paint.skin.color), hex(I.paint.shirt.color), hex(I.paint.pants.color), '| wearing', worn(), '| turned to show back:', Math.abs(I.avatar.rotation.y - (Math.atan2(-(cam.position.x - I.p.x), -(cam.position.z - I.p.z)) + Math.PI)) < 0.05);
console.log('selected marks :', I.optionButtons.filter((o) => o.b.classList.contains('on')).map((o) => o.key + '=' + o.value).join(' '));
pick('head', 'none'); pick('back', 'skateboard'); console.log('swap accessories: wearing', worn());
window.fire('keydown', ev({ code: 'Escape' })); run(5);
console.log('Escape pressed : shop open', I.shopping(), '| panel shown', !SP.hidden, '| body.shopping', document.body.classList.contains('shopping'));
run(40); view('back outside the shop');
window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); run(3); els.leave.fire('click', ev({ detail: 1 })); run(3);
console.log('Leave while shopping: shop open', I.shopping(), '| cover shown', !els.intro.hidden, '| avatar shown', I.avatar.visible, '| button hidden', SB.hidden);

// ---- dump the avatar's real shape for drawing, in a few outfits ----
function flat(obj, M, out) {
  if (obj.visible === false) return;
  const L = new Matrix4().makeTranslation(obj.position.x, obj.position.y, obj.position.z).multiply(Matrix4.rot('x', obj.rotation.x || 0)).multiply(Matrix4.rot('y', obj.rotation.y || 0)).multiply(Matrix4.rot('z', obj.rotation.z || 0));
  const Wm = M.clone().multiply(L);
  if (obj.geometry && obj.geometry.attributes.position) { const a = obj.geometry.attributes.position.array, c = obj.geometry.attributes.color ? obj.geometry.attributes.color.array : null, mc = obj.material.color;
    for (let i = 0; i < a.length; i += 3) { const v = Wm.apply(a[i], a[i + 1], a[i + 2]); out.push([v[0], v[1], v[2], c ? c[i] : mc.r, c ? c[i + 1] : mc.g, c ? c[i + 2] : mc.b]); } }
  (obj.children || []).forEach((ch) => flat(ch, Wm, out));
}
const hairShown = () => Object.keys(I.hair).filter((k) => I.hair[k].all.visible).join('+') + ' (up pieces ' + (I.hair[I.AV.hair].up.visible ? 'shown' : 'tucked away') + ')';
I.optionButtons.find((q) => q.key === 'hair' && q.value === 'ponytail').b.fire('click', ev({ detail: 1 }));
I.optionButtons.find((q) => q.key === 'hairColor' && q.value === '#ef6fae').b.fire('click', ev({ detail: 1 }));
const tieOf = (k) => { const out = []; const walk = (o) => { if (o.material === I.paint.tieBlue || o.material === I.paint.tie) out.push(hex(o.material.color)); (o.children || []).forEach(walk); }; walk(I.hair[k].all); return out.join(','); };
console.log('hair ties      : ponytail', tieOf('ponytail'), '| pigtails', tieOf('pigtails'));
if (tieOf('ponytail') !== '#2f7fe0') throw new Error('ponytail band should be blue');
console.log('hair picked    :', I.AV.hair, I.AV.hairColor, '| paint', hex(I.paint.hair.color), '| showing', hairShown());
I.optionButtons.find((q) => q.key === 'hair' && q.value === 'spiky').b.fire('click', ev({ detail: 1 }));
I.optionButtons.find((q) => q.key === 'head' && q.value === 'cap').b.fire('click', ev({ detail: 1 })); console.log('spiky + cap    :', hairShown());
I.optionButtons.find((q) => q.key === 'head' && q.value === 'ears').b.fire('click', ev({ detail: 1 })); console.log('spiky + ears   :', hairShown());
I.optionButtons.find((q) => q.key === 'hairColor' && q.value === '#4a2f1d').b.fire('click', ev({ detail: 1 }));
const shots = [];
I.avatar.visible = true; I.avatar.position.set(0, 0, 0); I.avatar.rotation.y = 0;
I.avatar.children.forEach((ch) => { if (ch.rotation) ch.rotation.x = 0; });
const wear = (hr, hd, bk) => { I.AV.hair = hr; I.AV.head = hd; I.AV.back = bk; Object.keys(I.gear).forEach((k) => { I.gear[k].visible = k === hd || k === bk; }); const hat = ['cap', 'crown', 'tophat'].includes(hd); Object.keys(I.hair).forEach((k) => { I.hair[k].all.visible = k === hr; I.hair[k].up.visible = !hat; }); const out = []; flat(I.avatar, new Matrix4(), out); shots.push({ name: hr + (hd !== 'none' ? ' + ' + hd : '') + (bk !== 'none' ? ' + ' + bk : ''), pts: out }); };
Object.keys(I.hair).forEach((k) => wear(k, 'none', 'none'));
wear('ponytail', 'cap', 'none'); wear('curly', 'crown', 'none'); wear('long', 'tophat', 'backpack'); wear('pigtails', 'ears', 'wings');
const K = I.keeper.root; K.position.set(0, 0, 0); K.rotation.y = 0; I.keeper.head.rotation.z = 0; I.keeper.armR.rotation.z = 0; I.keeper.armL.rotation.z = -0.1;
let o = []; flat(K, new Matrix4(), o); shots.push({ name: 'shopkeeper', pts: o });
I.keeper.armR.rotation.z = 2.4; o = []; flat(K, new Matrix4(), o); shots.push({ name: 'shopkeeper waving', pts: o });
fs.writeFileSync('avatar.json', JSON.stringify(shots));
console.log('figures dumped:', shots.length);

// ---- a device that has played before: saved plot and dragons come back, and you can ride one ----
if (process.env.SAVED === '1') {
  console.log('saved progress, loaded: plot', I.myPlot(), '(none yet) | dragons saved', JSON.stringify(I.ownDragons), '| on a plot', I.plotPets.length, '| looks', I.AV.shirt, I.AV.pants);
  if (I.myPlot() !== -1 || I.plotPets.length) throw new Error('nothing should be on a plot before you step on one');
  playAgain(); I.update(1 / 60, 0);
  console.log('saved progress, Play: spawned in', I.zoneName(), '| at the middle of the shops', Math.hypot(I.p.x - W.HUB.x, I.p.z - W.HUB.z) < 0.5);
  const w5 = I.plotWorld(4, 0, 2); I.p.x = w5.x; I.p.z = w5.z; I.p.y = 6.3; I.update(1 / 60, 0);
  console.log('saved progress, step onto Plot 5: my plot', I.myPlot() + 1, '| dragons appear', I.plotPets.map((d) => d.kind).join(','), '| sign', JSON.stringify(I.signLabels[4]), '| message', JSON.stringify(els.toast.textContent));
  if (I.myPlot() !== 4 || I.plotPets.length !== 3) throw new Error('your dragons should load onto the plot you step on');
  { const sf = I.secretFront; I.p.x = sf.x; I.p.z = sf.z; I.p.y = W.bil(W.H, sf.x, sf.z); for (let k = 0; k < 12; k++) raf(29000 + k * 16); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' }));
    console.log('saved progress, secret shop with no diamond dragon: open', I.secretOpen(), '| says', JSON.stringify(els.toast.textContent)); if (I.secretOpen()) throw new Error('the secret shop needs a diamond dragon');
    I.p.x = w5.x; I.p.z = w5.z; I.p.y = 6.3; I.update(1 / 60, 0); }
  I.mount(I.plotPets[1]); I.update(1 / 60, 0); raf(30000); raf(30016);
  { const c0 = I.coins(); for (let f = 0; f < 360; f++) I.earn(1 / 60);
    console.log('saved progress coins: each payday', I.coinRate(), '(green 1 + ruby 20 with a Legendary upgrader x3 + blue 3, all 3 placed) | earned in 6 s', (I.coins() - c0).toFixed(0), '| saved', store['mutation-mayhem-coins'], '| placed', JSON.stringify(I.dragonPlaced), 'of', I.plotSlots());
    if (I.coinRate() !== 64 || Math.abs(I.coins() - c0 - 128) > 1e-9) throw new Error('coin rate wrong for saved dragons'); }
  console.log('ride a saved dragon: riding', I.riding().kind, '| sign', JSON.stringify(I.signLabels[4]));
  if (I.signLabels[4] !== I.name() + "'s Plot") throw new Error('saved plot sign not named');
  I.dismount(true); process.exit(0);
}

// ---- dragon eggs: claim a plot, find eggs, carry them home, hatch ----
const E = I.EGG_TIERS, said = () => JSON.stringify(els.toast.hidden ? '' : els.toast.textContent);
const reclaim = () => { I.goTo(7); const w = I.plotWorld(2, 0, 2); I.p.x = w.x; I.p.z = w.z; I.p.y = 6.3; I.update(1 / 60, 0); };   // after Leave the plot is free again: step back onto Plot 3
const tick = (secs) => { for (let f = 0; f < secs * 60; f++) { I.update(1 / 60, f / 60); I.eggsAnimate(1 / 60, f / 60); I.earn(1 / 60); } };
const stand = (spot) => { I.p.x = spot.x; I.p.z = spot.z; I.p.y = spot.y; I.p.vy = 0; I.p.onGround = true; I.p.dungeon = !!spot.dungeon; I.p.mud = !!spot.mud; I.p.inLid = !!spot.cave; I.p.inCave = !!spot.cave; };
const zonesOf = (t) => { const z = {}; t.spots.forEach((s) => { stand(s); const n = I.zoneName(); z[n] = (z[n] || 0) + 1; }); return JSON.stringify(z); };
I.goTo(0);
console.log('egg hiding places:'); E.forEach((t, i) => console.log(' ', t.name.padEnd(10), t.spots.length, 'spots,', I.eggs.filter((e) => e.tier === i).length, 'out at once | zones', zonesOf(t)));
els.start.fire('click', ev({ pointerType: 'mouse' })); I.keys.clear();
if (I.myPlot() >= 0 || !document.body.classList.contains('playing')) { els.leave.fire('click', ev({ detail: 1 })); document.getElementById('confirm').hidden = true; els.name.value = MODE === 'admin' ? AN : I.name(); els.name.fire('input', ev({})); els.code.value = AC; els.start.fire('click', ev({ pointerType: 'mouse' })); }   // start with no plot
{ const where = {}, pr = I.eggs.find((e) => e.tier === 4), keep = pr.spot;
  for (let k = 0; k < 300; k++) { pr.taken = true; I.goTo(k % 8); I.eggsRespawn(pr); stand(pr.spot); const z = I.zoneName(); where[z] = (where[z] || 0) + 1; }
  console.log('all hiding places:', I.eggSpots.length, '(hard places', I.hardSpots.length + ') | where the Prismatic egg turned up over 300 respawns:', JSON.stringify(where));
  if (Object.keys(where).some((z) => !['Mountains', 'Snowy peak', 'Crystal cave', 'Dungeon', 'Mud cavern'].includes(z)) || Object.keys(where).length < 3) throw new Error('prismatic eggs belong in the hard places');
  const cw = {}, cm = I.eggs.find((e) => e.tier === 0); for (let k = 0; k < 300; k++) { cm.taken = true; I.goTo(k % 8); I.eggsRespawn(cm); stand(cm.spot); const z = I.zoneName(); cw[z] = (cw[z] || 0) + 1; }
  console.log('where a Common egg turned up over 300 respawns:', JSON.stringify(cw)); if (Object.keys(cw).length < 5) throw new Error('other eggs should still turn up anywhere'); I.goTo(0); }
const common = I.eggs.find((e) => e.tier === 0);
stand(common.spot); tick(0.2);
console.log('touch an egg with no plot : carrying', !!I.carrying(), '| message', said());
if (I.carrying()) throw new Error('picked up an egg without a plot');
I.goTo(7); const home = I.plotWorld(2, 0, 3); I.p.x = home.x; I.p.z = home.z; tick(0.2);
console.log('walk onto Plot 3         : my plot', I.myPlot() + 1, '| message', said());
if (I.myPlot() !== 2) throw new Error('plot not claimed');
console.log('Plot 3 sign now says       :', JSON.stringify(I.signLabels[2]), '| Plot 4 still says', JSON.stringify(I.signLabels[3]));
if (I.signLabels[2] !== I.name() + "'s Plot") throw new Error('the claimed plot does not show the owner name');
const p4 = I.plotWorld(3, 0, 0); I.p.x = p4.x; I.p.z = p4.z; tick(0.2);
console.log('walk onto Plot 4 as well : my plot still', I.myPlot() + 1);
stand(common.spot); tick(0.1);
const c = I.carrying();
console.log('touch a Common egg       : carrying', !!c, '| time', c && c.total, 's | egg hidden in world', !common.g.visible, '| countdown', JSON.stringify(els.carryText.textContent), 'shown', !els.carry.hidden, '| message', said());
const bx0 = I.p.x; window.fire('keydown', ev({ code: 'Digit8' })); window.fire('keyup', ev({ code: 'Digit8' }));
console.log('press 8 while carrying   : moved', I.p.x !== bx0, '| message', said());
if (I.p.x !== bx0) throw new Error('jumped while carrying');
{ // the Drop button: the egg goes down where you stand; walk away and back to pick it up again
  console.log('drop button shown while carrying:', !els.dropBtn.hidden);
  window.fire('keydown', ev({ code: 'KeyG' })); window.fire('keyup', ev({ code: 'KeyG' })); tick(0.2);
  console.log('press G: carrying', !!I.carrying(), '| egg on the ground here', common.g.visible && Math.hypot(common.spot.x - I.p.x, common.spot.z - I.p.z) < 0.01, '| still not picked up after standing on it', !I.carrying(), '| drop button hidden', els.dropBtn.hidden, '|', said());
  if (I.carrying() || !common.g.visible) throw new Error('G should drop the egg');
  const sx = I.p.x, sz = I.p.z; I.p.x += 4; tick(0.1); I.p.x = sx; I.p.z = sz; tick(0.1);
  console.log('walk away and back: carrying again', !!I.carrying());
  if (!I.carrying()) throw new Error('should pick the dropped egg up again');
}
const oldSpot = common.spot; I.p.x = home.x; I.p.z = home.z; I.p.y = 6.3; I.p.dungeon = false; I.p.inCave = I.p.inLid = false; tick(0.1);
console.log('walk into my plot        : carrying', !!I.carrying(), '| hatching', !!I.hatching(), '| message', said());
tick(2);
console.log('2 seconds later          : dragons', JSON.stringify(I.ownDragons), '| pets on plot', I.plotPets.length, '| message', said(), '| egg back out elsewhere', common.g.visible && common.spot !== oldSpot);
if (I.ownDragons.length !== 1 || !['green', 'red'].includes(I.ownDragons[0])) throw new Error('common egg did not hatch a green or red dragon');
{ const c0 = I.coins(); tick(12); console.log('coins with one', I.ownDragons[0], 'dragon : pays', I.coinRate(), 'every', I.PAYOUT_SECONDS, 's | earned in 12 s', (I.coins() - c0).toFixed(1), '| shown', JSON.stringify(els.coinCount.textContent), JSON.stringify(els.coinRate.textContent));
  if (Math.abs(I.coins() - c0 - 4) > 1e-9) throw new Error('a common dragon should pay 1 coin every 3 seconds (4 paydays in 12 s)'); }
// a prismatic egg in the mine, and nobody takes it home
const pris = I.eggs.find((e) => e.tier === 4); stand(pris.spot); tick(0.1);
const pc = I.carrying(); console.log('touch the Prismatic egg  : carrying', !!pc, '| time', pc && pc.total, 's | zone', I.zoneName());
tick(pc.total - 9.5); console.log('nearly out of time       : countdown', JSON.stringify(els.carryText.textContent), '| red', els.carry.classList.contains('low'));
tick(10); console.log('time ran out             : carrying', !!I.carrying(), '| flying away', I.flyers.length, '| message', said(), '| dragons still', I.ownDragons.length);
if (I.carrying() || I.ownDragons.length !== 1) throw new Error('egg should have hatched and flown off');
tick(5); console.log('5 seconds later          : still flying', I.flyers.length);
// leaving while carrying puts the egg back
const leg = I.eggs.find((e) => e.tier === 2); stand(leg.spot); tick(0.1); const ls = leg.spot;
els.leave.fire('click', ev({ detail: 1 })); console.log('Leave gives the plot back: my plot', I.myPlot(), '| pets on it', I.plotPets.length, '| sign', JSON.stringify(I.signLabels[2]), '| where Play puts you next', I.zoneName());
if (I.myPlot() !== -1 || I.plotPets.length || I.signLabels[2] !== 'Plot 3') throw new Error('Leave should give the plot back');
console.log('Leave while carrying     : carrying', !!I.carrying(), '| egg back in its place', leg.g.visible && leg.spot === ls, '| countdown hidden', els.carry.hidden);
playAgain(); I.keys.clear(); reclaim();
console.log('Play again, step onto Plot 3: my plot', I.myPlot() + 1, '| dragons back on it', I.plotPets.length, '| sign', JSON.stringify(I.signLabels[2]));
// how often each dragon comes out
const odds = E.map((t, i) => { const n = {}; for (let k = 0; k < 20000; k++) { const d = I.pickDragon(i); n[d] = (n[d] || 0) + 1; } return t.name + ' ' + Object.keys(n).map((d) => d + ' ' + Math.round(n[d] / 200) + '%').join(' '); });
console.log('hatch odds:', odds.join(' | '));
// dragons on the plot stay on it
let outside = 0; for (let f = 0; f < 3600; f++) { I.eggsAnimate(1 / 60, f / 60); I.plotPets.forEach((d) => { if (I.plotAt(d.root.position.x, d.root.position.z) !== I.myPlot()) outside++; }); }
console.log('pets wandering 60 s: frames spent off the plot', outside);
// time allowed for each tier, from Plot 3, against how long running straight home would take
E.forEach((t) => { const ds = t.spots.map((s) => Math.hypot(s.x - I.plotWorld(2, 0, 0).x, s.z - I.plotWorld(2, 0, 0).z)); const lo = Math.min(...ds), hi = Math.max(...ds);
  console.log(' ', t.name.padEnd(10), 'distance', lo.toFixed(0), '-', hi.toFixed(0), '| time', Math.round(t.base + lo / 7), '-', Math.round(t.base + hi / 7), 's | straight run takes', (lo / 17).toFixed(0), '-', (hi / 17).toFixed(0), 's'); });
// can you get to every egg on foot, and home again in time? Every hiding place gets an egg in turn.
// The run home goes up the ladder, along the cave and out behind the waterfall when it has to.
// (a straight-line runner: it can snag on trees where a person would steer round)
const runTo = (x, z, limit, near = 2.2) => { let f = 0; I.keys.add('KeyW'); I.keys.add('ShiftLeft');
  for (; f < limit && Math.hypot(I.p.x - x, I.p.z - z) > near && !(near < 1 && I.carrying()); f++) { I.p.yaw = face(x, z); if (f % 90 === 45) I.keys.add('Space'); else I.keys.delete('Space'); I.update(1 / 60, f / 60); } I.keys.clear(); return f; };
const homeXZ = I.plotWorld(I.myPlot(), 0, 0);
const trips = E.map((t, ti) => { const egg = I.eggs.find((q) => q.tier === ti); let found = 0, home = 0, worst = 0, spare = 1e9;
  t.spots.forEach((s) => {
    egg.spot = s; egg.taken = false; egg.g.visible = true;
    if (s.dungeon) { I.goTo(4); I.p.x = I.DG.x; I.p.z = I.DG.z; I.p.inCave = I.p.inLid = true; tick(2.5); runTo(s.x, s.z, 600, 0.5); }
    else { let best = 0, bd = 1e9; I.places.forEach((pl, i) => { if (!!pl.cave !== !!s.cave) return; const d = Math.hypot(pl.x - s.x, pl.z - s.z); if (d < bd) { bd = d; best = i; } }); I.goTo(best); runTo(s.x, s.z, 60 * 40, 0.5); }
    if (!I.carrying()) tick(1);                         // land, if it was in the middle of a jump
    const c = I.carrying(); if (!c) { if (process.env.EGGDEBUG) console.log('    not found:', t.name, 'spot', s.x.toFixed(0), s.z.toFixed(0), 'h', s.y.toFixed(1), '| stopped', Math.hypot(I.p.x - s.x, I.p.z - s.z).toFixed(1), 'away at', I.zoneName(), 'h', I.p.y.toFixed(1)); return; } found++;
    let f = 0;
    if (I.p.dungeon) { I.keys.add('KeyW'); while (I.p.dungeon && f < 900) { I.p.yaw = face(I.DG.x, I.DG.z + I.DG.z1 + 3); I.update(1 / 60, 0); f++; } I.keys.clear(); }
    if (I.p.inCave) for (let tt = W.axisCoords(I.p.x, I.p.z).t; tt > W.tA - 6 && I.carrying(); tt -= 4) { const q = W.axisPoint(tt, W.caveOffset(tt)); f += runTo(q.x, q.z, 600); }
    if (I.carrying()) {                                  // into town, round the walkway between the stalls and the plots, then onto the plot
      const H0 = W.HUB, ang = (x, z) => Math.atan2(z - H0.z, x - H0.x), ring = (a) => ({ x: H0.x + Math.cos(a) * 15.5, z: H0.z + Math.sin(a) * 15.5 });
      let a = ang(I.p.x, I.p.z); const goal = ang(homeXZ.x, homeXZ.z);
      let q = ring(a); f += runTo(q.x, q.z, 60 * 60);
      while (I.carrying()) { let d = goal - a; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 0.05) break; a += Math.sign(d) * Math.min(0.4, Math.abs(d)); q = ring(a); f += runTo(q.x, q.z, 600); }
      if (I.carrying()) f += runTo(homeXZ.x, homeXZ.z, 600);
    }
    if (process.env.EGGDEBUG && (I.carrying() || I.flyers.length)) console.log('    not home:', t.name, 'from', s.x.toFixed(0), s.z.toFixed(0), '| ended at', I.p.x.toFixed(0), I.p.z.toFixed(0), I.zoneName(), 'h', I.p.y.toFixed(1), 'inCave', I.p.inCave, 'dungeon', I.p.dungeon, '| frames', f, 'left', c.left.toFixed(0), 'flown', I.flyers.length);
    if (I.ownDragons.length && !I.carrying() && !I.flyers.length) { home++; worst = Math.max(worst, f / 60); spare = Math.min(spare, c.total - f / 60); }
    I.dropEgg(); tick(2.5); I.flyers.length = 0;
  });
  return '  ' + t.name.padEnd(10) + ' found ' + found + '/' + t.spots.length + ', home in time ' + home + '/' + found + ' | slowest run home ' + worst.toFixed(0) + ' s, closest call ' + spare.toFixed(0) + ' s spare'; });
console.log('every hiding place, found on foot and run home:'); trips.forEach((l) => console.log(l));

// ---- admin egg radar ----
const radarBtn = els.adminCommands.children.find((b) => /radar/i.test(b.textContent));
if (!radarBtn) throw new Error('no egg radar button');
I.goTo(6); tick(0.1);
const near = I.nearestEgg(); let brute = Infinity; I.eggs.forEach((e) => { if (!e.taken) brute = Math.min(brute, Math.hypot(e.spot.x - I.p.x, e.spot.z - I.p.z)); });
console.log('nearest egg from the Meadow:', I.EGG_TIERS[near.egg.tier].name, near.dist.toFixed(1), '| checked against every egg', Math.abs(near.dist - brute) < 1e-9);
if (I.admin()) { els.leave.fire('click', ev({ detail: 1 })); playAgain(); reclaim(); }   // a fresh sign-in (picking up eggs earlier switched the radar off)
raf(8900); raf(8916); raf(8932);
console.log('just signed in (admin ' + I.admin() + '): radar on', I.radarOn(), '| label shown', !els.radar.hidden);
if (I.radarOn() !== I.admin()) throw new Error('the radar should start on for admins only');
if (I.admin()) { radarBtn.fire('click', ev({ detail: 1 })); raf(8950); raf(8966); console.log('admin switches it off: label shown', !els.radar.hidden); if (!els.radar.hidden) throw new Error('radar label still shown'); }
radarBtn.fire('click', ev({ detail: 1 })); raf(9000); raf(9016); raf(9032); raf(9048);
console.log('radar button clicked (admin ' + I.admin() + '): button', JSON.stringify(radarBtn.textContent), '| label shown', !els.radar.hidden, '| label', JSON.stringify(els.radar.textContent));
if (!I.admin() && !els.radar.hidden) throw new Error('radar shown to a non-admin');
if (I.admin() && els.radar.hidden) throw new Error('radar not shown to an admin');
els.leave.fire('click', ev({ detail: 1 })); raf(9100); raf(9116); raf(9132);
console.log('after Leave: radar on', I.radarOn(), '| button', JSON.stringify(radarBtn.textContent), '| label shown', !els.radar.hidden);

// ---- riding dragons ----
{
playAgain(); I.keys.clear(); reclaim();
const frameN = (n = 1) => { for (let k = 0; k < n; k++) { I.update(1 / 60, 0); I.eggsAnimate(1 / 60, 0); } };
const screenOf = (x, y, z) => {                        // where a point shows on screen: the click maths run backwards
  const o = I.camera.position, t = Math.tan(70 * Math.PI / 360), W0 = 1280, H0 = 720;
  let dx = x - o.x, dy = y - o.y, dz = z - o.z;
  const cy = Math.cos(I.p.yaw), sy = Math.sin(I.p.yaw), cp = Math.cos(I.p.pitch), sp = Math.sin(I.p.pitch);
  [dx, dz] = [dx * cy - dz * sy, dx * sy + dz * cy];
  [dy, dz] = [dy * cp + dz * sp, -dy * sp + dz * cp];
  return { x: (dx / -dz / (t * W0 / H0) + 1) / 2 * W0, y: (1 - dy / -dz / t) / 2 * H0 };
};
const click = (pt) => { els.view.fire('pointerdown', ev({ pointerType: 'mouse', pointerId: 5, clientX: pt.x, clientY: pt.y })); els.view.fire('pointerup', ev({ pointerType: 'mouse', pointerId: 5, clientX: pt.x, clientY: pt.y })); };
const tapJump = () => { window.fire('keydown', ev({ code: 'Space' })); frameN(1); window.fire('keyup', ev({ code: 'Space' })); frameN(1); };
I.goTo(7); const at = I.plotWorld(I.myPlot(), 0, -4); I.p.x = at.x; I.p.z = at.z; I.p.pitch = -0.3; frameN(2);
const pet = I.plotPets.find((d) => !d.homing);
I.p.yaw = Math.atan2(-(pet.root.position.x - I.p.x), -(pet.root.position.z - I.p.z)); I.update(1 / 60, 0);
console.log('on my plot with', I.plotPets.length, 'dragons | hint', JSON.stringify(els.hint.textContent || '(updates every 10 frames)'));
click({ x: 30, y: 30 }); console.log('click the sky                : riding', !!I.riding());
const sp0 = screenOf(pet.root.position.x, pet.root.position.y + 0.6, pet.root.position.z);
click(sp0); console.log('click the', pet.kind.padEnd(7), 'dragon     : riding', I.riding() && I.riding().kind, '| clicked at', sp0.x.toFixed(0), sp0.y.toFixed(0), '| message', said());
const rd = I.riding(), rsp = rd && screenOf(rd.root.position.x, rd.root.position.y + 0.6, rd.root.position.z);
if (!rd) throw new Error('clicking the dragon did not mount it');   // (another dragon standing in front gets it instead, which is fine)
let pet2 = rd;
let x0 = I.p.x, z0 = I.p.z; I.keys.add('KeyW'); frameN(60); I.keys.clear(); raf(20000); raf(20016);
console.log('ride forward 1 s             : moved', Math.hypot(I.p.x - x0, I.p.z - z0).toFixed(1), '(walking does 9.5) | dragon under me', Math.hypot(pet2.root.position.x - I.p.x, pet2.root.position.z - I.p.z) < 1e-6, '| sitting', (I.avatar.position.y - I.p.y).toFixed(2), 'above it | dragon size', I.riding().root.scale.x.toFixed(2));
tapJump(); frameN(40);
const offPlot = I.plotAt(I.p.x, I.p.z) !== I.myPlot();
console.log('jump once (off my plot)      : riding', !!I.riding(), '| flying', I.flying(), '| dragon into the inventory', !I.dragonPlaced[pet2.index] && !I.plotPets.includes(pet2), '| message', said());
if (I.riding()) throw new Error('one jump should get you off');
if (offPlot && (I.dragonPlaced[pet2.index] || I.plotPets.includes(pet2))) throw new Error('getting off away from your plot should put the dragon in the inventory');
I.placeDragon(pet2.index); const pet3 = I.plotPets.find((d) => d.index === pet2.index); console.log('put it back on the plot from the inventory:', !!pet3);
I.goTo(7); I.p.x = at.x; I.p.z = at.z; frameN(2); I.mount(pet3);
tapJump(); frameN(8); tapJump();
console.log('jump twice                   : flying', I.flying(), '| riding', !!I.riding());
if (!I.flying()) throw new Error('two jumps should take off');
const y0 = I.p.y; window.fire('keydown', ev({ code: 'Space' })); frameN(180); window.fire('keyup', ev({ code: 'Space' }));
console.log('hold jump 3 s                : climbed', (I.p.y - y0).toFixed(1), '| above ground', (I.p.y - W.bil(W.HT, I.p.x, I.p.z)).toFixed(1));
x0 = I.p.x; z0 = I.p.z; I.keys.add('KeyW'); frameN(60); I.keys.clear();
console.log('fly forward 1 s              : moved', Math.hypot(I.p.x - x0, I.p.z - z0).toFixed(1));
tapJump(); console.log('one jump while flying        : still riding', !!I.riding(), '| flying', I.flying());
let n2 = 0; while (I.flying() && n2++ < 60 * 40) frameN(1);
console.log('let go and glide             : landed after', (n2 / 60).toFixed(1), 's | riding', !!I.riding(), '| on ground', I.p.onGround);
tapJump(); frameN(40); console.log('jump once on the ground      : riding', !!I.riding());
// too far away, the cave, and jumping to a place
I.goTo(7); frameN(2); pet2.homing = false; const far = I.plotPets[0]; I.p.x = far.root.position.x + 14; I.p.z = far.root.position.z; I.p.y = 6.3;
I.p.yaw = Math.atan2(-(far.root.position.x - I.p.x), -(far.root.position.z - I.p.z)); I.p.pitch = -0.2; I.update(1 / 60, 0);
click(screenOf(far.root.position.x, far.root.position.y + 0.6, far.root.position.z)); console.log('click a dragon 14 away       : riding', !!I.riding(), '| message', said());
I.mount(far); I.p.inCave = true; I.p.inLid = true; frameN(1); console.log('ride into the cave           : riding', !!I.riding(), '| message', said()); I.p.inCave = I.p.inLid = false;
I.goTo(7); frameN(1); I.mount(far); window.fire('keydown', ev({ code: 'Digit1' })); window.fire('keyup', ev({ code: 'Digit1' }));
console.log('press 1 while riding         : riding', !!I.riding(), '| zone', I.zoneName(), '| dragon back on its plot', I.plotAt(far.root.position.x, far.root.position.z) === I.myPlot() || far.lx === 0);
}

// ---- lucky blocks ----
{
  const n = {}; for (let k = 0; k < 200000; k++) { const t = I.rollLucky(); n[t] = (n[t] || 0) + 1; }
  console.log('lucky blocks out:', I.luckyBlocks.length, '| odds:', E.map((t, i) => t.name + ' ' + (n[i] / 2000).toFixed(1) + '%').join(', '), '| coins', (n[-1] / 2000).toFixed(1) + '%');
  playAgain(); I.keys.clear(); if (I.riding()) I.dismount(true);
  const b = I.luckyBlocks[0], c0 = I.coins(), was = I.ownDragons.length;
  I.goTo(6); I.p.x = b.spot.x; I.p.z = b.spot.z; I.p.y = b.spot.y; I.p.vy = 0; I.p.onGround = true; I.update(1 / 60, 0);
  console.log('walk into a lucky block: picked up', I.carryingBlock() === b, '| block gone from the world', !b.m.visible, '| no egg yet', !I.carrying(), '| carry note', JSON.stringify(els.carryText.textContent), '| message', said());
  if (I.carryingBlock() !== b || I.carrying()) throw new Error('walking into a lucky block should pick it up');
  const egg0 = I.eggs.find((e) => e.tier === 0); I.p.x = egg0.spot.x; I.p.z = egg0.spot.z; I.p.y = egg0.spot.y; I.update(1 / 60, 0);
  console.log('walk into an egg holding it: picked up the egg', !!I.carrying());
  if (I.carrying()) throw new Error('picked up an egg while carrying a block');
  const b2 = I.luckyBlocks[1]; I.p.x = b2.spot.x; I.p.z = b2.spot.z; I.p.y = b2.spot.y; I.update(1 / 60, 0);
  console.log('another block while carrying: picked up', I.carryingBlock() === b2, '| message', said());
  const px = I.p.x; window.fire('keydown', ev({ code: 'Digit8' })); window.fire('keyup', ev({ code: 'Digit8' }));
  console.log('press 8 holding a block: moved', I.p.x !== px, '| message', said());
  if (I.p.x !== px) throw new Error('jumped while carrying a block');
  { const hp = I.plots[I.myPlot()], d = Math.hypot(b.spot.x - hp.x, b.spot.z - hp.z), t0 = I.blockLeft();
    console.log('countdown: started at', t0, 's for a block', d.toFixed(0), 'away (30 + distance / 7 =', Math.round(30 + d / 7) + ') | shows', JSON.stringify(els.carryText.textContent));
    if (Math.abs(t0 - Math.round(30 + d / 7)) > 0.5) throw new Error('lucky block time should depend on distance');
    tick(5); console.log('5 s later:', JSON.stringify(els.carryText.textContent));
    const hh = I.plotWorld(I.myPlot(), 0, 0); I.p.x = hh.x; I.p.z = hh.z; I.p.y = 6.3; tick(0.1); const atHome = I.blockLeft(); tick(120);
    console.log('home, then 2 minutes wait: still holding', I.carryingBlock() === b, '| clock stopped', I.blockLeft() === atHome, '| shows', JSON.stringify(els.carryText.textContent));
    if (I.carryingBlock() !== b || I.blockLeft() !== atHome) throw new Error('the clock should stop at home'); }
  const home2 = I.plotWorld(I.myPlot(), 0, 0); I.p.x = home2.x; I.p.z = home2.z; I.p.y = 6.3; for (let k = 0; k < 12; k++) raf(39000 + k * 16);
  console.log('on my plot: button says', JSON.stringify(document.getElementById('shopOpenLabel').textContent), 'shown', !document.getElementById('shopOpen').hidden, '| carry note out of its way', els.carry.hidden);
  if (document.getElementById('shopOpenLabel').textContent !== 'Open the lucky block') throw new Error('no button to open the block at home');
  const real = Math.random; Math.random = () => 0.6;      // 60 lands in Rare (50 to 80)
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); Math.random = real;
  console.log('open it: holding', !!I.carryingBlock(), '| hatching', I.hatching() && I.EGG_TIERS[I.hatching().tier].name, '| message', said());
  tick(2.5); console.log('2.5 s later: dragons', was, '->', I.ownDragons.length, '| newest', I.ownDragons[I.ownDragons.length - 1]);
  if (I.ownDragons.length !== was + 1 || !['blue', 'purple'].includes(I.ownDragons[I.ownDragons.length - 1])) throw new Error('a rare lucky egg should hatch blue or purple');
  const b3 = I.luckyBlocks[2]; I.p.x = b3.spot.x; I.p.z = b3.spot.z; I.p.y = b3.spot.y; I.update(1 / 60, 0); I.p.x = home2.x; I.p.z = home2.z; I.p.y = 6.3;
  const c1 = I.coins(); Math.random = () => 0.99; I.openLucky(); Math.random = real;
  console.log('a block with coins inside: +', (I.coins() - c1).toFixed(0), 'coins | message', said());
  { const b5 = I.luckyBlocks[4]; I.p.x = b5.spot.x; I.p.z = b5.spot.z; I.p.y = b5.spot.y; I.update(1 / 60, 0); const t5 = I.blockLeft();
    tick(t5 - 9); console.log('another block, nearly out of time:', JSON.stringify(els.carryText.textContent), '| red', els.carry.classList.contains('low'));
    tick(10); console.log('out of time: holding', !!I.carryingBlock(), '| message', said(), '| block hidden until it turns up again', !b5.m.visible);
    if (I.carryingBlock()) throw new Error('the block should crumble when time runs out');
    for (let k = 0; k < 60 * 46; k++) I.eggsAnimate(1 / 60, k / 60); console.log('46 s later it is back:', b5.m.visible); }
  const b4 = I.luckyBlocks[3]; I.p.x = b4.spot.x; I.p.z = b4.spot.z; I.p.y = b4.spot.y; I.update(1 / 60, 0);
  els.leave.fire('click', ev({ detail: 1 })); console.log('Leave holding a block: holding', !!I.carryingBlock(), '| block back in its place', b4.m.visible); playAgain(); reclaim();
  for (let k = 0; k < 60 * 50; k++) I.eggsAnimate(1 / 60, k / 60);
  console.log('50 s later the block is back', b.m.visible, '| somewhere else', Math.hypot(b.m.position.x - I.p.x, b.m.position.z - I.p.z) > 40);
}

// ---- the red stall: upgraders, restocked every 4 minutes ----
{
  const N = 20000, seen = [0, 0, 0, 0, 0], tot = [0, 0, 0, 0, 0]; let radar = 0;
  for (let r = 0; r < N; r++) { const st = I.stockFor(r); st.counts.forEach((c, k) => { if (c) { seen[k]++; tot[k] += c; } }); if (st.radar) radar++; }
  console.log('in stock, over', N, 'restocks:', I.UPGRADERS.map((u, k) => u.name + ' ' + (seen[k] / N * 100).toFixed(0) + '% (about ' + (tot[k] / Math.max(1, seen[k])).toFixed(1) + ' each time)').join(', '), '| radar', (radar / N * 100).toFixed(1) + '%');
  const find = (f) => { for (let r = 1; r < N; r++) if (f(I.stockFor(r))) return r; throw new Error('no such restock'); };
  const rA = find((st) => st.counts[0] && st.counts[1] >= 1 && !st.counts[4] && !st.radar), rB = find((st) => st.radar);
  I.setStockRound(rA);
  I.goTo(7); I.p.x = I.upFront.x; I.p.z = I.upFront.z; I.p.y = 6.3; for (let k = 0; k < 12; k++) raf(40000 + k * 16);
  const SBt = document.getElementById('shopOpenLabel').textContent;
  console.log('at the red stall: button shown', !document.getElementById('shopOpen').hidden, '| says', JSON.stringify(SBt), '| sign', JSON.stringify(I.signLabels[9]));
  if (SBt !== 'Open the upgrade shop' || document.getElementById('shopOpen').hidden) throw new Error('no upgrade shop button at the red stall');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); raf(41000);
  const rows = els.upList.children, buy = (k) => rows[k].children[1], left = (k) => rows[k].children[0].children[2].textContent;
  I.setCoins(300); I.earn(0);
  console.log('upgrade shop open', I.upShopOpen(), '| stock:', I.UPGRADERS.map((u, k) => u.name + ' ' + JSON.stringify(left(k))).join(', '), '| radar row shown', !rows[5].hidden, '|', JSON.stringify(els.upRestock.textContent));
  if (!I.upShopOpen() || left(4) !== 'Out of stock' || !buy(4).disabled) throw new Error('prismatic should be out of stock this round');
  buy(1).fire('click', ev({}));
  console.log('300 coins, try a Rare upgrader (500): message', said(), '| asked which dragon', !els.upPick.hidden);
  if (said() !== JSON.stringify("You don't have enough money.") || !els.upPick.hidden) throw new Error('should say not enough money');
  I.giveCoins(300); I.earn(0); const r0 = I.coinRate(), first = I.dragonPlaced.indexOf(true), k0 = I.ownDragons[first], n0 = I.stockLeft(1);
  buy(1).fire('click', ev({})); const picks = els.upDragons.children;
  console.log('600 coins, buy it: asks', JSON.stringify(els.upPickT.textContent), '|', picks.length, 'dragons to pick from, e.g.', JSON.stringify(picks[first].textContent));
  picks[first].fire('click', ev({}));
  console.log('give it to a placed', k0, 'dragon: coins', I.coins().toFixed(0), '| each payday', r0, '->', I.coinRate(), '| Rare left', n0, '->', I.stockLeft(1), '| message', said());
  if (Math.abs(I.coinRate() - r0 - I.DRAGON_COINS[k0]) > 1e-9 || I.coins() > 100.5 || I.stockLeft(1) !== n0 - 1) throw new Error('rare upgrader should double one placed dragon and use up one');
  I.setStockRound(rB); I.giveCoins(2e9); window.fire('keydown', ev({ code: 'Escape' })); for (let k = 0; k < 12; k++) raf(41500 + k * 16); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); raf(42000);
  console.log('a round with a radar: row shown', !rows[5].hidden, '|', JSON.stringify(rows[5].children[0].children[0].textContent), rows[5].children[1].textContent);
  rows[5].children[1].fire('click', ev({})); console.log('buy it with', Math.floor(I.coins()).toLocaleString('en-US'), 'coins: message', said(), '| coins still', Math.floor(I.coins()).toLocaleString('en-US'));
  if (rows[5].hidden || said() !== JSON.stringify("You don't have enough money.")) throw new Error('the radar should never sell');
  I.giveCoins(-2e9); I.setStockRound(null);
  window.fire('keydown', ev({ code: 'Escape' })); console.log('Escape closes it:', !I.upShopOpen());
}

// ---- your plot: 5 spaces to start, storage, buying more room ----
{
  const home3 = I.plotWorld(I.myPlot(), 0, 2); I.goTo(7); I.p.x = home3.x; I.p.z = home3.z; I.p.y = 6.3; for (let k = 0; k < 12; k++) raf(43000 + k * 16);
  console.log('on my plot: button says', JSON.stringify(document.getElementById('shopOpenLabel').textContent), '| dragons', I.ownDragons.length, '| placed', I.dragonPlaced.filter(Boolean).length, 'of', I.plotSlots(), '| roaming the plot', I.plotPets.length);
  if (I.dragonPlaced.filter(Boolean).length !== 5 || I.plotPets.length !== 5) throw new Error('only 5 dragons should be on a new plot');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); raf(44000);
  const prow = () => els.plotList.children, btn = (r) => r.children[1];
  console.log('plot menu open', I.plotMenuOpen(), '|', JSON.stringify(els.plotTitle.textContent), JSON.stringify(els.plotSpace.textContent), '| rows', prow().length, '| first', JSON.stringify(prow()[0].children[0].children[0].textContent), btn(prow()[0]).textContent);
  const r0 = I.coinRate(); btn(prow()[0]).fire('click', ev({}));
  console.log('Store the top dragon: placed', I.dragonPlaced.filter(Boolean).length, '| roaming', I.plotPets.length, '| each payday', r0, '->', I.coinRate(), '|', JSON.stringify(els.plotSpace.textContent));
  const stored = () => [...prow()].filter((r) => btn(r).textContent === 'Place');
  btn(stored()[0]).fire('click', ev({})); console.log('Place a stored one: placed', I.dragonPlaced.filter(Boolean).length);
  btn(stored()[0]).fire('click', ev({})); console.log('Place a 6th: placed', I.dragonPlaced.filter(Boolean).length, '| message', said());
  if (I.admin()) {                                       // admins have unlimited space: the 6th fits, and there is no space to buy
    console.log('admin: unlimited space, placed', I.dragonPlaced.filter(Boolean).length); if (I.dragonPlaced.filter(Boolean).length !== 6) throw new Error('admins should have unlimited space');
    els.plotDone.fire('click', ev({}));
  } else {
  if (I.dragonPlaced.filter(Boolean).length !== 5) throw new Error('a full plot took a 6th dragon');
  els.plotDone.fire('click', ev({})); console.log('Done closes it:', !I.plotMenuOpen());
  const sg = I.signSpot(); I.p.x = sg.x; I.p.z = sg.z; I.p.y = 6.3; for (let k = 0; k < 12; k++) raf(44500 + k * 16);
  const lab = () => document.getElementById('shopOpenLabel').textContent;
  console.log('at my name sign: button', JSON.stringify(lab()), 'shown', !document.getElementById('shopOpen').hidden);
  if (lab() !== 'Buy 1 more space · 500 coins') throw new Error('no buy-space button at the sign');
  I.setCoins(100); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); console.log('press it with 100 coins: message', said(), '| spaces', I.plotSlots());
  I.giveCoins(1500); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); console.log('with 1,600: spaces', I.plotSlots(), '| coins left', I.coins().toFixed(0), '| button now', JSON.stringify(lab()));
  if (I.plotSlots() !== 6 || I.spacePrice() !== 1000) throw new Error('buying space went wrong');
  I.p.x = home3.x; I.p.z = home3.z; for (let k = 0; k < 12; k++) raf(45000 + k * 16); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); raf(45300);
  btn(stored()[0]).fire('click', ev({})); console.log('back in the menu, place a 6th: placed', I.dragonPlaced.filter(Boolean).length, '| roaming', I.plotPets.length, '| saved', store['mutation-mayhem-slots'], 'spaces,', JSON.parse(store['mutation-mayhem-placed']).length, 'placed');
  els.plotDone.fire('click', ev({}));
  }
}

// ---- the inventory bar ----
{
  I.goTo(7); const hm = I.plotWorld(I.myPlot(), 0, 2); I.p.x = hm.x; I.p.z = hm.z; I.p.y = 6.3; I.update(1 / 60, 0);
  const items = () => [...els.invItems.children].map((b) => b.children[1].textContent + (b.children[2] && b.children[2].className !== 'invcount' ? ' (' + b.children[2].textContent + ')' : '') + ([...b.children].find((c) => c.className === 'invcount') || { textContent: '' }).textContent);
  I.renderInventory();
  console.log('inventory shown', !els.inv.hidden, '| stacks:', items().join(', '));
  if (els.inv.hidden || !items().length) throw new Error('stored dragons should be in the inventory');
  // buy an upgrader and keep it
  const rr = (() => { for (let r = 1; r < 20000; r++) { const st = I.stockFor(r); if (st.counts[2] && st.counts[0]) return r; } })(); I.setStockRound(rr);
  I.p.x = I.upFront.x; I.p.z = I.upFront.z; for (let k = 0; k < 12; k++) raf(46000 + k * 16); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); raf(46300);
  I.setCoins(3000); const own0 = I.upgradersOwned[2];
  els.upList.children[2].children[1].fire('click', ev({}));
  console.log('buy a Legendary upgrader: coins', I.coins().toFixed(0), '| owned', own0, '->', I.upgradersOwned[2], '| asks', JSON.stringify(els.upPickT.textContent));
  els.upCancel.fire('click', ev({})); window.fire('keydown', ev({ code: 'Escape' }));
  console.log('Back, keep it: owned', I.upgradersOwned[2], '| inventory:', items().filter((t) => /upgrader/.test(t)).join(', '));
  if (I.upgradersOwned[2] !== own0 + 1 || !items().some((t) => /^Legendary upgrader/.test(t))) throw new Error('a kept upgrader should be in the inventory');
  // use it from the inventory, on a dragon that already has an upgrader
  const withUp = I.dragonUpgrades.findIndex((u) => u >= 0 && u !== 2), oldUp = I.dragonUpgrades[withUp];
  const upBtn = [...els.invItems.children].find((b) => /^Legendary upgrader/.test(b.children[1].textContent)); upBtn.fire('click', ev({ detail: 1 }));
  console.log('click it in the inventory: panel', JSON.stringify(els.upTitle.textContent), '| asks', JSON.stringify(els.upPickT.textContent));
  els.upDragons.children[withUp].fire('click', ev({}));
  console.log('give it to dragon', withUp, '(had a', I.UPGRADERS[oldUp].name, 'upgrader): now', I.UPGRADERS[I.dragonUpgrades[withUp]].name, '| Legendary owned', I.upgradersOwned[2], '| speed now +' + I.dragonSpeed[withUp] + '%', '| panel closed', !I.upShopOpen(), '| message', said());
  if (I.dragonUpgrades[withUp] !== 2 || I.upgradersOwned[2] !== own0) throw new Error('using an upgrader from the inventory went wrong');
  { const sp0 = I.dragonSpeed[withUp]; for (let k = 0; k < 7; k++) { I.upgradersOwned[4]++; I.renderInventory(); [...els.invItems.children].find((b) => /^Prismatic upgrader/.test(b.children[1].textContent)).fire('click', ev({ detail: 1 })); els.upDragons.children[withUp].fire('click', ev({})); }
    console.log('7 Prismatic upgraders on the same dragon: speed +' + sp0 + '% -> +' + I.dragonSpeed[withUp] + '% | coins upgrader now', I.UPGRADERS[I.dragonUpgrades[withUp]].name, '| saved', JSON.parse(store['mutation-mayhem-speed'])[withUp]);
    if (I.dragonSpeed[withUp] !== sp0 + 70 || I.dragonUpgrades[withUp] !== 4) throw new Error('speed should stack'); }
  // a dragon from the inventory onto the plot
  I.p.x = hm.x; I.p.z = hm.z; I.update(1 / 60, 0);
  const dragBtn = () => [...els.invItems.children].find((b) => / dragon$/.test(b.children[1].textContent));
  const full = I.dragonPlaced.filter(Boolean).length >= I.plotSlots(); dragBtn().fire('click', ev({ detail: 1 }));
  console.log('click a dragon in the inventory: riding it', I.riding() && I.riding().kind, '| placed', I.dragonPlaced.filter(Boolean).length, 'of', I.plotSlots(), '| message', said());
  if (!I.riding()) throw new Error('clicking a dragon in the inventory should put you on it');
  I.dismount(false); console.log('get off on my plot (plot', full ? 'full' : 'has room', '): placed', I.dragonPlaced.filter(Boolean).length, '| message', said());
  if (!I.admin()) { I.giveCoins(1e6); const sg2 = I.signSpot(); I.p.x = sg2.x; I.p.z = sg2.z; for (let k = 0; k < 12; k++) raf(47000 + k * 16); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); }   // admins have no space to buy
  I.p.x = hm.x; I.p.z = hm.z; I.update(1 / 60, 0); const p0 = I.dragonPlaced.filter(Boolean).length, n0 = els.invItems.children.length; dragBtn().fire('click', ev({ detail: 1 })); I.p.x = hm.x; I.p.z = hm.z; I.dismount(false);
  console.log('bought a space, ride one out of the inventory and get off on my plot: placed', p0, '->', I.dragonPlaced.filter(Boolean).length, '| roaming', I.plotPets.length, '| saved upgraders', store['mutation-mayhem-upgraders']);
  if (I.dragonPlaced.filter(Boolean).length !== p0 + 1) throw new Error('clicking a dragon in the inventory should place it');
  I.setStockRound(null); I.setCoins(0);
}

// ---- chat ----
{
  const ci = document.getElementById('chatInput');
  console.log('chat after Play:', JSON.stringify(I.chatLog()));
  window.fire('keydown', ev({ code: 'Slash', key: '/' }));
  ci.value = '  hello   island!  '; window.fire('keydown', ev({ code: 'KeyW', key: 'w', target: ci })); window.fire('keydown', ev({ code: 'Enter', key: 'Enter', target: ci }));
  console.log('type "hello island!" and press Enter: chat', JSON.stringify(I.chatLog().slice(-1)), '| box emptied', ci.value === '', '| W while typing walks', I.keys.has('KeyW'));
  if (I.chatLog().slice(-1)[0] !== I.name() + (I.admin() ? ' (Admin)' : '') + ': hello island!' || I.keys.has('KeyW')) throw new Error('chat went wrong');
  ci.value = '   '; document.getElementById('chatSend').fire('click', ev({})); console.log('send an empty message: lines', I.chatLog().length);
  ci.value = 'x'.repeat(300); window.fire('keydown', ev({ code: 'Enter', key: 'Enter', target: ci })); console.log('a 300-letter message is cut to', I.chatLog().slice(-1)[0].length - (I.name() + (I.admin() ? ' (Admin)' : '') + ': ').length, 'letters');
  window.fire('keydown', ev({ code: 'Escape', target: ci }));
}

// ---- talking to Mia, Leo, Kai and the twins Lexi and Max ----
{
  let T = 60000; const frames = (n) => { for (let k = 0; k < n; k++) raf(T += 16); };
  const talk = () => I.talking() && I.talking().name, line = () => els.talkText.textContent;
  I.goTo(7); I.p.x = I.shopFront.x; I.p.z = I.shopFront.z; I.p.y = 6.3; I.p.yaw = Math.atan2(I.shopFront.x - I.shops[1].x, I.shopFront.z - I.shops[1].z); frames(12);
  console.log('at the blue stall: talk button', JSON.stringify(document.getElementById('talkLabel').textContent), 'shown', !els.talkBtn.hidden, '| name tags', I.keepers.map((q) => q.name).join(', '));
  const x0 = I.p.x, z0 = I.p.z; window.fire('keydown', ev({ code: 'KeyE' })); frames(15);
  console.log('hold E a quarter second: talking', talk() || 'no', '| moved sideways', Math.hypot(I.p.x - x0, I.p.z - z0).toFixed(2));
  frames(25); window.fire('keyup', ev({ code: 'KeyE' }));
  console.log('hold E longer: talking to', talk(), '| moved sideways', Math.hypot(I.p.x - x0, I.p.z - z0).toFixed(2));
  if (talk() !== 'Mia' || Math.hypot(I.p.x - x0, I.p.z - z0) > 0.01) throw new Error('holding E at the blue stall should talk to Mia');
  frames(120); console.log('Mia says:', JSON.stringify(line()), '| buttons', els.talkYes.textContent, '/', els.talkNo.textContent);
  if (line() !== 'Ugh, what do you want? Hurry up and stop wasting my time.') throw new Error("Mia's line is wrong");
  els.talkYes.fire('click', ev({})); frames(3); console.log('"Show me the avatars": avatar shop open', I.shopping(), '| talking', !!talk());
  window.fire('keydown', ev({ code: 'Escape' })); frames(3);
  I.p.x = I.upFront.x; I.p.z = I.upFront.z; frames(12);
  console.log('at the red stall: talk button', JSON.stringify(document.getElementById('talkLabel').textContent), '| shop button too', !document.getElementById('shopOpen').hidden, '| side by side', document.body.classList.contains('pair'));
  els.talkBtn.fire('click', ev({ pointerType: 'touch' })); frames(120);
  console.log('tap "Talk to Leo": Leo says:', JSON.stringify(line()), '| buttons', els.talkYes.textContent, '/', els.talkNo.textContent);
  if (talk() !== 'Leo' || line() !== 'Hi! How are you doing? Do you need an upgrader?') throw new Error("Leo's line is wrong");
  els.talkYes.fire('click', ev({})); frames(3); console.log('"Yes please!": upgrade shop open', I.upShopOpen());
  if (!I.upShopOpen()) throw new Error('Yes please should open the upgrade shop');
  window.fire('keydown', ev({ code: 'Escape' })); frames(12);
  els.talkBtn.fire('click', ev({})); I.p.x += 9; frames(5); console.log('talk, then walk away: talking', !!talk());
  I.p.x = I.upFront.x; frames(12); els.talkBtn.fire('click', ev({})); els.talkNo.fire('click', ev({})); console.log('"No thanks": talking', !!talk());
  I.p.x = I.sellFront.x; I.p.z = I.sellFront.z; frames(12); els.talkBtn.fire('click', ev({})); frames(150);
  console.log('green stall: talk to', talk(), 'says', JSON.stringify(line()), '| buttons', els.talkYes.textContent, '/', els.talkNo.textContent);
  if (talk() !== 'Kai' || !/^Yo, I'm Kai!/.test(line())) throw new Error("Kai's line is wrong");
  els.talkYes.fire('click', ev({})); frames(3); console.log('"Sell a dragon": sell shop open', I.sellOpen()); if (!I.sellOpen()) throw new Error('Kai should open the sell shop');
  window.fire('keydown', ev({ code: 'Escape' })); frames(12);
  I.p.x = I.allFront.x; I.p.z = I.allFront.z; frames(12);
  console.log('yellow stall: talk button', JSON.stringify(document.getElementById('talkLabel').textContent), '| shop button too', !document.getElementById('shopOpen').hidden);
  els.talkBtn.fire('click', ev({})); const said = [];
  for (let k = 0; k < 600 && said.length < 5; k++) { frames(1); const who = els.talkWho.textContent, l = line(); if (l === I.talkLines()[I.talkLineAt()][1] && said[said.length - 1] !== who + ': ' + l) said.push(who + ': ' + l); }
  console.log('the twins argue:\n   ' + said.join('\n   ') + '\n  buttons', els.talkYes.textContent, '/', els.talkNo.textContent);
  if (said.length !== 5 || !said[1].startsWith('Max:') || els.talkYes.textContent !== 'Lexi' || els.talkNo.textContent !== 'Max') throw new Error('the twins should argue, then ask you to pick');
  els.talkNo.fire('click', ev({})); frames(300);
  console.log('pick Max: last line', els.talkWho.textContent + ':', JSON.stringify(line()), '| buttons', els.talkYes.textContent, '/', els.talkNo.textContent, '| still talking', !!talk());
  if (els.talkYes.textContent !== 'Show me the shop' || !talk()) throw new Error('after picking, the shop button should show');
  els.talkYes.fire('click', ev({})); frames(3); console.log('"Show me the shop": Everything Shop open', I.allOpen()); if (!I.allOpen()) throw new Error('the twins should open the Everything Shop');
  window.fire('keydown', ev({ code: 'Escape' })); frames(12);
  els.talkBtn.fire('click', ev({})); frames(20); console.log('talk to the twins again: skip button shown', !els.talkSkip.hidden);
  els.talkSkip.fire('click', ev({})); console.log('press Skip:', els.talkWho.textContent + ':', JSON.stringify(els.talkText.textContent), '| buttons', els.talkYes.textContent, '/', els.talkNo.textContent, '| skip hidden', els.talkSkip.hidden);
  if (els.talkYes.textContent !== 'Lexi' || !/Who do you want/.test(els.talkText.textContent)) throw new Error('Skip should jump to the choice');
  els.talkNo.fire('click', ev({})); frames(300); els.talkNo.fire('click', ev({})); frames(3);
  I.goTo(6); frames(5); const x1 = I.p.x, z1 = I.p.z; window.fire('keydown', ev({ code: 'KeyE' })); frames(30); window.fire('keyup', ev({ code: 'KeyE' }));
  console.log('away from the shops, E still steps sideways:', Math.hypot(I.p.x - x1, I.p.z - z1).toFixed(1), 'units');
}

// ---- admins: unlimited coins, and the radar finds one egg per use ----
{
  if (I.admin()) { els.leave.fire('click', ev({ detail: 1 })); playAgain(); reclaim(); }   // fresh sign-in (earlier tests set exact coin amounts)
  for (let k = 0; k < 12; k++) raf(90000 + k * 16);
  console.log('coins (admin ' + I.admin() + '):', I.coins(), '| shown', JSON.stringify(els.coinCount.textContent), '| saved', store['mutation-mayhem-coins']);
  if (I.admin() && I.coins() !== Infinity) throw new Error('admins should have unlimited coins');
  if (I.admin()) {
    document.getElementById('adminCommands').children.find((b) => /radar/i.test(b.textContent)).fire('click', ev({ detail: 1 }));
    if (!I.radarOn()) document.getElementById('adminCommands').children.find((b) => /radar/i.test(b.textContent)).fire('click', ev({ detail: 1 }));
    const e = I.nearestEgg().egg; I.p.x = e.spot.x; I.p.z = e.spot.z; I.p.y = e.spot.y; I.p.dungeon = !!e.spot.dungeon; I.p.inCave = I.p.inLid = !!e.spot.cave; I.update(1 / 60, 0);
    console.log('radar on, pick up the egg it found: carrying', !!I.carrying(), '| radar now on', I.radarOn(), '| message', JSON.stringify(els.toast.textContent));
    if (I.radarOn()) throw new Error('the radar should switch off after one egg');
    I.dropEgg(); I.p.dungeon = I.p.inCave = I.p.inLid = false;
    const before = store['mutation-mayhem-coins']; els.leave.fire('click', ev({ detail: 1 }));
    console.log('admin leaves: coins back to', I.coins(), '| saved still', store['mutation-mayhem-coins'], '(was', before + ')');
    if (I.coins() === Infinity || store['mutation-mayhem-coins'] === 'Infinity') throw new Error('unlimited coins must not stick');
    playAgain(); reclaim();
  }
}

// ---- the green stall: selling dragons; and the admin powers ----
{
  let T = 95000; const hud = (n = 12) => { for (let k = 0; k < n; k++) raf(T += 16); };
  const lab = () => document.getElementById('shopOpenLabel').textContent;
  if (I.riding()) I.dismount(true);
  I.goTo(7); I.p.x = I.sellFront.x; I.p.z = I.sellFront.z; I.p.y = 6.3; hud();
  console.log('at the green stall: button', JSON.stringify(lab()), '| sign', JSON.stringify(I.signLabels[10]), '| keeper there', Math.hypot(I.sellKeeper.root.position.x - I.shops[2].x, I.sellKeeper.root.position.z - I.shops[2].z) < 1);
  if (lab() !== 'Open the sell shop') throw new Error('no sell shop button at the green stall');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  const rows = () => els.sellList.children.filter((r) => r.children && r.children[1]), n0 = I.ownDragons.length, c0 = I.coins();
  const top = rows()[0], btn = top.children[1];
  console.log('sell shop open', I.sellOpen(), '|', rows().length, 'dragons listed | top', JSON.stringify(top.children[0].children[0].textContent), JSON.stringify(btn.textContent));
  btn.fire('click', ev({})); console.log('press Sell once: still', I.ownDragons.length, 'dragons | button now', JSON.stringify(btn.textContent));
  if (I.ownDragons.length !== n0) throw new Error('the first press should only ask');
  const pets0 = I.plotPets.map((d) => d.index + ':' + d.kind); btn.fire('click', ev({}));
  console.log('press again: dragons', n0, '->', I.ownDragons.length, '| coins +' + (I.coins() - c0 === Infinity || isNaN(I.coins() - c0) ? '(unlimited)' : Math.round(I.coins() - c0)), '| message', said());
  if (I.ownDragons.length !== n0 - 1) throw new Error('selling should remove the dragon');
  const okPets = I.plotPets.every((d) => I.ownDragons[d.index] === d.kind); console.log('pets on the plot still match their dragons:', okPets, '| saved', JSON.parse(store['mutation-mayhem-dragons']).length);
  if (!okPets) throw new Error('plot pets point at the wrong dragons after selling');
  window.fire('keydown', ev({ code: 'Escape' })); hud(2);
  // admin powers (only work for admins)
  const nE = I.eggs.length; I.spawnEgg(5); I.spawnEgg(0);
  console.log('spawn a Fire and a Common egg (admin ' + I.admin() + '): eggs', nE, '->', I.eggs.length);
  if (I.admin()) {
    const sp = I.eggs[I.eggs.length - 2]; I.p.x = sp.spot.x; I.p.z = sp.spot.z; I.p.y = sp.spot.y; I.update(1 / 60, 0);
    console.log('  walk into the spawned Fire egg: carrying', I.carrying() && I.EGG_TIERS[I.carrying().egg.tier].name, '| chase', !!I.chase());
    const hm = I.plotWorld(I.myPlot(), 0, 0); I.p.x = hm.x; I.p.z = hm.z; I.p.y = 6.3; tick(2.5);
    console.log('  take it home: hatched', I.ownDragons.slice(-1)[0], '| spawned egg gone', !I.eggs.includes(sp));
    const n1 = I.ownDragons.length, placed1 = I.dragonPlaced.filter(Boolean).length; ['jade', 'fireboy', 'diamond', 'gold', 'ruby', 'silver', 'green'].forEach((k) => I.adminAddDragon(k));
    console.log('  add 7 dragons: dragons', n1, '->', I.ownDragons.length, '| on the plot', placed1, '->', I.dragonPlaced.filter(Boolean).length, '(space ' + I.slotLimit() + ')');
    if (I.ownDragons.length !== n1 + 7 || I.dragonPlaced.filter(Boolean).length !== placed1 + 7) throw new Error('admins should have unlimited space');
    I.banName('Taj'); I.banName(process.env.ADMIN_NAME || ''); console.log('  ban Taj and the signed-in admin (admins can\'t be banned): banned', JSON.stringify(I.banned), '| message', said());
    els.leave.fire('click', ev({ detail: 1 })); console.log('  leave: placed now', I.dragonPlaced.filter(Boolean).length, 'of', I.plotSlots());
    if (I.dragonPlaced.filter(Boolean).length > I.plotSlots()) throw new Error('unlimited space should end when the admin leaves');
    els.name.value = 'Taj'; els.name.fire('input', ev({})); els.start.fire('click', ev({ pointerType: 'mouse' }));
    console.log('  someone types Taj: playing', document.body.classList.contains('playing'), '| message', JSON.stringify(els.codeMsg.textContent));
    if (document.body.classList.contains('playing')) throw new Error('a banned name got in');
    playAgain(); reclaim(); I.banned.length = 0;
  } else if (I.eggs.length !== nE) throw new Error('only admins can spawn eggs');
}

// ---- the yellow stall: the Everything Shop ----
{
  let T = 99000; const hud = (n = 12) => { for (let k = 0; k < n; k++) raf(T += 16); };
  const lab = () => document.getElementById('shopOpenLabel').textContent;
  if (I.riding()) I.dismount(true);
  I.goTo(7); I.p.x = I.allFront.x; I.p.z = I.allFront.z; I.p.y = 6.3; hud();
  console.log('at the yellow stall: button', JSON.stringify(lab()), '| sign', JSON.stringify(I.signLabels[11]));
  if (lab() !== 'Open the Everything Shop') throw new Error('no Everything Shop button at the yellow stall');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  const tabs = els.allTabs.children, rows = () => els.allList.children.filter((r) => r.className === 'uprow'), buyBtn = (r) => r.children[2], name = (r) => r.children[1].children[0].textContent;
  console.log('shop open', I.allOpen(), '| tabs:', tabs.map((t) => t.textContent).join(', '), '| treats:', rows().map(name).join(', '));
  I.setCoins(100); buyBtn(rows()[0]).fire('click', ev({})); console.log('Coin Cookie with 100 coins:', said());
  I.setCoins(1e6); const r0 = I.coinRate(), sp0 = I.treatSpeed(); buyBtn(rows()[0]).fire('click', ev({})); buyBtn(rows()[2]).fire('click', ev({}));
  console.log('buy a Coin Cookie and a Fire Pepper: coins x' + I.treatCoins(), '| dragon speed +' + Math.round(I.treatSpeed() * 100) + '% | under the coins after a moment:', (hud(12), JSON.stringify(els.effect.textContent)));
  if (I.treatCoins() !== 2 || I.treatSpeed() !== 0.25) throw new Error('treats should boost coins and speed');
  { const c0 = I.coins(); for (let f = 0; f < 180; f++) I.earn(1 / 60); console.log('one payday with the cookie:', (I.coins() - c0).toFixed(0), 'coins (', r0, 'x 2 )'); }
  tabs[1].fire('click', ev({})); const d0 = I.decorMeshes().length; buyBtn(rows()[4]).fire('click', ev({})); buyBtn(rows()[1]).fire('click', ev({}));
  console.log('decorations tab:', rows().map(name).join(', '), '| bought fountain and fairy lights: on the plot', d0, '->', I.decorMeshes().length, '| fountain button now', JSON.stringify(buyBtn(rows()[4]).textContent));
  if (I.decorMeshes().length !== d0 + 2) throw new Error('decorations should appear on the plot');
  { const n1 = I.decorMeshes().length; buyBtn(rows()[4]).fire('click', ev({})); const c1 = I.coins();
    console.log('take the fountain off: decorations', n1, '->', I.decorMeshes().length, '| button', JSON.stringify(buyBtn(rows()[4]).textContent), '|', said());
    if (I.decorMeshes().length !== n1 - 1) throw new Error('taking a decoration off should remove it');
    buyBtn(rows()[4]).fire('click', ev({})); console.log('put it back: decorations', I.decorMeshes().length, '| free', I.coins() >= c1, '| button', JSON.stringify(buyBtn(rows()[4]).textContent));
    if (I.decorMeshes().length !== n1) throw new Error('putting it back should bring it back'); }
  tabs[2].fire('click', ev({})); buyBtn(rows()[5]).fire('click', ev({}));   // row 0 is the name collar
  const pickRows = rows(), firstPet = I.plotPets[0], idx = firstPet.index;
  console.log('outfits tab: bought a Crown -> asks', JSON.stringify(els.allList.children[0].textContent), '|', pickRows.length, 'dragons to choose from');
  pickRows[idx].children[2].fire('click', ev({}));
  console.log('put it on dragon', idx, '(' + I.ownDragons[idx] + '): wearing', I.OUTFITS[I.dragonOutfit[idx]].name, '| model on the plot has it', !!firstPet.outfit, '| crowns left to put on', I.outfitsOwned[4]);
  if (I.dragonOutfit[idx] !== 4 || !firstPet.outfit) throw new Error('the outfit should go on the dragon');
  tabs[2].fire('click', ev({})); buyBtn(rows()[1]).fire('click', ev({})); rows()[idx].children[2].fire('click', ev({}));
  console.log('then a Party hat on the same dragon: wearing', I.OUTFITS[I.dragonOutfit[idx]].name, '| the crown came back:', I.outfitsOwned[4]);
  { // name collar: buy one, pick the dragon, type a name; one collar names one dragon
    tabs[2].fire('click', ev({})); const c0 = I.coins();
    console.log('outfits tab first row:', name(rows()[0]), '|', JSON.stringify(buyBtn(rows()[0]).textContent));
    buyBtn(rows()[0]).fire('click', ev({}));
    console.log('bought a collar: paid', c0 - I.coins(), '| asks', JSON.stringify(els.allList.children[0].textContent), '| collars', I.collarsOwned());
    rows()[idx].children[2].fire('click', ev({}));
    const inp = els.allList.children.find((c) => c.className === 'collarbox').children[0], ok = els.allList.children.find((c) => c.className === 'collarbox').children[1];
    inp.value = '   '; ok.fire('click', ev({})); console.log('empty name:', said(), '| collars still', I.collarsOwned());
    inp.value = '  Sparky   the  Brave  '; ok.fire('click', ev({}));
    console.log('named it:', JSON.stringify(I.dragonNames[idx]), '| collars left', I.collarsOwned(), '| collar and name tag on the plot model', !!firstPet.collar, '|', said());
    if (I.dragonNames[idx] !== 'Sparky the Brave') throw new Error('the name should be tidied (extra spaces gone): ' + I.dragonNames[idx]);
    if (I.collarsOwned() !== 0 || !firstPet.collar) throw new Error('one collar names one dragon');
    console.log('first row now says', JSON.stringify(buyBtn(rows()[0]).textContent), '| saved names', store['mutation-mayhem-dragon-names'].slice(0, 60));
  }
  window.fire('keydown', ev({ code: 'Escape' })); console.log('Escape closes it:', !I.allOpen());
  { const t0 = I.fairyBulbs().length, b = I.fairyBulbs()[0]; I.twinkleLights(1); const a = b.m.color.r + b.m.color.g + b.m.color.b; I.twinkleLights(2.3); const c = b.m.color.r + b.m.color.g + b.m.color.b;
    console.log('fairy lights:', t0, 'bulbs | one bulb brightness', a.toFixed(2), '->', c.toFixed(2)); if (!t0 || Math.abs(a - c) < 0.01) throw new Error('fairy lights should twinkle'); }
  els.leave.fire('click', ev({ detail: 1 })); console.log('leave: decorations taken off the plot', I.decorMeshes().length === 0);
  playAgain(); reclaim(); console.log('back on a plot: decorations', I.decorMeshes().length, '| saved', store['mutation-mayhem-decor'], '| outfit saved', JSON.parse(store['mutation-mayhem-dragon-outfits'])[idx]);
  { // entrance arches: the fourth tab; buy, swap, take down, saved
    I.p.x = I.allFront.x; I.p.z = I.allFront.z; hud(); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
    tabs[3].fire('click', ev({})); I.setCoins(300000); const n0 = I.decorMeshes().length;
    console.log('arches tab:', rows().length, 'arches:', rows().map(name).join(', '));
    if (rows().length !== 12) throw new Error('there should be 12 arches');
    buyBtn(rows()[0]).fire('click', ev({})); console.log('buy the Flower arch: on the plot', I.archOn(), '| decorations', n0, '->', I.decorMeshes().length, '| button', JSON.stringify(buyBtn(rows()[0]).textContent));
    if (I.archOn() !== 'flower' || I.decorMeshes().length !== n0 + 1) throw new Error('the arch should go up');
    buyBtn(rows()[1]).fire('click', ev({})); console.log('buy the Vine arch: on the plot', I.archOn(), '| decorations', I.decorMeshes().length, '| flower button', JSON.stringify(buyBtn(rows()[0]).textContent));
    const c1 = I.coins(); buyBtn(rows()[0]).fire('click', ev({})); console.log('swap back to the Flower arch: free', I.coins() === c1, '| on', I.archOn());
    if (I.archOn() !== 'flower' || I.decorMeshes().length !== n0 + 1) throw new Error('only one arch at a time');
    I.ARCHES.forEach((a) => I.archModel(a.id)); console.log('every arch builds without errors');
    buyBtn(rows()[0]).fire('click', ev({})); console.log('take it down: on', JSON.stringify(I.archOn()), '| decorations', I.decorMeshes().length);
    buyBtn(rows()[11]).fire('click', ev({})); console.log('Dragon arch for 100,000: on', I.archOn(), '| saved', store['mutation-mayhem-arches'], store['mutation-mayhem-arch']);
    window.fire('keydown', ev({ code: 'Escape' })); hud(2);
  }
  for (const k in I.treatUntil) delete I.treatUntil[k]; I.setCoins(0);
}

// ---- admin announcement ----
{
  const ab = I.annBtn(), ai = I.annInput();
  console.log('admin commands:', els.adminCommands.children.filter((c) => c.textContent).map((c) => JSON.stringify(c.textContent)).join(', '));
  if (I.admin()) {                                     // restock shops, and lucky blocks + secret shop on the map
    const btn = (re) => els.adminCommands.children.find((c) => re.test(c.textContent));
    console.log('lucky blocks + secret shop on the map:', I.seeAllOn(), '| button', JSON.stringify(btn(/Lucky blocks/).textContent));
    if (!I.seeAllOn()) throw new Error('admins should see lucky blocks and the secret shop on the map');
    for (let k = 0; k < 6; k++) raf(95000 + k * 16);    // the map draws with the markers on
    const before = I.UPGRADERS.map((u, i) => I.stockLeft(i)).join(',');
    btn(/^Restock shops$/).fire('click', ev({ detail: 1 }));
    const after = I.UPGRADERS.map((u, i) => I.stockLeft(i)).join(',');
    console.log('restock shops: stock', before, '->', after, '|', JSON.stringify(els.toast.textContent));
    if (after !== '5,3,2,1,1') throw new Error('restock should fill every upgrader');
    // an admin's spawned fire egg: the villagers still chase you
    const home = I.plotWorld(I.myPlot(), 0, -8); I.goTo(7); I.p.x = home.x; I.p.z = home.z; I.p.y = 6.3; I.update(1 / 60, 0);
    I.p.x = home.x - 30; I.p.z = home.z; I.update(1 / 60, 0); I.spawnEgg(5);
    const fe = I.eggs[I.eggs.length - 1]; I.p.x = fe.spot.x; I.p.z = fe.spot.z; I.update(1 / 60, 0);
    console.log('admin picks up a spawned Fire egg: carrying', !!I.carrying(), '| villagers chasing', !!I.chase(), '| seconds', I.carrying() && I.carrying().left, '|', JSON.stringify(els.toast.textContent));
    if (!I.chase() || !I.carrying() || I.carrying().left !== I.FIRE_SECONDS) throw new Error('villagers should chase a spawned fire egg');
    let caught = false; for (let k = 0; k < 120 && !caught; k++) { I.update(1 / 60, k / 60); caught = !I.carrying(); }
    console.log('standing still: caught', caught, '|', JSON.stringify(els.toast.textContent), '| spawned egg gone', !I.eggs.includes(fe));
    if (!caught) throw new Error('standing still, the villagers should catch you');
    // the Storm dragon: admins only, big, fast, 10 billion a second, shoots lightning
    const stormBtn = els.adminCommands.children.find((c) => /Storm dragon/.test(c.textContent)), n0 = I.ownDragons.length, rate0 = I.coinRate();
    stormBtn.fire('click', ev({ detail: 1 }));
    const sp = I.plotPets.find((d) => I.DRAGON_KINDS[d.kind].storm), skey = 'mutation-mayhem-storm-' + I.adminNo();
    console.log('add a Storm dragon:', I.ownDragons.length - n0, 'added | on the plot', !!sp, '| kind', sp && sp.kind, '| saved count', store[skey], '| coins each payday +' + (I.coinRate() - rate0).toLocaleString('en-US'), '| sparks', sp && sp.sparks.length);
    if (!sp || I.coinRate() - rate0 !== 30e9 || store[skey] !== '1') throw new Error('the storm dragon should be on the plot making 10 billion a second');
    for (let k = 0; k < 40; k++) raf(97000 + k * 16);
    console.log('size on the plot:', sp.root.scale.x.toFixed(2), '(normal 0.75) | sparks showing', sp.sparks.filter((m) => m.visible).length);
    if (sp.root.scale.x < 1.5) throw new Error('the storm dragon should be much bigger');
    I.setCoins(Infinity); const own0 = I.ownCoins(); I.earn(3.01); console.log('payday while admin: own coins', own0, '->', I.ownCoins());
    if (!(I.ownCoins() - own0 >= 30e9)) throw new Error('storm coins should go into the admin\'s own coins');
    I.mount(sp); for (let k = 0; k < 60; k++) raf(98000 + k * 16);
    console.log('riding it: scale', sp.root.scale.x.toFixed(2), '| walk speed', I.rideSpeed(false), '(a jade walks 26)');
    if (I.rideSpeed(false) < 50) throw new Error('storm dragons should be super fast');
    { const y0 = I.p.y; let T = 99500; const fr = (n) => { for (let k = 0; k < n; k++) raf(T += 16); };
      window.fire('keydown', ev({ code: 'Space' })); fr(2); window.fire('keyup', ev({ code: 'Space' })); fr(4); window.fire('keydown', ev({ code: 'Space' })); fr(2); window.fire('keyup', ev({ code: 'Space' }));
      fr(90); const y1 = I.p.y; console.log('jump twice to fly, then let go: flying', I.flying(), '| climbed', (y1 - y0).toFixed(0), 'units in 1.5 s by itself');
      if (!I.flying() || y1 - y0 < 30) throw new Error('flying should take the dragon high into the air');
      window.fire('keydown', ev({ code: 'Space' })); fr(120); window.fire('keyup', ev({ code: 'Space' })); console.log('hold Jump 2 s more: height above where it took off', (I.p.y - y0).toFixed(0));
      { fr(60); const yh = I.p.y; fr(120); console.log('let go of Jump on an admin dragon, then 2 s more: height change', (I.p.y - yh).toFixed(2)); if (Math.abs(I.p.y - yh) > 0.5) throw new Error('admin dragons should hover'); }
      const yTop = I.p.y; I.keys.add('KeyC'); fr(60); I.keys.delete('KeyC'); console.log('hold C for 1 s: dived down', (yTop - I.p.y).toFixed(0), 'units | still flying', I.flying());
      if (yTop - I.p.y < 25) throw new Error('holding C should dive down fast');
      I.p.y = y0; I.p.vy = 0; fr(3); }
    { // zap one of your own dragons: Lightning mutation, twice the coins
      const pet = I.plotPets.find((d) => !d.ridden && !I.DRAGON_KINDS[d.kind].storm), i = pet.index, r0 = I.coinRate();
      I.p.x = pet.root.position.x + 10; I.p.z = pet.root.position.z; I.update(1 / 60, 0); pet.wait = 99;
      const from = I.camera.position, tx = pet.root.position.x - from.x, ty = pet.root.position.y + 0.7 - from.y, tz = pet.root.position.z - from.z;
      I.zap({ dx: tx, dy: ty, dz: tz, len: Math.hypot(tx, ty, tz), o: from });
      console.log('zap my', pet.kind, 'dragon:', JSON.stringify(els.toast.textContent), '| mutation', I.dragonMutation[i], '| its coins', I.DRAGON_COINS[pet.kind], '->', I.dragonValue(i) / (I.dragonUpgrades[i] >= 0 ? I.UPGRADERS[I.dragonUpgrades[i]].boost : 1), '| plot rate', r0, '->', I.coinRate(), '| sparks', !!pet.sparks, '| saved', JSON.parse(store['mutation-mayhem-mutations'])[i]);
      if (I.dragonMutation[i] !== 'lightning' || I.dragonValue(i) !== 2 * I.DRAGON_COINS[pet.kind] * (I.dragonUpgrades[i] >= 0 ? I.UPGRADERS[I.dragonUpgrades[i]].boost : 1)) throw new Error('lightning should mutate the dragon and double its coins');
      for (let k = 0; k < 30; k++) I.zapStep(1 / 60);
    }
    const v = I.villagers[0]; I.p.x = v.x + 12; I.p.z = v.z; I.update(1 / 60, 0);
    const from = I.camera.position, tx = v.f.root.position.x - from.x, ty = v.f.root.position.y + 1 - from.y, tz = v.f.root.position.z - from.z;
    const vx0 = v.x, vz0 = v.z; I.zap({ dx: tx, dy: ty, dz: tz, len: Math.hypot(tx, ty, tz), o: from });
    console.log('zap a villager:', JSON.stringify(els.toast.textContent), '| bolt drawn', I.bolts.length > 0);
    for (let k = 0; k < 60; k++) I.zapStep(1 / 60);
    console.log('villager bounced back', Math.hypot(v.x - vx0, v.z - vz0).toFixed(1), 'units, away from me', Math.hypot(v.x - I.p.x, v.z - I.p.z) > 12);
    if (Math.hypot(v.x - vx0, v.z - vz0) < 3 || Math.hypot(v.x - I.p.x, v.z - I.p.z) < 12) throw new Error('lightning should bounce the villager backwards');
    for (let k = 0; k < 200; k++) I.zapStep(1 / 60); console.log('bolts gone', I.bolts.length === 0, '| knocked list empty', I.knocked.length === 0);
    els.leave.fire('click', ev({ detail: 1 }));
    console.log('leave: storm dragons gone from the list', !I.ownDragons.some((k) => I.DRAGON_KINDS[k].storm), '| saved list has none', !JSON.parse(store['mutation-mayhem-dragons']).some((k) => /^storm/.test(k)), '| still counted for admins', I.stormCount(), '| own coins kept', Number(store['mutation-mayhem-coins']) >= 30e9);
    if (I.ownDragons.some((k) => I.DRAGON_KINDS[k].storm) || JSON.parse(store['mutation-mayhem-dragons']).some((k) => /^storm/.test(k))) throw new Error('non-admins must not get storm dragons');
    playAgain(); reclaim(); console.log('admin back: storm dragons', I.ownDragons.filter((k) => I.DRAGON_KINDS[k].storm).length, '| on the plot', I.plotPets.filter((d) => I.DRAGON_KINDS[d.kind].storm).length);
    btn(/Lucky blocks/).fire('click', ev({ detail: 1 })); console.log('switch the map markers off:', I.seeAllOn());
    btn(/Lucky blocks/).fire('click', ev({ detail: 1 }));
  }
  ab.fire('click', ev({})); ai.value = 'Fire village is lit, come join!'; window.fire('keydown', ev({ code: 'KeyW', target: ai })); window.fire('keydown', ev({ code: 'Enter', key: 'Enter', target: ai }));
  console.log('announce (admin ' + I.admin() + '): banner shown', !els.announce.hidden, '| says', JSON.stringify(els.announce.children.map((c) => c.textContent).join(' | ')), '| W walked', I.keys.has('KeyW'));
  if (I.admin() === els.announce.hidden) throw new Error('only admins should be able to announce');
  I.showAnnouncement('Adriana', 'hello everyone'); console.log('showAnnouncement: banner', JSON.stringify(els.announce.children.map((c) => c.textContent).join(' | ')));
  for (let k = 0; k < 60 * 9; k++) I.eggsAnimate(1 / 60, 0); console.log('9 s later the banner is gone:', els.announce.hidden);
}

// ---- the secret shop, the fire village and the fire egg chase ----
{
  let T = 70000; const fr = (n = 1) => { for (let k = 0; k < n; k++) { I.update(1 / 60, 0); I.eggsAnimate(1 / 60, 0); } }, hud = (n = 12) => { for (let k = 0; k < n; k++) raf(T += 16); };
  const V = I.VILLAGE, vy = W.bil(W.H, V.x, V.z), stand = (x, z, y) => { I.p.x = x; I.p.z = z; I.p.y = y === undefined ? W.bil(W.H, x, z) : y; I.p.vy = 0; I.p.onGround = true; I.p.dungeon = I.p.inCave = I.p.inLid = false; };
  const lab = () => document.getElementById('shopOpenLabel').textContent;
  I.goTo(8); hud(); console.log('jump to the Village place: zone', I.zoneName(), '| villagers', I.villagers.length, '| hint', JSON.stringify(els.hint.textContent));
  // the secret shop
  stand(I.secretFront.x, I.secretFront.z); hud(); console.log('at the secret shop: button', JSON.stringify(lab()), '| own a diamond dragon', I.ownDragons.includes('diamond'));
  if (lab() !== 'Open the secret shop') throw new Error('no secret shop button');
  window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  I.setCoins(1000); els.secretBuy.fire('click', ev({})); console.log('shop open', I.secretOpen(), '| buy fire resistance with 1,000 coins:', said(), '| resistance', I.fireResUntil() > Date.now());
  // the fire, before resistance
  I.setFireClock(300); fr(); hud(); stand(V.x + 6, V.z); fr(); hud(); console.log('fire out: fire egg there', I.fireEggThere(), '| hint', JSON.stringify(els.hint.textContent));
  I.setFireClock(10); stand(V.x + 0.5, V.z, vy); fr(2);
  console.log('fire lit, no resistance, step into it: pushed back to', Math.hypot(I.p.x - V.x, I.p.z - V.z).toFixed(1), 'from the middle | carrying', !!I.carrying(), '| message', said());
  if (I.carrying() || Math.hypot(I.p.x - V.x, I.p.z - V.z) < 3.3) throw new Error('the fire should push you back without resistance');
  window.fire('keydown', ev({ code: 'Escape' }));
  stand(I.secretFront.x, I.secretFront.z); hud(); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  I.giveCoins(300000); els.secretBuy.fire('click', ev({})); hud(2);
  console.log('buy it with 301,000: coins left', Math.floor(I.coins()), '| resistance for', ((I.fireResUntil() - Date.now()) / 1000).toFixed(0), 's | shows', JSON.stringify(els.secretRes.textContent), '| under the coins', JSON.stringify(els.effect.textContent));
  window.fire('keydown', ev({ code: 'Escape' }));
  // grab it on foot: the villagers catch you
  const home = I.plotWorld(I.myPlot(), 0, 0);
  stand(V.x + 0.3, V.z, vy); fr(2);
  console.log('step into the fire with resistance: carrying', I.carrying() && I.EGG_TIERS[I.carrying().egg.tier].name, 'egg,', I.carrying() && I.carrying().total, 's | chase on', !!I.chase(), '| message', said());
  if (!I.carrying() || I.carrying().total !== I.FIRE_SECONDS) throw new Error('should grab the fire egg with 15 seconds');
  I.keys.add('KeyW'); I.keys.add('ShiftLeft'); let n = 0; while (I.carrying() && n++ < 600) { I.p.yaw = face(home.x, home.z); fr(); } I.keys.clear();
  console.log('run home on foot: caught after', (n / 60).toFixed(1), 's | carrying', !!I.carrying(), '| back on my plot', I.plotAt(I.p.x, I.p.z) === I.myPlot(), '| egg back in the fire', I.fireEggThere(), '| message', said());
  if (I.carrying() || I.plotAt(I.p.x, I.p.z) !== I.myPlot() || !I.fireEggThere()) throw new Error('getting caught should send you home without the egg');
  // too slow
  stand(V.x + 0.3, V.z, vy); fr(2); I.chase().wait = 1e9; fr(60 * 16);
  console.log('grab it and stand still (villagers held back): after 16 s carrying', !!I.carrying(), '| home', I.plotAt(I.p.x, I.p.z) === I.myPlot(), '| message', said());
  // on a dragon: too slow, then fast enough
  const flyHome = (speedUp) => {
    const hp = I.plotWorld(I.myPlot(), 0, 2); stand(hp.x, hp.z, 6.3); fr(2);
    const pet = I.plotPets.find((d) => !d.homing); I.dragonSpeed[pet.index] = speedUp; I.mount(pet);
    const tj = () => { window.fire('keydown', ev({ code: 'Space' })); fr(1); window.fire('keyup', ev({ code: 'Space' })); fr(1); };
    tj(); fr(6); tj(); window.fire('keydown', ev({ code: 'Space' })); fr(30); window.fire('keyup', ev({ code: 'Space' }));
    I.p.x = V.x + 0.3; I.p.z = V.z; I.p.y = vy + 2; fr(1);
    const got = !!I.carrying(); I.keys.add('KeyW'); I.keys.add('ShiftLeft'); let k = 0;
    while (I.carrying() && k++ < 60 * 16) { I.p.yaw = face(hp.x, hp.z); if (I.p.y < W.bil(W.HT, I.p.x, I.p.z) + 12) I.keys.add('Space'); else I.keys.delete('Space'); fr(); } I.keys.clear();
    const out = { kind: pet.kind, speed: I.rideSpeed ? (I.riding() ? I.rideSpeed(true).toFixed(0) : '-') : '-', got, secs: (k / 60).toFixed(1), msg: said(), dragons: I.ownDragons.slice(-1)[0] };
    if (I.riding()) I.dismount(true); return out;
  };
  const slow = flyHome(0); console.log('fly it home on a', slow.kind, 'dragon with no speed upgrades: grabbed', slow.got, '| after', slow.secs, 's:', slow.msg);
  if (!/caught/.test(slow.msg)) throw new Error('an unupgraded dragon should be caught');
  const before = I.ownDragons.length, fast = flyHome(400); for (let k = 0; k < 150; k++) I.eggsAnimate(1 / 60, 0);
  console.log('fly it home on a', fast.kind, 'dragon at +400% speed: grabbed', fast.got, '| home after', fast.secs, 's | dragons', before, '->', I.ownDragons.length, '| hatched', I.ownDragons.slice(-1)[0], '| it earns', I.DRAGON_COINS[I.ownDragons.slice(-1)[0]], 'every 3 s | fire egg there now', I.fireEggThere());
  if (I.ownDragons.length !== before + 1 || !/^fire(boy|girl)$/.test(I.ownDragons.slice(-1)[0]) || I.fireEggThere()) throw new Error('a fast dragon should get the fire egg home and hatch a fire dragon');
  const n50 = {}; for (let k = 0; k < 20000; k++) { const d = I.pickDragon(5); n50[d] = (n50[d] || 0) + 1; } console.log('fire egg hatches:', Object.keys(n50).map((k) => k + ' ' + (n50[k] / 200).toFixed(0) + '%').join(', '));
  I.setFireClock(null);
}

// ---- the nuke bunker: the keypad, the radiation, the nuke egg and the nuclear monster ----
{
  let T = 120000; const fr = (n = 1) => { for (let k = 0; k < n; k++) { I.update(1 / 60, 0); I.eggsAnimate(1 / 60, 0); } }, hud = (n = 12) => { for (let k = 0; k < n; k++) raf(T += 16); };
  const BK = I.BK, by = W.bil(W.H, BK.x, BK.z), stand = (w, y) => { I.p.x = w.x; I.p.z = w.z; I.p.y = y === undefined ? W.bil(W.H, w.x, w.z) : y; I.p.vy = 0; I.p.onGround = true; I.p.dungeon = I.p.inCave = I.p.inLid = false; };
  const lab = () => document.getElementById('shopOpenLabel').textContent;
  if (I.riding()) I.dismount(true);
  console.log('nuke bunker at', BK.x, BK.z, '| ground levelled to', by.toFixed(2), '(asked', BK.h + ')', '| distance from town', Math.hypot(BK.x - W.HUB.x, BK.z - W.HUB.z).toFixed(0));
  if (Math.abs(by - BK.h) > 0.05) throw new Error('the bunker ground should be level');
  const kp = I.bkWorld(2.1, 7.4); stand(kp); hud();
  console.log('at the bunker keypad: button', JSON.stringify(lab()), '| hint', JSON.stringify(els.hint.textContent));
  if (lab() !== 'Use the keypad') throw new Error('no keypad button');
  stand(I.bkWorld(0, 5.5)); fr(); console.log('walk into the locked door: pushed back to', I.bkLocal(I.p.x, I.p.z).lz.toFixed(1), '| message', said());
  if (I.bkLocal(I.p.x, I.p.z).lz < 6.4) throw new Error('the locked door should stop you');
  stand(kp); hud(); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  console.log('keypad open', I.keypadOpen());
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((c) => window.fire('keydown', ev({ code: c }))); window.fire('keydown', ev({ code: 'Enter' }));
  console.log('type 1234: door open', I.bunkerOpen(), '| message', said(), '| jumped somewhere', I.zoneName());
  if (I.bunkerOpen()) throw new Error('a wrong code should not open the door');
  ['5', '3', '6', '7'].forEach((k) => I.kpPress(k)); I.kpPress('OK'); hud(60);
  console.log('type 5367: door open', I.bunkerOpen(), '| keypad closed', !I.keypadOpen(), '| message', said());
  if (!I.bunkerOpen()) throw new Error('5367 should open the door');
  I.setRadRes(0); stand(I.bkWorld(0, 4)); fr(); console.log('walk in with no radiation resistance: bounced to', I.bkLocal(I.p.x, I.p.z).lz.toFixed(1), '| message', said());
  if (I.bkLocal(I.p.x, I.p.z).lz < 6.5) throw new Error('radiation should bounce you back');
  stand(I.secretFront); hud(); window.fire('keydown', ev({ code: 'Enter', key: 'Enter' })); hud(2);
  I.setCoins(5e6); els.secretBuyRad.fire('click', ev({})); console.log('secret shop: buy a radioactive resistant upgrader:', said(), '| left', I.radResLeft().toFixed(0), 's | effects', JSON.stringify(els.effect.textContent));
  if (I.radResLeft() < 290) throw new Error('radiation resistance should last 5 minutes');
  window.fire('keydown', ev({ code: 'Escape' }));
  stand(I.bkWorld(0, 2)); fr(); console.log('walk in with resistance: inside', I.bkLocal(I.p.x, I.p.z).lz.toFixed(1), '| nuke egg there', I.nukeEggThere(), '| hint', JSON.stringify((hud(), els.hint.textContent)));
  console.log('monster at its pit:', I.bkLocal(I.monster.x, I.monster.z).lz.toFixed(1), I.monster.x, I.monster.z);
  stand(I.eggW); fr(2);
  console.log('step onto the stand: carrying', I.carrying() && I.EGG_TIERS[I.carrying().egg.tier].name, 'egg,', I.carrying() && I.carrying().total, 's | monster chasing', !!I.mchase(), '|', said());
  if (!I.carrying() || I.carrying().total !== 13 || !I.mchase()) throw new Error('grabbing the nuke egg should give 13 seconds and start the monster');
  let n = 0; while (I.carrying() && n++ < 600) fr();
  console.log('stand still: caught after', (n / 60).toFixed(2), 's | home', I.plotAt(I.p.x, I.p.z) === I.myPlot(), '| egg back', I.nukeEggThere(), '|', said());
  if (I.carrying() || !/nuclear monster caught/.test(said())) throw new Error('the monster should catch you');
  // fly it home on a fire dragon with 8, then 9 Prismatic upgraders (each +10% speed)
  const flyHome = (ups) => {
    const hp = I.plotWorld(I.myPlot(), 0, 2); stand(hp, 6.3); fr(2);
    const pet = I.plotPets.find((d) => !d.homing && !I.DRAGON_KINDS[d.kind].storm), kind0 = pet.kind; pet.kind = 'fireboy'; I.dragonSpeed[pet.index] = ups * 10; I.mount(pet); const spd = I.rideSpeed(true).toFixed(0);
    const tj = () => { window.fire('keydown', ev({ code: 'Space' })); fr(1); window.fire('keyup', ev({ code: 'Space' })); fr(1); };
    tj(); fr(6); tj(); fr(30);
    I.p.x = I.eggW.x; I.p.z = I.eggW.z; I.p.y = by + 2; fr(1);
    const got = !!I.carrying(); I.keys.add('KeyW'); I.keys.add('ShiftLeft'); let k = 0;
    const door = I.bkWorld(0, 9);                       // out through the door first, then straight home
    while (I.carrying() && k++ < 60 * 16) { I.p.yaw = I.bkLocal(I.p.x, I.p.z).lz < 6.5 ? face(door.x, door.z) : face(hp.x, hp.z); if (I.p.y < W.bil(W.HT, I.p.x, I.p.z) + 12) I.keys.add('Space'); else I.keys.delete('Space'); fr(); } I.keys.clear();
    const out = { speed: spd, got, secs: (k / 60).toFixed(1), msg: said(), last: I.ownDragons.slice(-1)[0] };
    if (I.riding()) I.dismount(true); pet.kind = kind0; I.dragonSpeed[pet.index] = 0; return out;
  };
  const r8 = flyHome(8); console.log('fire dragon + 8 Prismatic (speed', r8.speed + '): grabbed', r8.got, '| after', r8.secs, 's:', r8.msg);
  if (!/caught/.test(r8.msg)) throw new Error('8 upgraders should not be enough');
  const before = I.ownDragons.length, r9 = flyHome(9); for (let k = 0; k < 150; k++) I.eggsAnimate(1 / 60, 0);
  console.log('fire dragon + 9 Prismatic (speed', r9.speed + '): grabbed', r9.got, '| home after', r9.secs, 's |', r9.msg, '| dragons', before, '->', I.ownDragons.length, '| hatched', I.ownDragons.slice(-1)[0], 'earning', I.DRAGON_COINS[I.ownDragons.slice(-1)[0]], '| egg gone till next time', !I.nukeEggThere());
  if (I.ownDragons.length !== before + 1 || !/^nuke(boy|girl)$/.test(I.ownDragons.slice(-1)[0]) || I.nukeEggThere()) throw new Error('9 upgraders should get the nuke egg home');
  const n50 = {}; for (let k = 0; k < 20000; k++) { const d = I.pickDragon(I.NUKE_TIER); n50[d] = (n50[d] || 0) + 1; } console.log('nuke egg hatches:', Object.keys(n50).map((k) => k + ' ' + (n50[k] / 200).toFixed(0) + '%').join(', '));
}

// ---- the fire storm, the plot button, the admin shop ----
{
  const fr = (n = 1) => { for (let k = 0; k < n; k++) { I.update(1 / 60, 0); I.fireStormStep(1 / 60); } };
  if (I.riding()) I.dismount(true);
  if (I.myPlot() < 0) reclaim();
  const hm = I.plotWorld(I.myPlot(), 0, -3); I.goTo(7); I.p.x = hm.x; I.p.z = hm.z; I.p.y = 6.3; for (let k = 0; k < 12; k++) raf(150000 + k * 16);
  const sb = document.getElementById('shopOpen');
  console.log('on my plot: button', JSON.stringify(document.getElementById('shopOpenLabel').textContent), '| at the side of the screen', sb.classList.contains('corner'));
  if (!sb.classList.contains('corner')) throw new Error('the plot button should sit at the side');
  const before = I.plotPets.filter((d) => I.hasMut(d.index, 'fire')).length;
  I.startFireStorm('Test'); fr(1); console.log('fire storm on', I.fireStormOn(), '|', said(), '| effects', JSON.stringify(els.effect.textContent));
  { const xs = []; for (let k = 0; k < 200; k++) { I.spawnFireball(); const f = I.fireballs[I.fireballs.length - 1]; xs.push(Math.hypot(f.x - I.p.x, f.z - I.p.z)); I.fireballs.pop(); }
    const far = xs.filter((d) => d > 60).length; console.log('200 random fireballs: landing more than 60 away from me', far, '| furthest', Math.max(...xs).toFixed(0));
    if (far < 100) throw new Error('fireballs should land all over the island'); }
  const aim = I.plotPets.find((d) => !d.ridden && !d.loose); aim.wait = 999; I.spawnFireball(aim.root.position.x, aim.root.position.z);   // one that happens to land on a dragon
  let n = 0, hit = null; while (n++ < 60 * 10 && !hit) { fr(); hit = I.plotPets.find((d) => I.hasMut(d.index, 'fire') && !d.loose); }
  console.log('fireballs falling:', I.fireballs.length, '| after', (n / 60).toFixed(1), 's a dragon was hit:', hit && hit.kind, '|', said(), '| label', hit && JSON.stringify(I.ownDragons.length && hit && (I.plotPets.includes(hit) ? 'ok' : '')));
  if (!hit) throw new Error('fireballs should give a dragon the fire mutation');
  const pet = hit; I.mount(pet); const sp = I.rideSpeed(false); I.dismount(true);
  const plain = (() => { const was = I.dragonMutation[pet.index]; I.dragonMutation[pet.index] = ''; I.mount(pet); const v = I.rideSpeed(false); I.dismount(true); I.dragonMutation[pet.index] = was; return v; })();
  console.log('riding the fire dragon: speed', sp.toFixed(1), 'vs', plain.toFixed(1), 'without the mutation | saved', JSON.parse(store['mutation-mayhem-mutations'])[pet.index]);
  if (Math.abs(sp - plain * 3) > 0.01) throw new Error('fire mutation should make it three times as fast');
  console.log('admin shop: button shown only to admins', I.admin());
  I.openAdminShop(); console.log('open the admin shop:', I.allOpen(), JSON.stringify(els.allTitle.textContent));
  if (I.admin()) {
    const rows = () => els.allList.children.filter((r) => r.className === 'uprow');
    console.log('  items:', rows().map((r) => r.children[1].children[0].textContent).join(', '), '| first button', JSON.stringify(rows()[0].children[2].textContent));
    const d0 = I.decorMeshes().length, c0 = I.coins(); rows().forEach((r) => r.children[2].fire('click', ev({})));
    for (let k = 0; k < 10; k++) raf(160000 + k * 16);
    console.log('  put all', I.ADMIN_DECOR.length, 'on my plot: decorations', d0, '->', I.decorMeshes().length, '| moving parts', I.adminAnims().length, '| free (no coins taken)', I.coins() >= c0, '| saved', store['mutation-mayhem-admin-decor']);
    if (I.decorMeshes().length !== d0 + I.ADMIN_DECOR.length) throw new Error('admin decorations should go on the plot');
    window.fire('keydown', ev({ code: 'Escape' }));
  } else if (I.allOpen()) throw new Error('only admins can open the admin shop');
  for (let k = 0; k < 60 * 310; k++) I.fireStormStep(1 / 60);
  const pickWithout = (id) => { const ok = I.plotPets.filter((q) => !q.loose && !q.ridden), d = ok.find((q) => !I.hasMut(q.index, id)) || ok[0]; I.dragonMutation[d.index] = (I.dragonMutation[d.index] || '').split(' ').filter((w) => w && w !== id).join(' '); I.buildMutFx(d); return d; };
  { // every mutation: its look builds and moves, and the coins multiply
    const d = I.plotPets.find((q) => !q.loose && !q.ridden), i = d.index, was = I.dragonMutation[i], base = I.DRAGON_COINS[d.kind] * (I.dragonUpgrades[i] >= 0 ? I.UPGRADERS[I.dragonUpgrades[i]].boost : 1);
    I.MUTATIONS.forEach((m) => { I.dragonMutation[i] = m.id; I.buildMutFx(d); for (let k = 0; k < 20; k++) I.mutStep(d, 1 / 30, k / 30); });
    console.log(I.MUTATIONS.length, 'mutations all build and move:', I.MUTATIONS.map((m) => m.emoji + m.name + '×' + m.coins).join(' '));
    I.dragonMutation[i] = 'cosmic golden'; console.log('Cosmic + Golden on a', d.kind, 'dragon: coins', base, '->', I.dragonValue(i), '(×5 ×3)');
    if (I.dragonValue(i) !== base * 15) throw new Error('mutations should multiply the coins');
    I.dragonMutation[i] = was; I.buildMutFx(d);
    console.log('events:', I.EVENT_LIST.length, '| every mutation has its own event:', I.MUTATIONS.every((m) => I.EVENTS[m.id]), '| next up:', I.nextEvent().e.name, 'in', I.nextEvent().inS.toFixed(0), 's');
    { let two = 0, seen = new Set(); for (let k = 0; k < 4000; k++) { const l = I.slotEvents(100000 + k); if (l.length === 2) two++; l.forEach((e) => seen.add(e.id)); }
      console.log('events every 30 minutes for 5 minutes | over 4000 half hours: two at once', (two / 40).toFixed(1) + '% | different events seen', seen.size);
      if (two / 4000 < 0.05 || two / 4000 > 0.2 || seen.size !== I.EVENT_LIST.length) throw new Error('events should be random, sometimes two at once'); }
    if (!I.MUTATIONS.every((m) => I.EVENTS[m.id])) throw new Error('every mutation needs an event');
  }
  { // the rock fall: a rock on a dragon makes it a Giant
    const d = pickWithout('giant'), s0 = d.root.scale.x; d.wait = 999;
    I.startEvent('rocks'); I.spawnFireball(d.root.position.x, d.root.position.z, 'rock'); let k = 0; while (k++ < 300 && !I.hasMut(d.index, 'giant')) I.fireStormStep(1 / 60);
    for (let f = 0; f < 30; f++) I.update(1 / 60, 0);
    console.log('rock fall: a rock lands on a', d.kind, 'dragon: Giant', I.hasMut(d.index, 'giant'), '| size', s0.toFixed(2), '->', d.root.scale.x.toFixed(2), '|', said());
    if (!I.hasMut(d.index, 'giant') || d.root.scale.x < s0 * 1.9) throw new Error('a rock should make the dragon twice as big');
  }
  { // UFOs: the green beam gives the UFO mutation
    const d = pickWithout('ufo'); d.wait = 999;
    I.startEvent('ufo'); I.fireStormStep(1 / 60); console.log('UFO invasion: UFOs in the sky', I.ufos.length);
    const u = I.ufos[0]; u.x = u.tx = d.root.position.x; u.z = u.tz = d.root.position.z; u.beamT = 3; I.fireStormStep(1 / 60);
    console.log('  a beam shines on a', d.kind, 'dragon: UFO mutation', I.hasMut(d.index, 'ufo'), '| beam showing', u.beam.visible, '|', said());
    if (!I.hasMut(d.index, 'ufo')) throw new Error('the UFO beam should give the UFO mutation');
  }
  { // air jets: the Dirt mutation
    const d = pickWithout('dirt'); d.wait = 999;
    I.startEvent('dirt'); I.spawnJet(d.root.position.x, d.root.position.z); I.fireStormStep(1 / 60);
    console.log('air jets: one blasts up under a', d.kind, 'dragon: Dirt', I.hasMut(d.index, 'dirt'), '| jets', I.jets.length, '|', said());
    if (!I.hasMut(d.index, 'dirt')) throw new Error('an air jet should give the Dirt mutation');
  }
  { // the volcano: magma rocks
    const d = pickWithout('magma'); d.wait = 999; I.startEvent('magma');
    I.spawnFireball(d.root.position.x, d.root.position.z, 'magma', I.crater); let k = 0; while (k++ < 400 && !I.hasMut(d.index, 'magma')) I.fireStormStep(1 / 60);
    console.log('volcano at', I.VOLCANO.x, I.VOLCANO.z, '| a magma rock arcs onto a', d.kind, 'dragon after', (k / 60).toFixed(1), 's: Magma', I.hasMut(d.index, 'magma'), '|', said());
    if (!I.hasMut(d.index, 'magma')) throw new Error('magma rocks should give the Magma mutation');
  }
  { // every event starts and runs without trouble, and gives its mutation
    let got = 0; const errs = [];
    I.EVENT_LIST.forEach((ev) => {
      try {
        const d = pickWithout(ev.id); d.wait = 999; I.startEvent(ev.id);
        for (let k = 0; k < 30; k++) I.fireStormStep(1 / 60);
        if (ev.kind === 'fall') I.spawnFireball(d.root.position.x, d.root.position.z, ev.id);
        if (ev.kind === 'volcano') I.spawnFireball(d.root.position.x, d.root.position.z, ev.id, I.crater);
        if (ev.kind === 'spot') I.spawnJet(d.root.position.x, d.root.position.z, ev.id);
        if (ev.kind === 'fly') { const u = I.ufos.find((q) => q.ev.id === ev.id); u.x = u.tx = d.root.position.x; u.z = u.tz = d.root.position.z; u.beamT = 3; }
        let k = 0; while (k++ < 60 * 8 && !I.hasMut(d.index, ev.id)) I.fireStormStep(1 / 60);
        if (I.hasMut(d.index, ev.id)) got++; else errs.push(ev.id);
      } catch (e) { errs.push(ev.id + ': ' + e.message); }
    });
    console.log('all', I.EVENT_LIST.length, 'events ran: gave their mutation', got, '| problems', JSON.stringify(errs));
    if (errs.length) throw new Error('some events did not work: ' + errs.join(', '));
  }
  console.log('admin commands now:', els.adminCommands.children.filter((c) => c.className === 'adminhead').map((c) => c.textContent).join(' | '));
  for (let k = 0; k < 60 * 310; k++) I.fireStormStep(1 / 60);
}

// ---- the swamp, the quicksand and the mud cavern ----
{
  const fr = (n = 1) => { for (let k = 0; k < n; k++) I.update(1 / 60, 0); };
  if (I.riding()) I.dismount(true);
  const S = W.SWAMP; let low = 0, n = 0; for (let k = 0; k < 400; k++) { const a = k * 2.4, r = Math.sqrt(k / 400) * S.r * 0.9, h = W.bil(W.H, S.x + Math.cos(a) * r, S.z + Math.sin(a) * r); n++; if (h < 1) low++; }
  console.log('swamp at', S.x, S.z, '| low boggy ground', Math.round(low / n * 100) + '% | the desert next door at', I.MUD_EXIT.x, I.MUD_EXIT.z, 'is', W.desertF(I.MUD_EXIT.x, I.MUD_EXIT.z) > 0.5 ? 'desert' : 'not desert');
  I.goTo(I.places.findIndex((q) => q.name === 'Swamp')); fr(2); console.log('the Swamp place: zone', I.zoneName());
  if (I.zoneName() !== 'Swamp') throw new Error('should be in the swamp');
  const q = I.QS; I.p.x = q.x + 1; I.p.z = q.z; I.p.y = W.bil(W.H, I.p.x, I.p.z); I.p.onGround = true; fr(1);
  console.log('step onto the quicksand: sinking', I.sinkT() >= 0, '|', said());
  if (I.sinkT() < 0) throw new Error('quicksand should catch you');
  let t = 0; while (I.sinkT() >= 0 && t < 60 * 20) { t++; fr(); }
  console.log('fell for', (t / 60).toFixed(1), 's | zone', I.zoneName(), '| floor', I.p.y.toFixed(0), '|', said());
  if (I.zoneName() !== 'Mud cavern' || t < 60 * 11 || t > 60 * 12.5) throw new Error('you should fall about 10 s into the mud cavern');
  const prism = I.eggs.find((e) => e.spot.mud); console.log('Prismatic hiding places down here:', I.eggSpots.filter((e) => e.mud).length, '| one here now', !!prism);
  I.p.yaw = Math.PI / 2; I.keys.add('KeyW'); I.keys.add('ShiftLeft'); let k = 0; while (I.zoneName() === 'Mud cavern' && k++ < 60 * 20) { I.p.yaw = Math.abs(I.p.z - I.MUD.z) > 0.5 && I.p.x > I.MUD.x - I.MUD.hx ? Math.atan2(-(I.MUD.x - I.MUD.hx - 2 - I.p.x), -(I.MUD.z - I.p.z)) : Math.PI / 2; fr(); } I.keys.clear();
  console.log('walk west along the tunnel: out after', (k / 60).toFixed(1), 's | zone', I.zoneName(), '| at', I.p.x.toFixed(0), I.p.z.toFixed(0), '|', said());
  if (I.zoneName() !== 'Desert') throw new Error('the tunnel should come out in the desert');
}

// ---- and once more, as a device with saved progress ----
if (process.env.SAVED !== '1') {
  const r = require('child_process').spawnSync(process.execPath, [__filename, file], { env: Object.assign({}, process.env, { SAVED: '1' }), encoding: 'utf8' });
  console.log('\n== again with saved progress ==\n' + r.stdout.split('\n').filter((l) => /saved progress|ride a saved/.test(l)).join('\n') + (r.status ? '\n' + r.stderr : ''));
  if (r.status) process.exit(r.status);
}
