// Tests the multiplayer server: run with  node tools/servertest.js
// Starts the server on a spare port, connects pretend players, and checks servers fill up in order, plots are
// shared fairly, positions, dragons, chat and announcements get through, and admins are checked properly.
process.env.PORT = 18080;
const { server } = require('../server/server.js');
const URL = 'ws://localhost:18080', wait = (ms) => new Promise((r) => setTimeout(r, ms));
function player(name, code) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL), got = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); got.push(m); if (m.t === 'welcome' || m.t === 'full') resolve({ ws, got, name, welcome: m, send: (x) => ws.send(JSON.stringify(x)) }); };
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, code, look: { shirt: '#ff0000' } }));
  });
}
(async () => {
  let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
  const ps = [];
  for (let i = 0; i < 8; i++) ps.push(await player('Kid' + (i + 1)));
  console.log('servers joined:', ps.map((q) => q.welcome.room).join(' '));
  check(ps.slice(0, 7).every((q) => q.welcome.room === 1), 'the first 7 players all join Server 1');
  check(ps[7].welcome.room === 2, 'the 8th player, with every plot on Server 1 taken, goes to Server 2');
  check(ps[1].welcome.players.length === 1 && ps[1].welcome.players[0].name === 'Kid1', 'the 2nd player sees the 1st one already there');
  const [a, b] = ps;
  a.send({ t: 'claim', plot: 2 }); await wait(80);
  b.send({ t: 'claim', plot: 2 }); await wait(80);
  check(a.got.some((m) => m.t === 'claimed' && m.ok && m.plot === 2), 'Kid1 claims Plot 3');
  check(b.got.some((m) => m.t === 'claimed' && !m.ok && m.owner === 'Kid1'), 'Kid2 can\'t take Kid1\'s plot (told it is Kid1\'s)');
  check(b.got.some((m) => m.t === 'plot' && m.plot === 2 && m.name === 'Kid1'), 'everyone hears Plot 3 is Kid1\'s');
  a.send({ t: 'state', x: 10, y: 6.3, z: -20, yaw: 1, ride: 'jade', fly: false }); await wait(250);
  const st = b.got.filter((m) => m.t === 'states').pop(), mine = st && st.list.find((r) => r[0] === a.welcome.id);
  check(mine && mine[1] === 10 && mine[3] === -20 && mine[5] === 'jade', 'Kid2 sees where Kid1 is, riding a jade dragon');
  a.send({ t: 'pets', kinds: ['red', 'gold'] }); await wait(80);
  check(b.got.some((m) => m.t === 'pets' && m.kinds.join() === 'red,gold'), 'Kid2 sees the dragons on Kid1\'s plot');
  a.send({ t: 'chat', text: 'hi everyone!' }); await wait(80);
  check(ps.slice(1, 7).every((q) => q.got.some((m) => m.t === 'chat' && m.text === 'hi everyone!' && m.name === 'Kid1')), 'chat reaches everyone on Server 1');
  check(!ps[7].got.some((m) => m.t === 'chat'), 'but not players on Server 2');
  a.send({ t: 'announce', text: 'I am not an admin' }); await wait(80);
  check(!b.got.some((m) => m.t === 'announce'), 'a non-admin can\'t announce');
  const adminName = process.env.ADMIN_NAME, adminCode = process.env.ADMIN_CODE;
  if (adminName) {
    ps[7].ws.close(); await wait(80);
    const ad = await player(adminName, adminCode);
    check(ad.welcome.admin === true, 'an admin with the right code is an admin on the server');
    ad.send({ t: 'announce', text: 'Hello all servers' }); await wait(80);
    ad.send({ t: 'time', mode: 'night' }); await wait(80);
    check(b.got.some((m) => m.t === 'time' && m.mode === 'night'), 'an admin can make it night for everyone');
    const late2 = await player('LateNight'); check(late2.welcome.time === 'night', 'someone joining later gets the same night'); late2.ws.close();
    ad.send({ t: 'firestorm' }); await wait(80);
    check(b.got.some((m) => m.t === 'firestorm'), 'an admin can start a fire storm for everyone');
    check(b.got.some((m) => m.t === 'announce' && m.text === 'Hello all servers'), 'an admin announcement reaches everyone');
    const fake = await player(adminName, '0000'); check(fake.welcome.admin === false, 'the admin name with a wrong code is not an admin');
    fake.ws.close(); ad.ws.close();
  } else console.log('(skipped the admin checks: set ADMIN_NAME and ADMIN_CODE to run them)');
  a.ws.close(); await wait(120);
  check(b.got.some((m) => m.t === 'left' && m.id === a.welcome.id && m.plot === 2), 'when Kid1 leaves, everyone hears, and Plot 3 is free again');
  b.send({ t: 'claim', plot: 2 }); await wait(80);
  check(b.got.some((m) => m.t === 'claimed' && m.ok && m.plot === 2), 'then Kid2 can claim Plot 3');
  const late = await player('Late'); check(late.welcome.room === 1, 'a new player gets Kid1\'s old place on Server 1');
  const status = await (await fetch('http://localhost:18080/status')).json();
  check(status.rooms.length === 11 && status.rooms[0].players === 7 && status.rooms[0].names.includes('Late'), 'the status list shows all 11 servers, who is on them and how full they are');
  const pick = await new Promise((resolve) => { const ws = new WebSocket(URL); ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'Picky', room: 5 })); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') resolve({ ws, m }); }; });
  check(pick.m.room === 5, 'a player who chooses Server 5 joins Server 5');
  const pick2 = await new Promise((resolve) => { const ws = new WebSocket(URL); ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'Wants1', room: 1 })); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') resolve({ ws, m }); }; });
  check(pick2.m.room !== 1, 'choosing a full server puts you on one with room (Server ' + pick2.m.room + ')');
  pick.ws.close(); pick2.ws.close();
  ps.forEach((q) => q.ws.close()); late.ws.close();
  await wait(100); server.close();
  console.log(fail ? fail + ' FAILED' : 'all server checks passed');
  process.exit(fail ? 1 : 0);
})();
