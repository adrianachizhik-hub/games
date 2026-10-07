/* Dragon Keepers multiplayer server.
   One small Node program with no packages to install. It keeps 11 game servers ("rooms"), each with the island's
   7 plots. A new player joins Server 1 if it has a free plot, otherwise the next server with room, so friends land
   together unless Server 1 is full. The server only passes messages along: where everyone is, which plot is whose,
   which dragons are on each plot, chat and admin announcements. Everything else (coins, dragons, eggs) stays on each
   player's own device, like before.
   Run it with: node server/server.js   (PORT sets the port; Render sets it by itself.) */
const http = require('http'), crypto = require('crypto');
const PORT = process.env.PORT || 8080, ROOMS = 11, PLOTS = 7, SEND_EVERY = 100;   // ms between position updates

/* Admins: the same scrambled numbers as the game uses. The real name and code are never written down. */
const ADMINS = [[1869928790200511, 8246370880143628], [2807844638872252, 4072327928453000]];
function scramble(str) {
  let h1 = 0xdeadbeef ^ 77, h2 = 0x41c6ce57 ^ 77;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const isAdmin = (name, code) => { const n = String(name || '').toLowerCase(); return ADMINS.some((a) => a[0] === scramble(n) && a[1] === scramble(n + '#' + String(code || '').trim())); };

const rooms = Array.from({ length: ROOMS }, (_, i) => ({ id: i + 1, players: new Map(), plots: new Array(PLOTS).fill(null) }));
let nextId = 1, timeMode = 'auto';                    // timeMode: an admin made it 'day' or 'night' for everyone, until 'auto' again

/* ---------- A tiny WebSocket: just enough for text messages ---------- */
function sendRaw(sock, text) {
  if (sock.destroyed) return;
  const data = Buffer.from(text), n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  sock.write(Buffer.concat([head, data]));
}
function frames(state, chunk, onText, onClose) {     // read whole frames out of the bytes received so far
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const b = state.buf;
    if (b.length < 2) return;
    const op = b[0] & 15, masked = b[1] & 128;
    let len = b[1] & 127, at = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); at = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); at = 10; }
    if (len > 65536) { onClose(); return; }           // far too big for anything this game sends
    const need = at + (masked ? 4 : 0) + len;
    if (b.length < need) return;
    const mask = masked ? b.slice(at, at + 4) : null, body = b.slice(at + (masked ? 4 : 0), need);
    if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    state.buf = b.slice(need);
    if (op === 8) { onClose(); return; }
    if (op === 9) { state.sock.write(Buffer.concat([Buffer.from([0x8a, body.length]), body])); continue; }   // ping: pong
    if (op === 1) onText(body.toString('utf8'));
  }
}

/* ---------- The game's messages ---------- */
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
function broadcast(room, msg, except) { const t = JSON.stringify(msg); room.players.forEach((pl) => { if (pl !== except) sendRaw(pl.sock, t); }); }
const card = (pl) => ({ id: pl.id, name: pl.name, admin: pl.admin, look: pl.look, plot: pl.plot, pets: pl.pets, s: pl.s });
function pickRoom(want) {                             // the server the player chose, if it has a free plot; else the first one that does
  const w = rooms[(want | 0) - 1];
  if (w && w.players.size < PLOTS) return w;
  return rooms.find((r) => r.players.size < PLOTS) || null;
}

/* Gifts and trades (Adriana: gift coins or dragons; trade dragons and coins, and both have to say yes). The server only
   checks the offers look right and passes them along; each player's device takes away and adds the dragons and coins. */
const MAX_COINS = 1e15;
const cleanDragon = (d) => (d && typeof d === 'object' ? { k: clean(d.k, 12), m: clean(d.m, 400), u: Number.isInteger(d.u) ? d.u : -1, s: num(d.s), n: clean(d.n, 16), o: Number.isInteger(d.o) ? d.o : -1 } : null);
const cleanOffer = (m) => ({ coins: Math.max(0, Math.min(MAX_COINS, Math.floor(num(m.coins)))), dragons: (Array.isArray(m.dragons) ? m.dragons : []).slice(0, 30).map(cleanDragon).filter((d) => d && d.k) });
const send = (pl, msg) => sendRaw(pl.sock, JSON.stringify(msg));
function tradeState(pl) {                             // both players see both offers, and who has said yes
  const o = pl.tr.with;
  send(pl, { t: 'tradestate', mine: pl.tr.offer, theirs: o.tr.offer, myOk: pl.tr.ok, theirOk: o.tr.ok });
}
function endTrade(pl, why) {                          // the trade stops; the other player hears why
  if (!pl.tr) return;
  const o = pl.tr.with; pl.tr = null;
  if (o.tr && o.tr.with === pl) { o.tr = null; send(o, { t: 'tradeclosed', why }); }
}

function join(sock, hello) {
  const room = pickRoom(hello.room);
  if (!room) { sendRaw(sock, JSON.stringify({ t: 'full' })); sock.end(); return null; }
  const pl = { id: nextId++, sock, room, name: clean(hello.name, 16) || 'Player', admin: isAdmin(hello.name, hello.code), look: hello.look && typeof hello.look === 'object' ? hello.look : {}, plot: -1, pets: [], s: null };
  if (JSON.stringify(pl.look).length > 600) pl.look = {};
  room.players.set(pl.id, pl);
  sendRaw(sock, JSON.stringify({ t: 'welcome', id: pl.id, room: room.id, time: timeMode, rooms: ROOMS, admin: pl.admin, players: [...room.players.values()].filter((q) => q !== pl).map(card), plots: room.plots.map((o) => (o ? { id: o.id, name: o.name } : null)) }));
  broadcast(room, { t: 'join', p: card(pl) }, pl);
  return pl;
}
function leave(pl) {
  if (!pl || !pl.room.players.has(pl.id)) return;
  const room = pl.room;
  room.players.delete(pl.id);
  endTrade(pl, pl.name + ' left the server.');
  if (pl.plot >= 0 && room.plots[pl.plot] === pl) room.plots[pl.plot] = null;
  broadcast(room, { t: 'left', id: pl.id, plot: pl.plot });
}
function handle(pl, m) {
  const room = pl.room;
  if (m.t === 'state') pl.s = [num(m.x), num(m.y), num(m.z), num(m.yaw), clean(m.ride, 12), m.fly ? 1 : 0];
  else if (m.t === 'claim') {
    const i = m.plot | 0;
    if (i < 0 || i >= PLOTS) return;
    if (room.plots[i] && room.plots[i] !== pl) { sendRaw(pl.sock, JSON.stringify({ t: 'claimed', plot: i, ok: false, owner: room.plots[i].name })); return; }
    if (pl.plot >= 0 && room.plots[pl.plot] === pl) room.plots[pl.plot] = null;
    room.plots[i] = pl; pl.plot = i;
    sendRaw(pl.sock, JSON.stringify({ t: 'claimed', plot: i, ok: true }));
    broadcast(room, { t: 'plot', plot: i, id: pl.id, name: pl.name }, pl);
  } else if (m.t === 'release') {
    if (pl.plot >= 0 && room.plots[pl.plot] === pl) { room.plots[pl.plot] = null; broadcast(room, { t: 'plot', plot: pl.plot, id: 0, name: '' }, pl); }
    pl.plot = -1; pl.pets = [];
  } else if (m.t === 'pets') {
    pl.pets = (Array.isArray(m.kinds) ? m.kinds : []).slice(0, 60).map((k) => clean(k, 12));
    broadcast(room, { t: 'pets', id: pl.id, kinds: pl.pets }, pl);
  } else if (m.t === 'look') {
    if (m.look && typeof m.look === 'object' && JSON.stringify(m.look).length <= 600) { pl.look = m.look; broadcast(room, { t: 'look', id: pl.id, look: pl.look }, pl); }
  } else if (m.t === 'chat') {
    const text = clean(m.text, 120);
    if (text) broadcast(room, { t: 'chat', id: pl.id, name: pl.name, admin: pl.admin, text }, pl);
  } else if (m.t === 'announce') {
    const text = clean(m.text, 100);
    if (text && pl.admin) rooms.forEach((r) => broadcast(r, { t: 'announce', name: pl.name, text }, pl));   // admins speak to every server
  } else if (m.t === 'event') {                       // an admin starts an event (one per mutation) for everyone, on every server
    if (pl.admin && /^[a-z]{2,12}$/.test(String(m.kind))) rooms.forEach((r) => broadcast(r, { t: 'event', kind: m.kind, by: pl.name }, pl));
  } else if (m.t === 'time') {                        // an admin makes it day or night (or back to normal) for everyone
    if (pl.admin && ['day', 'night', 'auto'].includes(m.mode)) { timeMode = m.mode; rooms.forEach((r) => broadcast(r, { t: 'time', mode: m.mode, by: pl.name }, pl)); }
  } else if (m.t === 'firestorm') {                   // an admin starts a fire storm for everyone, on every server
    if (pl.admin) rooms.forEach((r) => broadcast(r, { t: 'firestorm', by: pl.name }, pl));
  } else if (m.t === 'gift') {                         // coins and/or dragons for another player; if they've gone, it all comes back
    const to = room.players.get(m.to | 0), offer = cleanOffer(m);
    if (!offer.coins && !offer.dragons.length) return;
    if (to && to !== pl) { send(to, { t: 'gifted', from: pl.name, coins: offer.coins, dragons: offer.dragons }); send(pl, { t: 'giftsent', to: to.name, coins: offer.coins, dragons: offer.dragons }); }
    else send(pl, { t: 'giftback', coins: offer.coins, dragons: offer.dragons });
  } else if (m.t === 'tradeask') {                     // ask another player to trade
    const to = room.players.get(m.to | 0);
    if (!to || to === pl) return;
    if (pl.tr || to.tr) { send(pl, { t: 'tradeno', why: (to.tr ? to.name + ' is already trading.' : 'You are already trading.') }); return; }
    pl.ask = to.id; send(to, { t: 'tradeask', id: pl.id, name: pl.name });
  } else if (m.t === 'tradeanswer') {                  // yes or no to someone who asked
    const from = room.players.get(m.id | 0);
    if (!from || from.ask !== pl.id) return;
    from.ask = 0;
    if (!m.yes) { send(from, { t: 'tradeno', why: pl.name + ' said no.' }); return; }
    if (pl.tr || from.tr) { send(pl, { t: 'tradeno', why: 'One of you is already trading.' }); send(from, { t: 'tradeno', why: 'One of you is already trading.' }); return; }
    from.tr = { with: pl, offer: { coins: 0, dragons: [] }, ok: false }; pl.tr = { with: from, offer: { coins: 0, dragons: [] }, ok: false };
    send(from, { t: 'tradeopen', id: pl.id, name: pl.name }); send(pl, { t: 'tradeopen', id: from.id, name: from.name });
  } else if (m.t === 'tradeset') {                     // change what you put in: both have to say yes again
    if (!pl.tr) return;
    const o = pl.tr.with;
    pl.tr.offer = cleanOffer(m); pl.tr.ok = false; o.tr.ok = false;
    tradeState(pl); tradeState(o);
  } else if (m.t === 'tradeaccept') {                  // you say yes; when both have, the trade happens
    if (!pl.tr) return;
    const o = pl.tr.with;
    pl.tr.ok = true;
    if (o.tr.ok) {
      send(pl, { t: 'tradedone', gave: pl.tr.offer, got: o.tr.offer, name: o.name }); send(o, { t: 'tradedone', gave: o.tr.offer, got: pl.tr.offer, name: pl.name });
      pl.tr = null; o.tr = null;
    } else { tradeState(pl); tradeState(o); }
  } else if (m.t === 'tradecancel') {
    endTrade(pl, pl.name + ' stopped the trade.');
  } else if (m.t === 'zap') {                          // a storm dragon's lightning hit another player: they get bounced back
    const target = room.players.get(m.id | 0);
    if (target && pl.admin) sendRaw(target.sock, JSON.stringify({ t: 'zapped', by: pl.name, dx: num(m.dx), dz: num(m.dz) }));
  }
}
setInterval(() => {                                    // ten times a second, everyone hears where everyone else is
  rooms.forEach((room) => {
    if (room.players.size < 2) return;
    const list = [...room.players.values()].filter((pl) => pl.s).map((pl) => [pl.id, ...pl.s]);
    broadcast(room, { t: 'states', list });
  });
}, SEND_EVERY);

/* ---------- HTTP: a status page, and the upgrade to a WebSocket ---------- */
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/status')) {      // for the game's "choose a server" list
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ plots: PLOTS, rooms: rooms.map((r) => ({ id: r.id, players: r.players.size, names: [...r.players.values()].map((pl) => pl.name) })) }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('Dragon Keepers server is running.\n' + rooms.map((r) => 'Server ' + r.id + ': ' + r.players.size + ' of ' + PLOTS + ' players').join('\n') + '\n');
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const state = { buf: Buffer.alloc(0), sock };
  let pl = null, closed = false;
  const close = () => { if (closed) return; closed = true; leave(pl); try { sock.end(); } catch (e) { /* already gone */ } };
  sock.on('data', (chunk) => frames(state, chunk, (text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (!pl) { if (m.t === 'hello') pl = join(sock, m); return; }
    handle(pl, m);
  }, close));
  sock.on('close', close); sock.on('error', close); sock.on('end', close);
});
server.listen(PORT, () => console.log('Dragon Keepers server on port ' + PORT));
module.exports = { server, rooms, PLOTS };
