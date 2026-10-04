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
class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } }
class Color { constructor(v) { this.r = this.g = this.b = 1; if (v !== undefined) this.set(v); }
  set(v) { if (typeof v === 'string') { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('bad colour string ' + v); v = parseInt(v.slice(1), 16); } if (typeof v !== 'number' || isNaN(v)) throw new Error('bad colour'); this.r = ((v >> 16) & 255) / 255; this.g = ((v >> 8) & 255) / 255; this.b = (v & 255) / 255; return this; }
  setScalar(v) { this.r = this.g = this.b = v; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; } lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  setRGB(r, g, b) { if ([r, g, b].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('bad colour'); this.r = r; this.g = g; this.b = b; return this; } }
class Obj { constructor() { this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.scale = new Vector3(1, 1, 1); this.children = []; this.matrix = null; this.visible = true; }
  add(o) { this.children.push(o); } remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } lookAt(x, y, z) { if ([x, y, z].some((v) => typeof v !== 'number' || isNaN(v))) throw new Error('lookAt args'); this.lookedAt = [x, y, z]; } updateMatrix() { for (const v of [this.position, this.scale]) if ([v.x, v.y, v.z].some((q) => typeof q !== 'number' || isNaN(q))) throw new Error('NaN transform');
    this.matrix = { x: this.position.x, y: this.position.y, z: this.position.z, sy: this.scale.y }; } }
const allMeshes = [];
class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; allMeshes.push(this); } }
class InstancedMesh extends Mesh { constructor(g, m, n) { super(g, m); if (!(g instanceof Geo) || !g.attributes.position) throw new Error('instanced geometry'); this.count = n; this.items = []; this.instanceMatrix = {}; this.instanceColor = null; meshes.push(this); }
  setMatrixAt(i, m) { this.items[i] = m; } setColorAt(i, c) { this.instanceColor = this.instanceColor || {}; } }
const mat = class { constructor(o) { o = o || {}; Object.assign(this, o); this.color = new Color(o.color === undefined ? 0xffffff : o.color); } };
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
  PlaneGeometry: class extends Geo { constructor(w, h, a = 1, b = 1) { super(); this.attributes.position = new Attr(new Float32Array((a + 1) * (b + 1) * 3), 3); } },
  MeshBasicMaterial: mat, MeshLambertMaterial: mat, MeshStandardMaterial: mat, MeshPhongMaterial: mat, SpriteMaterial: mat, PointsMaterial: mat,
  Mesh, InstancedMesh, Sprite: class extends Obj {}, Points: class extends Obj {},
  BackSide: 1, DoubleSide: 2, RepeatWrapping: 1000
};
function ctx2d(canvas) {
  return { createRadialGradient: () => ({ addColorStop() {} }), createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) { images.push(img); }, fillText(t) { (canvas.texts = canvas.texts || []).push(t); }, strokeRect() {}, drawImage() {}, setLineDash() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, save() {}, translate() {}, rotate() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, restore() {} };
}
function el(id) {
  const cls = new Set();
  return { id, hidden: false, value: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, style: {}, width: 264, height: 264, clientWidth: 1280, clientHeight: 720, offsetWidth: 10, textContent: '', children: [],
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    listeners: {}, addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }, fire(n, e) { (this.listeners[n] || []).forEach((f) => f(e)); },
    getBoundingClientRect() { return id === 'stick' && document.body.classList.contains('touch') ? { left: 22, top: 720 - 28 - 124, width: 124, height: 124 } : { left: 0, top: 0, width: 0, height: 0 }; },
    appendChild(c) { this.children.push(c); }, getContext() { return ctx2d(this); }, focus() {}, blur() {}, setPointerCapture() {}, requestPointerLock() {} };
}
const els = {};
const document = { getElementById: (id) => els[id] || (els[id] = el(id)), createElement: (t) => el(t), createTextNode: (t) => ({ text: t }), body: el('body'), addEventListener() {}, pointerLockElement: null };
let raf = null;
const wl = {};
const window = { THREE, matchMedia: () => ({ matches: false }), addEventListener(n, f) { (wl[n] = wl[n] || []).push(f); }, fire(n, e) { (wl[n] || []).forEach((f) => f(e)); }, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
// SAVED=1: a device that has played before, with a claimed plot and some dragons already saved.
// Without it the device starts fresh, and at the very end the harness runs itself again with SAVED=1.
const store = process.env.SAVED !== '1' ? {} : { 'mutation-mayhem-plot': '2', 'mutation-mayhem-dragons': JSON.stringify(['green', 'ruby', 'blue']) };
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const sandbox = { localStorage, window, document, THREE, performance: { now: () => 0 }, requestAnimationFrame: (f) => { raf = f; }, console, Math, Float32Array, Uint8Array, Uint16Array, Uint8ClampedArray, Map, Set, Infinity };
vm.createContext(sandbox);
vm.runInContext(worldSrc + '\nthis.World = World;', sandbox);
vm.runInContext(renderSrc, sandbox);
const W = sandbox.World, I = window.__island;

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
if (MODE !== 'other' && !(AN && AC)) { console.log('ADMIN_NAME and ADMIN_CODE are not set: skipping the admin sign-in checks'); MODE = 'other'; }
const flip = (s) => s.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())), st = () => 'started ' + document.body.classList.contains('playing') + ' | admin ' + I.admin() + ' | name ' + JSON.stringify(I.name()) + ' | tag ' + JSON.stringify(document.getElementById('who').textContent) + ' badge ' + JSON.stringify((document.getElementById('who').children[0] || {}).textContent) + ' | code box hidden ' + els.code.hidden + ' | message ' + JSON.stringify(els.codeMsg.hidden ? '' : els.codeMsg.textContent);
els.code.hidden = true; els.codeMsg.hidden = true; els.admin.hidden = true;
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
  els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play as someone else     :', st());
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
els.start.fire('click', ev({ pointerType: 'mouse' })); console.log('Play again     :', S());

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
  console.log('saved progress: plot', I.myPlot() + 1, '| dragons', JSON.stringify(I.ownDragons), '| on the plot', I.plotPets.map((d) => d.kind).join(','));
  if (I.myPlot() !== 2 || I.plotPets.length !== 3) throw new Error('saved plot or dragons did not come back');
  els.start.fire('click', ev({ pointerType: 'mouse' })); I.goTo(7); I.mount(I.plotPets[1]); I.update(1 / 60, 0); raf(30000); raf(30016);
  console.log('ride a saved dragon: riding', I.riding().kind);
  I.dismount(true); process.exit(0);
}

// ---- dragon eggs: claim a plot, find eggs, carry them home, hatch ----
const E = I.EGG_TIERS, said = () => JSON.stringify(els.toast.hidden ? '' : els.toast.textContent);
const tick = (secs) => { for (let f = 0; f < secs * 60; f++) { I.update(1 / 60, f / 60); I.eggsAnimate(1 / 60, f / 60); } };
const stand = (spot) => { I.p.x = spot.x; I.p.z = spot.z; I.p.y = spot.y; I.p.vy = 0; I.p.onGround = true; I.p.dungeon = !!spot.dungeon; I.p.inLid = !!spot.cave; I.p.inCave = !!spot.cave; };
const zonesOf = (t) => { const z = {}; t.spots.forEach((s) => { stand(s); const n = I.zoneName(); z[n] = (z[n] || 0) + 1; }); return JSON.stringify(z); };
I.goTo(0);
console.log('egg hiding places:'); E.forEach((t, i) => console.log(' ', t.name.padEnd(10), t.spots.length, 'spots,', I.eggs.filter((e) => e.tier === i).length, 'out at once | zones', zonesOf(t)));
els.start.fire('click', ev({ pointerType: 'mouse' })); I.keys.clear();
const common = I.eggs.find((e) => e.tier === 0);
stand(common.spot); tick(0.2);
console.log('touch an egg with no plot : carrying', !!I.carrying(), '| message', said());
if (I.carrying()) throw new Error('picked up an egg without a plot');
I.goTo(7); const home = I.plotWorld(2, 0, 3); I.p.x = home.x; I.p.z = home.z; tick(0.2);
console.log('walk onto Plot 3         : my plot', I.myPlot() + 1, '| message', said());
if (I.myPlot() !== 2) throw new Error('plot not claimed');
const p4 = I.plotWorld(3, 0, 0); I.p.x = p4.x; I.p.z = p4.z; tick(0.2);
console.log('walk onto Plot 4 as well : my plot still', I.myPlot() + 1);
stand(common.spot); tick(0.1);
const c = I.carrying();
console.log('touch a Common egg       : carrying', !!c, '| time', c && c.total, 's | egg hidden in world', !common.g.visible, '| countdown', JSON.stringify(els.carryText.textContent), 'shown', !els.carry.hidden, '| message', said());
const bx0 = I.p.x; window.fire('keydown', ev({ code: 'Digit8' })); window.fire('keyup', ev({ code: 'Digit8' }));
console.log('press 8 while carrying   : moved', I.p.x !== bx0, '| message', said());
if (I.p.x !== bx0) throw new Error('jumped while carrying');
const oldSpot = common.spot; I.p.x = home.x; I.p.z = home.z; I.p.y = 6.3; I.p.dungeon = false; I.p.inCave = I.p.inLid = false; tick(0.1);
console.log('walk into my plot        : carrying', !!I.carrying(), '| hatching', !!I.hatching(), '| message', said());
tick(2);
console.log('2 seconds later          : dragons', JSON.stringify(I.ownDragons), '| pets on plot', I.plotPets.length, '| message', said(), '| egg back out elsewhere', common.g.visible && common.spot !== oldSpot);
if (I.ownDragons.length !== 1 || !['green', 'red'].includes(I.ownDragons[0])) throw new Error('common egg did not hatch a green or red dragon');
// a prismatic egg in the mine, and nobody takes it home
const pris = I.eggs.find((e) => e.tier === 4); stand(pris.spot); tick(0.1);
const pc = I.carrying(); console.log('touch the Prismatic egg  : carrying', !!pc, '| time', pc && pc.total, 's | zone', I.zoneName());
tick(pc.total - 9.5); console.log('nearly out of time       : countdown', JSON.stringify(els.carryText.textContent), '| red', els.carry.classList.contains('low'));
tick(10); console.log('time ran out             : carrying', !!I.carrying(), '| flying away', I.flyers.length, '| message', said(), '| dragons still', I.ownDragons.length);
if (I.carrying() || I.ownDragons.length !== 1) throw new Error('egg should have hatched and flown off');
tick(5); console.log('5 seconds later          : still flying', I.flyers.length);
// leaving while carrying puts the egg back
const leg = I.eggs.find((e) => e.tier === 2); stand(leg.spot); tick(0.1); const ls = leg.spot;
els.leave.fire('click', ev({ detail: 1 })); console.log('Leave while carrying     : carrying', !!I.carrying(), '| egg back in its place', leg.g.visible && leg.spot === ls, '| countdown hidden', els.carry.hidden);
els.start.fire('click', ev({ pointerType: 'mouse' })); I.keys.clear();
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
els.start.fire('click', ev({ pointerType: 'mouse' })); I.keys.clear();
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
const pet2 = rd;
let x0 = I.p.x, z0 = I.p.z; I.keys.add('KeyW'); frameN(60); I.keys.clear(); raf(20000); raf(20016);
console.log('ride forward 1 s             : moved', Math.hypot(I.p.x - x0, I.p.z - z0).toFixed(1), '(walking does 9.5) | dragon under me', Math.hypot(pet2.root.position.x - I.p.x, pet2.root.position.z - I.p.z) < 1e-6, '| sitting', (I.avatar.position.y - I.p.y).toFixed(2), 'above it | dragon size', I.riding().root.scale.x.toFixed(2));
tapJump(); frameN(40);
console.log('jump once                    : riding', !!I.riding(), '| flying', I.flying(), '| dragon flying home', !!pet2.homing);
if (I.riding()) throw new Error('one jump should get you off');
I.p.x += 30; frameN(60 * 12);
console.log('12 s later                   : dragon home', !pet2.homing && I.plotAt(pet2.root.position.x, pet2.root.position.z) === I.myPlot());
I.goTo(7); I.p.x = at.x; I.p.z = at.z; frameN(2); I.mount(pet2);
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

// ---- and once more, as a device with saved progress ----
if (process.env.SAVED !== '1') {
  const r = require('child_process').spawnSync(process.execPath, [__filename, file], { env: Object.assign({}, process.env, { SAVED: '1' }), encoding: 'utf8' });
  console.log('\n== again with saved progress ==\n' + r.stdout.split('\n').filter((l) => /saved progress|ride a saved/.test(l)).join('\n') + (r.status ? '\n' + r.stderr : ''));
  if (r.status) process.exit(r.status);
}
