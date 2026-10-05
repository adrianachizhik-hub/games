# Mutation Mayhem: handoff

Written on 4 October 2026 by Claude (claude.ai chat) for Claude Code. Read this whole file before touching the code. Everything Adriana asked for, everything that was built, and everything that is still open is in here.

## 1. What this is

**Mutation Mayhem** is a 3D pet-collecting game that runs in a web browser. Adriana is the designer. She describes what she wants in a sentence or two, and Claude writes all the code. She does not read or edit the code herself.

The game takes place on an island called **Isla Verde**. So far the island, the town, a dungeon, a front cover, sign-in, and an avatar shop exist. The pets, coins, and mutations that give the game its name are not built yet.

The whole game is one file, `index.html` (about 2,350 lines, 128 kB). It was published as a Claude artifact here, still under the title "Isla Verde":

https://claude.ai/artifact/SYaKvfWc5givF5kCxnYDHX

The `index.html` in this folder is identical to what is published there.

### Files in this folder

| File | What it is |
|---|---|
| `index.html` | The entire game |
| `HANDOFF.md` | This file |
| `tools/harness.js` | Headless test that plays through the game with simulated input (section 9) |
| `tools/extract.js` | Small helper the harness uses to pull the scripts out of `index.html` |

## 2. Adriana's vision for the game

These are her words from the conversation, lightly tidied. Treat them as the spec.

- Everyone starts with **1 of 3 common pets**. She chose **dog, cat, and parrot**.
- Everyone has a **plot** with a little area to keep their pets. She is not sure yet what that area will look like.
- There is a **shop where you can buy better pets**.
- If you explore the world you can find **mutations or mutation blocks**. Blocks have a **rarity** and give a mutation in that rarity. Mutations have rarities too.
- The world has trees, caves, waterfalls, jungles, oceans, beaches, and other environments.
- Start as a **one-player game**, and **eventually make it multiplayer**.
- She wants it in the **App Store** one day. She does not want it on Roblox.
- **Admins** exist. Their commands will be things "like restocking shops or giving more coins". She said: "We will figure out what admins can do later."

### Dragons and eggs (decided 4 October 2026, in Claude Code)

Players hatch dragons from eggs. Each egg tier hatches one of two colours. Every dragon is the same blocky model in different colours (`concepts/dragon-colors.html`, `concepts/dragon-eggs.html`).

| Tier | Egg | Hatches |
|---|---|---|
| Common | brown, spotted | green or red |
| Rare | purple | blue or purple |
| Legendary | yellow | bronze or silver (shiny metal) |
| Mythic (name not confirmed) | shiny gold, twinkles | gold or ruby |
| Prismatic (name not confirmed) | swirly rainbow, twinkles | diamond or jade |

Ruby, diamond and jade are "gem" dragons: brighter, with sparkles on their scales and twinkle stars around them. Prismatic hatches diamond 60%, jade 40% ("jade is last in order, so a little rarer"); every other egg is 50/50.

**Built (section "Dragon eggs" in `index.html`):**
- The first plot you walk onto in town becomes yours (yellow square on the minimap), and its sign is repainted as "<name>'s Plot" (`paintSign`, `nameMyPlot`; long names shrink and split onto two lines). Only one plot per player for now.
- Eggs are hidden around the island, rarer ones in harder places: Common on beaches and meadows (6 out at once), Rare deep in the jungle and desert (4), Legendary high in the mountains near the peak (3), Mythic inside the crystal cave (2), Prismatic down in the mine (1). Spots are picked once from their own random stream (`W.rng(4142)`), so plants did not move. A collected egg turns up again somewhere else, away from you.
- Walk into an egg to carry it (held over your head, countdown at the bottom). Time = the tier's `base` seconds (30, 24, 20, 17, 15) plus 1 second per 7 units from the egg to your plot. Adriana's "rarer dragons are faster" was read as "rarer eggs hatch sooner"; she has not confirmed this.
- Bring it into your plot: it wobbles and hatches, and the dragon lives on your plot and wanders about (rarer ones walk faster). Run out of time: it hatches where you are and the baby flies away.
- No jumping to places (1 to 8 or the buttons) while carrying, and the avatar shop button hides (the shop would pause the clock). Leave puts a carried egg back.
- The harness checks all of this, and runs from every hiding place to the plot to show each can be reached and brought home in time.

**Riding (section "Riding your dragons"):** click or tap one of your dragons (within 10 units) to climb on; it grows to riding size (`RIDE_SIZE`). It walks where you steer, much faster than running (18 + 2 per tier on the ground, 30 + 5 per tier flying, Shift adds half again), rarer ones faster. Jump twice quickly (within 0.35 s) to take off; while flying, hold Jump to climb and let go to glide down. One jump on the ground gets you off, and the dragon flies home to your plot. Riding stops at the cave (too big). Jumping to a place or Leave sends it straight home. Jump taps are remembered between frames (`jumpTapped`) so quick double-taps work on slow devices. Only your 24 newest dragons roam the plot; all are saved.

Still open: the names of the top two tiers (Mythic and Prismatic are placeholders), whether dragons should follow you, and the starter dog, cat and parrot.

### The build order we agreed on

1. Starter pet: pick one of the three, and it follows you around.
2. Your plot: claim one of the seven plots, and your pets live there.
3. Shops: the four stalls open, with coins to buy better pets.
4. Mutation blocks: hidden around the island, with rarities.
5. Saving, added early, so pets and plots are still there on return.

She paused step 1 to do the front cover and sign-in first, then started on the shops with the avatar shop. Nothing in steps 1, 2, 4 or 5 exists yet. In step 3, only the blue stall (avatar shop) is done.

## 3. Decisions already made (do not reopen without asking her)

- **Stay in the browser.** We started a Godot 4 project, then dropped it. She said "lets stay on claude". Nothing from Godot carries over. Unity was never an option (it does not run on her Chromebook).
- **Her computer is a Chromebook.** The game must also work on iPads and phones. Keep touch controls working and keep the game light.
- **Arrow keys turn, they do not strafe.** Left and right turn you, up and down walk. She asked for this instead of turning with the mouse.
- **The mouse does not grab the pointer.** Hold the button and drag to look. That is the only way to look up and down with a mouse.
- **Touch controls:** a fixed circle in the bottom left to walk, a Jump button in the bottom right. They appear on first touch.
- **The dungeon ladder cannot be seen from the cave above.**
- **The Leave button is in the bottom right corner.** On touch screens Jump sits just above it.
- **Shops are "to be finished later"** except the blue one.

## 4. How to talk to Adriana

- Keep replies short and in plain words. Say what changed and what she will see. She does not need code explanations.
- She is new to coding tools. When she has to do something herself, give exact step-by-step instructions (in Godot she needed help finding where "Attach Script" was).
- Her requests are brief and sometimes ambiguous ("the mine", "the part where its like Mutation Mayhem"). Pick the most likely meaning, build it, and say in one line what you assumed so she can correct it.
- When you make a choice she did not ask for (moving a button, adding hair colors), tell her.
- Be honest about what you tested and what you could not see. She has been told throughout that the 3D picture was never seen by Claude (section 10).
- She expected each change at the same link. In Claude Code, agree with her early on how she will open and play the game after each change.

## 5. How the code is organised

`index.html` has the styles, the markup, then two scripts.

**Script 1: `World`** (starts near line 607). Pure maths, no three.js. It builds the island as height grids and exports functions that both the renderer and the player physics use. It can be run on its own in Node.

**Script 2: the game** (starts near line 810). One big function holding rendering, the player, input, the shops, and the HUD. It loads three.js **r128** from cdnjs. Section comments look like `/* ---------- Name ---------- */`. In order:

Light and sky, Terrain colours, Plants rocks and other scenery, Geometry helpers, The town circle, Terrain mesh, Water, Waterfall, Clouds, The dungeon, The player's avatar, The avatar shop's keeper, Player, Places you can jump to, Getting into and out of the dungeon, Input, The avatar shop, (admin and start/leave code), Per-frame update, HUD, Main loop.

### Things that will bite you

- **Everything in script 2 shares one scope.** Check a name is free before declaring a `const` (a second `GOLD` broke the page once).
- **One shared random stream, `R()`.** Adding or reordering a `scatter(...)` call moves every plant placed after it. That is harmless but expected.
- **`merge(parts)`** joins shapes into one mesh. Each part is `{ g: geometry, color, m: matrix, jitter }`. `xf(x, y, z, sx, sy, sz, rx, ry, rz)` makes the matrix. Merged meshes use `plantMat` (lit, vertex colours).
- **`instanced(geometry, material, list)`** draws many copies. An instance colour multiplies the vertex colours.
- **Directions:** x is east, z is south, y is up. At `yaw = 0` the player faces **-z**. Forward is `(-sin yaw, -cos yaw)`. The avatar model also faces -z.
- **"Frames"** in the town code: `frame(cx, cz, phi)` puts local +z pointing away from the town centre. `spot(...)` converts a local point to world x, z.
- **Colliders are circles.** `addCollider(x, z, r)` outdoors. The dungeon has its own list, `dgBlocks` (x, z, radius triples).
- **CSS:** `body.playing`, `body.touch`, and `body.shopping` switch the HUD. The shopping rule uses `!important` because the touch rules are more specific.
- **Hosting limits if it stays a Claude artifact:** one self-contained HTML file under 16 MB; scripts only from cdnjs (and a few other CDNs); fonts only from Google Fonts; no other network requests; `localStorage` works but is per device. If the game moves to normal hosting these limits go away, but ask Adriana before splitting the file up.

## 6. The island (script 1)

- Height grid: 480 by 480 units, cells of 2 units, 241 by 241 points. `HT` is the outdoor surface, `H` is the walking surface with the cave carved in, `CE` is the cave ceiling, `lid` marks cells with a cave roof. `bil(grid, x, z)` samples a grid.
- The island is roughly a circle of radius 150 around (0, 0), with a bulge of extra land under the mountains.
- **One axis lines up the main features.** `U = (0.64, 0.7684)` points downstream. `axisPoint(t, lat)` and `axisCoords(x, z)` convert to and from "distance along the axis, distance to the side".
  - Main peak `C` = (-67.8, -81.5), about 40 high, with snow.
  - Waterfall basin `B` = (-35.8, -43.0), 50 units along U from the peak.
  - The river runs from the basin to the sea. `riverLat(tr)` gives its sideways position. It wiggles and bends south (`RIVER_BEND = 0.0016`) so that it splits the south of the island in half.
- **Biomes:** `southF` marks the south. `jungleF` is the south on the west bank of the river, `desertF` the south on the east bank. They are equal in area on purpose (she asked for the jungle to be halved and the other half made desert). The desert has dunes in the height map.
- **Mountains:** `PEAKS` holds five peaks along the north-west coast, blended by `mountainAt`. She asked for the peak to move from the middle to the edge and become a range.
- **Cave:** runs along the axis through the main peak, from behind the waterfall (`tA` about 23.5) to a back exit on the shore (`tB` about 92.4). The big crystal chamber is at `CH_T = 64`. `caveWidth(t)` was widened once at her request, but the mouth behind the falls was kept narrow so it stays hidden.
- `POOL` = (-80.4, -89.2) is the little pond in the chamber. It is the trapdoor to the dungeon.
- `HUB` = `{ x: 26, z: -26, r: 33, h: 6.3 }` is the flat sand circle for the town. The river runs through the exact middle of the island, so the circle sits just east of it, as close to the middle as it fits. She was told this.

## 7. Everything that is built

### Scenery
- **Plants** (instanced, counts in the `scatter` calls): palms on the beaches; in the jungle, trees, giant trees, banana plants, bamboo, ferns, bushes, and flowers in five colours; in the desert, tall cacti, round cacti, dry bushes, red rocks, and stone pillars; pines on the mountains; trees and flowers in the meadow; grey rocks; crystals in the cave. Nothing grows on the town circle (`probe()` blocks it).
- **Clouds** are plain white (unlit material). She asked for white clouds.
- Water with waves, a waterfall with a feeding stream and mist, a lagoon, a river.

### Dungeon ("the mine")
- Stone room under the cave pond. Constants in `DG`: floor y = -12, ceiling -5.6, 20 wide, about 18.7 long, four pillars.
- **Getting in:** walk within 1.9 of the pond's middle while in the cave and you fall through a shaft. The pond looks solid from above.
- **Getting out:** a ladder on the far wall, in its own narrow shaft. Walk into it to climb. At the top the screen fades and you appear beside the pond. A hint ("Walk into the ladder to climb back up") shows near it. The ladder was moved away from the landing spot because players holding forward climbed straight back out.
- Lighting is baked into the stone colours from six torches (no real lights). Walls were darkened about 30% at her request. Torch flames flicker.
- **Gold nugget piles** in three of the four corners.
- **Rusty mine carts:** a track across the room with boarded-up tunnel mouths at both ends, one empty cart and one loaded with gold on the track, and one cart tipped over in the fourth corner with spilled nuggets.

### Town
- Flat sand circle, radius 33.
- **Seven plots** in a ring (radius 23.5, each 11 by 11): grass square, low wooden edge, corner posts, an opening facing the middle, and a sign "Plot 1" to "Plot 7". They are empty and cannot be claimed yet.
- **Four shop stalls** in the middle (radius 9), facing outward. Roof colours by index: 0 red (east), 1 **blue** (south), 2 green (west), 3 yellow (north). Each has a counter and a sign. The blue one says "Avatars"; the others say "Shop" and do nothing.
- Sign text comes from one small canvas texture holding nine labels.

### Front cover
- Title "MUTATION MAYHEM" in chunky letters (Luckiest Guy font from Google Fonts, with fallbacks). Each letter has its own colour and tilt, and the O is an eye that blinks.
- Behind it the camera circles the island from the air.
- Tagline: "Collect pets and hunt for mutations on Isla Verde".
- A yellow **Play** button, then a box "Enter your name" (up to 16 characters, Enter also starts), then a controls reminder.
- An empty name becomes "Player". The name is remembered on the device.

### Admin sign-in
- One special name makes an "Admin code" box appear. The right code starts the game as an admin. A wrong code shows a message and does not start.
- **The name and code are not written in this folder on purpose. Adriana knows them. Ask her if you need them for testing, and never commit them.**
- In the code they exist only as two scrambled numbers (`ADMIN_NAME`, `ADMIN_KEY`) made by `scramble()`. The check is `scramble(name.toLowerCase())` and `scramble(name.toLowerCase() + '#' + code)`. To change them, compute new numbers with the same function.
- This hides them from a quick look. It is **not real security**, and she was told so. Before admins get real powers in a shared game, the check must move to a server.
- An admin's name tag shows the part before the `@` plus a yellow "Admin" badge. Only that plain name is remembered, so the admin types the full name and code every time. Leaving signs the admin out.
- Small quirk: the tag keeps the capital letters as typed.

### Admin panel
- Admins get a yellow arrow tab on the right edge under the minimap. It slides a panel in ("Admin commands").
- New commands go inside `#adminCommands` as buttons; the "No commands yet" note hides itself when that element has children.
- **Egg radar** (asked for on 4 October 2026, the first command): a button that turns on and off. While on, the minimap draws a dashed line to the nearest egg with a pulsing ring on it, and a yellow label under the minimap says which kind it is, how far, and "in the cave" or "in the mine". It switches on by itself when an admin signs in, and off on Leave. To test admin features without the real name and code, run the harness on a copy of `index.html` where `start()` sets `isAdmin = true`; never commit that copy.

### Playing
- **Camera:** behind the avatar outdoors (`CAM_BACK = 5.2`). In the cave and dungeon it slides into the avatar's head (first person), because there is no room behind you. It is kept above the ground and the sea.
- **Keys:** up/down or W/S walk, left/right or A/D turn, Q/E sidestep, Space jumps, Shift runs, 1 to 8 jump to places, Enter opens the avatar shop when its button shows, Escape closes it.
- **Places:** Beach, Jungle, Desert, Waterfall, Cave, Peak, Meadow, Town. The game starts on the Beach.
- **HUD:** name tag, zone name, place buttons, hint line, round minimap, key reminder, Leave button.
- **Leave** returns to the front cover at once. The next Play starts fresh on the beach. There is no "are you sure?" yet (see section 8).

### Avatar and avatar shop
- The avatar is a blocky figure built by `figure(paints)`. Limbs hang from joints and swing when walking.
- What the player wears is in `AV`: `skin`, `hair`, `hairColor`, `shirt`, `pants`, `head`, `back`. The allowed values are in `CHOICES`. `dress(save)` applies it. It is remembered on the device.
- Choices: 6 skin colours, 11 hairstyles (short, buzz cut, spiky, swoop, curly, bob, long, **ponytail**, pigtails, bun, no hair), 8 hair colours, 10 shirt colours, 8 pants colours, head accessories (cap, crown, top hat, cat ears), back accessories (sword, skateboard, backpack, wings).
- Hairstyles are blocks listed in `HAIR_SHAPES`. Pieces under `up` stick up and are hidden under a cap, crown, or top hat.
- **Using the shop:** stand in front of the blue stall and a button "Open the avatar shop" appears. While it is open the camera faces the avatar, the game HUD is hidden, and movement is paused. Picking a back accessory turns the avatar around; picking hair turns it part way. There is a "Turn around" button and a "Done" button that stays in view.
- "Everything is free for now" is written in the panel, because coins do not exist.
- **Shopkeeper:** a stylish girl behind the blue stall's counter (pink jacket, white top, purple skirt, gold belt, white boots, sunglasses, gold jewellery, teal beret and handbag, long high ponytail with pink tips). She sways and waves when the player is near. She has no name yet.

### Saved on the device (`localStorage`)
- `mutation-mayhem-name`: the player's display name.
- `mutation-mayhem-name-locked`: `'1'` once the player answered "I'm sure" to "Are you sure <name> is your name? You can't change it later." (asked the first time a name is used, Back or I'm sure). After that the name box is filled in and any other name is refused with "Your name is X. Names can't be changed." (capitals don't matter). An empty name plays as "Player" and locks nothing. The admin name skips the question, is never locked, and never replaces a locked name. Clearing the site's data in the browser is the only way to unlock, which Adriana has not been told how to do.
- `mutation-mayhem-avatar`: the `AV` object as JSON.
- `mutation-mayhem-plot`: the index (0 to 6) of the plot you claimed.
- `mutation-mayhem-dragons`: the dragons you have hatched, as a JSON list of colour names.

## 8. What is not built, and open questions

**Not built**
- The starter pets (dog, cat, parrot) and pets following you. Dragons from eggs do live on your plot (see "Dragons and eggs").
- The red, green, and yellow shops. Their purposes are undecided, though one is presumably the pet shop.
- Coins, prices, buying.
- Mutation blocks, mutations, rarities.
- Admin commands other than the egg radar.
- Saving coins and other progress (the name, avatar, plot and dragons are saved).
- Multiplayer. This needs a server, in every version of the plan.
- App Store packaging.

**Promised to her for later**
- Once pets and coins exist, make sure progress is saved before Leave, or add a confirmation.
- Add prices to the avatar shop when coins exist.
- The artifact link is still titled "Isla Verde". She was offered a rename to "Mutation Mayhem" and has not answered.

**Paused on 5 October 2026: names unique across the whole world**
- Adriana wants each exact name to belong to one player only ("Taj" taken means nobody else can be "Taj", but "Taj 65" is fine), so nobody ends up in someone else's account. Capitals should count as the same name.
- This needs a server with one shared list of names (the first piece of multiplayer). Each device would get a secret key so only the name's owner can use it.
- Options she was shown (prices from third-party sites, to be checked on Render's own pricing page): A) Render Starter web service (about $7 a month) plus a small persistent disk for the names list (recommended; exact disk price still to check); B) free web service (sleeps after 15 minutes, about a minute to wake) plus a paid database (about $6 to $7 a month); C) Starter plus paid database (about $13 to $14 a month). Render's free database is deleted after 30 days.
- She was told to check with a grown-up because it costs money every month. She chose to come back to it later. Nothing has been built for it.

**Questions only she can answer**
- What are the other three shops?
- What does the pet area on a plot look like?
- What can admins do, beyond restocking shops and giving coins?
- Which mutations exist, and what are the rarities?
- Does the shopkeeper have a name?

**App Store facts she has been told**
- Wrapping a browser game as an iPhone app is possible as far as Claude knows, but this was not researched in depth.
- It needs a Mac for the final build, and the Apple Developer Program: 99 USD a year, and the account holder must be 18 or older (checked on Apple's site in October 2026).

## 9. Testing

`tools/harness.js` runs the page's real scripts in Node against a fake page and a fake three.js. The fake three.js has real matrix maths and real box, cylinder, and cone shapes, so positions are trustworthy.

```
node tools/harness.js index.html
ADMIN_NAME=... ADMIN_CODE=... MODE=admin node tools/harness.js index.html
```

It walks through every place, falls into the dungeon, wanders it, climbs out, tests every key, the touch controls, sign-in, the admin panel, Leave, the camera, and the avatar shop. It throws on the first error. It also writes `new-map.json`, `town.json`, and `avatar.json`, which are shape dumps that can be drawn as pictures. Do not commit those three files.

The harness plays on a fresh device, then runs itself again with `SAVED=1` as a device that already has a plot and dragons saved: code that runs while the page loads must not touch anything declared further down (a `riding` check in `addPet` broke loading once).

When you add a feature, extend the harness to cover it. If you add a DOM method or a three.js class the page did not use before, the fake needs it too.

## 10. Honest limits of the work so far

**Claude never saw the game in 3D.** The chat environment could not load three.js, so nothing was ever rendered. Everything was checked by simulation, by 2D drawings made from the real shapes, and by screenshots of the HTML and CSS only (with a fallback font, never Luckiest Guy).

So the first job in Claude Code should be to open the real game in a browser, take screenshots, and look. Things most worth checking by eye:

- The front cover: the flying camera, and whether clouds get in the way.
- The third-person camera: distance, height, and how it behaves on slopes and near trees.
- The switch to first person when entering the cave, and back when leaving.
- The dungeon: overall brightness after the walls were darkened, the carts, the ladder shaft.
- The fall through the pond and the fade when climbing out.
- Sign text on the plots and stalls: right way round and readable.
- Every hairstyle and accessory on the avatar, especially hats over hair.
- The shopkeeper, and the shop view with her behind the avatar.
- Desert dunes, the jungle plants, and the mountain range.
- Speed on a Chromebook and on a phone.

Adriana has been playing it and has not reported any of these as broken, but she has not confirmed them either.
