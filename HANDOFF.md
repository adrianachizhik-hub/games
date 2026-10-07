# Dragon Keepers (was Mutation Mayhem): handoff

Written on 4 October 2026 by Claude (claude.ai chat) for Claude Code. Read this whole file before touching the code. Everything Adriana asked for, everything that was built, and everything that is still open is in here.

## 1. What this is

**Dragon Keepers** (first called Mutation Mayhem) is a 3D dragon-collecting game that runs in a web browser. Adriana is the designer. She describes what she wants in a sentence or two, and Claude writes all the code. She does not read or edit the code herself.

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
- The first plot you walk onto in town becomes yours for this visit (yellow square on the minimap) and your saved dragons appear on it (`claimPlot`); Leave gives it back (`releasePlot`). Adriana asked for this: "they walk to a plot and when they step on it all of their things load on it". Which plot is not saved. Its sign is repainted as "<name>'s Plot" (`paintSign`, `nameMyPlot`; long names shrink and split onto two lines). Only one plot per player for now.
- Since 6 October 2026 (Adriana: "the prismatic doesn't just spawn in the secret mine") every hiding place below goes into one list (`eggSpots`, 46 places) and any egg can turn up at any of them, at random (`freeSpot`); rare eggs stay rare only because fewer are out. The original per-tier places: Common on beaches and meadows (6 out at once), Rare deep in the jungle and desert (4), Legendary high in the mountains near the peak (3), Mythic inside the crystal cave (2), Prismatic down in the mine (1). Since 6 October 2026 (Adriana: "make the prismatic eggs be in hard places to find") a Prismatic egg only goes to the hard places, the Legendary, Mythic and Prismatic spots (mountains, crystal cave, mine; `hardSpots`, `freeSpot(avoid, tier)`); other eggs can still go anywhere. Spots are picked once from their own random stream (`W.rng(4142)`), so plants did not move. A collected egg turns up again somewhere else, away from you.
- Walk into an egg to carry it (held over your head, countdown at the bottom). Time = the tier's `base` seconds (30, 24, 20, 17, 15) plus 1 second per 7 units from the egg to your plot. Adriana's "rarer dragons are faster" was read as "rarer eggs hatch sooner"; she has not confirmed this.
- Bring it into your plot: it wobbles and hatches, and the dragon lives on your plot and wanders about (rarer ones walk faster). Run out of time: it hatches where you are and the baby flies away.
- No jumping to places (1 to 8 or the buttons) while carrying, and the avatar shop button hides (the shop would pause the clock). Leave puts a carried egg back.
- The harness checks all of this, and runs from every hiding place to the plot to show each can be reached and brought home in time.

**Riding (section "Riding your dragons"):** click or tap one of your dragons (within 10 units) to climb on; it grows to riding size (`RIDE_SIZE`). It walks where you steer, much faster than running (18 + 2 per tier on the ground, 30 + 5 per tier flying, Shift adds half again), rarer ones faster. Jump twice quickly (within 0.35 s) to take off; while flying, hold Jump to climb and let go to glide down. One jump on the ground gets you off, and the dragon flies home to your plot. Riding stops at the cave (too big). Jumping to a place or Leave sends it straight home. Jump taps are remembered between frames (`jumpTapped`) so quick double-taps work on slow devices. Only your 24 newest dragons roam the plot; all are saved.

**Upgraders (the red stall, section "The red stall: upgraders"):** the red stall's sign says "Upgrades" (sign cell 9) and the shop button at it reads "Open the upgrade shop". It restocks every 4 minutes on the clock (`RESTOCK_SECONDS`), the same for everyone: each upgrader is in stock with chance `STOCK_CHANCE` (90, 60, 30, 12, 4%) with 1 to `STOCK_MOST` (5, 3, 2, 1, 1) of them, and a countdown shows the next restock. 5% of restocks also show an "Egg radar" at 999,999,999 coins that always answers "You don't have enough money." (Adriana's idea: players can't get the admin radar). Too few coins for anything now also says "You don't have enough money." Five upgraders (`UPGRADERS`): Common ×1.5 for 100 coins, Rare ×2 for 500, Legendary ×3 for 2,500, Mythic ×5 for 10,000, Prismatic ×10 for 50,000. Adriana's rule: any upgrader works on any dragon, each upgrades only one dragon, better ones boost more. You buy one (it goes into the inventory) and can then pick the dragon from a list showing its coins now and after. A dragon holds one upgrader. Saved in `mutation-mayhem-upgrades`, matching `mutation-mayhem-dragons` by position (-1 for none). The prices and boosts were Claude's choice.

**Your plot's menu (section "Your plot's menu"):** stand on your plot and press "Open my plot": every dragon with Store or Place. More space is bought at your name sign (Adriana's request): stand by it and the button reads "Buy 1 more space · 500 coins", doubling each time (`spacePrice`, `signSpot`). When a stall and a sign are both in reach, the nearer one gets the button. A dragon hatched onto a full plot goes to storage. Adriana's rule: 5 to start, buy more, price goes up each time; the numbers were Claude's.

**Inventory bar (section "The inventory bar"):** along the bottom (on touch screens in the gap between the walking circle and Jump/Leave, with smaller items that scroll sideways, so it never covers the character), only while it holds something: dragons not on your plot and upgraders not used yet, stacked when alike. Adriana's request. Click a dragon to put it on your plot (needs a claimed plot and a free space); click an upgrader to pick a dragon for it. Bought upgraders now go into the inventory (`upgradersOwned`, saved as `mutation-mayhem-upgraders`) and the shop offers to use one at once (Back keeps it). Upgraders now stack on a dragon (see the fire village notes).

**Fire village and the fire egg (sections "The fire village and its bonfire" and "The secret shop"), Adriana's big idea of 6 October 2026:**
- A village of 7 huts and 8 villagers with axes on the far south-west corner (`VILLAGE` at -30, 117, the flat land farthest from town). Plants are kept off it in `probe()`. Place 9, "Village", jumps near it.
- On the clock (same for everyone), every 10 minutes (`FIRE_PERIOD`) the villagers light a bonfire ten times a person's height for 2 minutes (`FIRE_LIT`) and dance round it; a small fire egg hides in the flames. Without fire resistance the heat pushes you back.
- Grab the egg (fire resistance needed): `FIRE_SECONDS` 15 to reach your plot (Adriana changed 20 to 15), riding allowed. After a quarter of a second the villagers chase at `VILLAGER_SPEED` 150 (was 1 second and 120, but then an unupgraded jade could reach close plots in time) (horizontally; they leap, so flying high doesn't help). Caught (within 2.5) or out of time: sent back to your plot without the egg, which goes back into the fire. Home in time: it hatches a fire dragon, boy or girl 50/50, earning 500,000 coins every 3 seconds (Adriana's number). One fire egg per fire per device (`mutation-mayhem-fire-taken`).
- Escaping needs a fast dragon: flying with Shift is (30 + 5 × tier) × 1.5 × (1 + speed%), so a jade or diamond (75) needs 5 to 6 Prismatic upgraders depending on the plot, a fire dragon 4 to 5, a green dragon 15 to 17 (worked out by simulating the straight-line chase to each plot). Adriana asked that it take the best upgrader "lots of times".
- Fire dragons (`fireboy`, `firegirl`): neon red with flame stripes and flames on the back; girl: eyelashes, pink bow, pinker red; boy: big dark horns, flame crest, chin spike. Concept: `concepts/fire-dragon.html`.
- Upgraders now also add speed for good, and stack (`dragonSpeed`, saved as `mutation-mayhem-speed`): Common +2%, Rare +4%, Legendary +6%, Mythic +8%, Prismatic +10%. A dragon can take any upgrader again and again; its coins use the best one it has had. (This replaced "the old upgrader returns to the inventory".)
- Secret shop: a vine-covered stall with a hooded keeper deep in the jungle (`SECRET` at -28, 46), made more hidden at Adriana's request: thick hedges on three sides with a narrow gap at the front, leaves heaped on the roof, no lantern, and the jungle grows right up to it. Only opens for players who own a diamond dragon (Adriana's rule). Sells fire resistance: 250,000 coins for 5 minutes (Claude's numbers), time adds up, shown as an orange pill under the coins, saved as an end time (`mutation-mayhem-fireres`). Adriana: "We will add more to the secret shop later."

**The yellow stall: the Everything Shop (6 October 2026).** Adriana named it. Sign cell 11 says "Everything"; the button reads "Open the Everything Shop". The panel (`#allShop`) has three tabs down the left side (along the top on phones): Dragon treats, Plot decorations, Dragon outfits. All prices and effects are Claude's choice; she has not confirmed them.
- **Treats** (`TREATS`, timed, saved as end times in `mutation-mayhem-treats`): Coin Cookie ×2 coins for 5 minutes (5,000), Golden Apple ×3 coins for 3 minutes (40,000), Fire Pepper dragons fly 25% faster for 3 minutes (50,000). Coin treats do not stack, the best one counts (`treatCoins`); buying again adds time. Running treats show in the effects pills.
- **Decorations** (`DECOR`, bought once, saved in `mutation-mayhem-decor`; once bought, "Take it off" and "Put it back" are free, `decorOff`): flower beds 1,000, fairy lights 3,000 (Adriana's idea: coloured lights on little poles all around the edge, leaving the way in open; each bulb twinkles at its own pace, `twinkleLights`), lamp posts 2,500, treasure chest 5,000, fountain 15,000, dragon statue 50,000. Built on whichever plot you claim (`buildDecor`), taken off on Leave (`clearDecor`).
- **Name collar** (first row of the outfits tab, Adriana's idea, "1 per collar"): 2,000 coins (Claude's price). Pick a dragon, type a name (up to 16 letters); the collar is used up. The dragon wears a red collar with a gold tag and its name floats over it on the plot; lists show "Name (Kind)" (`dragonLabel`). A new collar renames it. Saved in `mutation-mayhem-collars` and `mutation-mayhem-dragon-names` (parallel to the dragon list; `removeDragon` keeps it in step).
- **Entrance arches** (4th tab, `ARCHES`, Adriana's idea: "a flower one, a vine one and like 10 more"): Flower 2,000, Vine 2,000, Stone 4,000, Beach 6,000, Candy 8,000, Mushroom 10,000, Ice 12,000, Rainbow 15,000, Lava 25,000, Crystal 30,000, Golden 60,000, Dragon (two little ruby dragons on top) 100,000. Claude chose the ten extra designs and the prices. Bought arches are kept (`mutation-mayhem-arches`); one stands over the way into your plot at a time (`mutation-mayhem-arch`), and swapping is free. Built by `archModel` alongside the decorations.
- **Keepers: the twins Lexi and Max** (Adriana's names and idea: "identical twins that argue over who will take the customer"). Same face, clothes (yellow T-shirt, orange shorts) and auburn hair colour, both with freckles; Lexi has long hair with a pink clip, Max swoopy hair (her request). Talking (button "Talk to Lexi and Max") plays an argument, line by line (Claude's words), then you pick Lexi or Max; the winner cheers, the other sulks, then "Show me the shop". Talking supports several speakers via `lines` and a choice via `pick` in `keepers`.
- **Outfits** (`OUTFITS`, owned counts in `mutation-mayhem-outfits`, what each dragon wears in `mutation-mayhem-dragon-outfits`, parallel to the dragon list): party hat 1,000, bow tie 2,500, sunglasses 5,000, cape 10,000, crown 50,000. After buying you pick a dragon; one outfit per dragon, and a swapped-off outfit goes back to you.

**The swamp, the quicksand and the mud cavern** (6 October 2026, Adriana's idea; sections "The swamp..." in both scripts):
- The island got bigger instead of squeezing other places: `coastS` grows a new stretch of land east of the desert, and the swamp sits on it (`W.SWAMP` 174, 36, radius 34; `swampF`). Low boggy ground with murky green pools, dead trees hung with moss, reeds and cattails, lily pads, mossy logs, toadstools. Normal plants stay out (`probe`). Zone "Swamp"; admins have a Swamp place button. The minimap now shows a bit more (`MAP_R` 215).
- **Quicksand** (`QS`, 152, 30, near the desert side, unmarked): step on it on foot and you sink (1.6 s), then fall for 10 seconds down a muddy shaft (`quicksandStep`), landing in the **mud cavern** (`MUD`, floor -62): big lumpy mud walls, roots, puddles, glowing mushrooms, "GET OUT THIS WAY" signs with arrows, and a tunnel west that comes out in the desert at `MUD_EXIT` (122, 27) by a rocky mound with a dark hole (`mudMove`, `leaveMud`). Riding or flying over it is safe.
- The bunker's code sign moved here from the mine. Three of the Prismatic hiding places are down here (any egg can turn up there; Prismatic eggs only in hard places), and an egg found in the cavern gets 20 seconds more.

**Multiplayer** (6 October 2026, Adriana's request): `server/server.js` is a small Node server with no packages (its own minimal WebSocket code). It keeps 11 servers, 7 plots each. A new player joins Server 1 if it has a free plot, otherwise the next server with room. It passes along positions (10 a second), who owns which plot (one owner per plot; others get "This is X's Plot. Find a free one!"), the dragons on each plot, avatar colours, chat (per server), admin announcements (every server; the server checks the admin name and code against the same scrambled numbers), and storm lightning hitting another player (they bounce back). Coins, dragons and eggs still live on each device. The game finds the server with `?server=...` in the address, or `wss://dragon-keepers-server.onrender.com` when it runs on Render, or `ws://localhost:8080` locally; without one it plays offline as before. `render.yaml` now also has the server as a free Render web service (it sleeps after 15 minutes idle; about a minute to wake). Tests: `node tools/servertest.js` (set ADMIN_NAME and ADMIN_CODE for the admin checks). Not shared yet: eggs and lucky blocks (each player has their own), bans, unique names.

**Day and night** (7 October 2026, Adriana's request; `dayNightStep`): a 20-minute day on the clock, the same for everyone: 13 minutes of day, a minute of sunset, 5 minutes of night (moon, stars, dark blue sky, dim light and clouds; glowing things keep glowing), a minute of sunrise. "🌙 Night" shows under the coins. The 👻 Ghost night event makes it night while it lasts.

**Accounts: one save per name** (bug fix, 7 October 2026: a new name on the same device got the old name's dragons, avatar and coins, and no tutorial). Each name now has its own save (`switchAccount`, `accountKey`): the normal `mutation-mayhem-*` keys hold the save of the name in use (`mutation-mayhem-active`), others are put away as `dk-acct:<name>`. Pressing Play with a different name swaps the saves and reloads the page, which starts by itself (`dk-autostart` in sessionStorage); nothing is saved during the swap (`switchingAccount`). Shared by the whole device: bans, admin storm dragons and admin decorations, the last name typed. The save from before this change belongs to whichever name plays first. The old "names can't be changed" rule is gone: another name simply is another account.

**Admins control day and night** (7 October 2026): "Day and night" buttons ☀️ Day, 🌙 Night, 🔄 Normal (`setTimeMode`); for everyone online, and the server remembers it for people who join later (`timeMode`, sent in `welcome`). Stays until Normal.

**Testing names** (her request): anywhere but the real Render site (the preview in Claude, a local file), names never lock and there's no "are you sure", so she can try different names (`TESTING`). Adding ?test to the Render address does the same there.

**The volcano moved** to its own new stretch of land north-east of town (`W.VOLC`, 150, -88; another bump in `coastS`), on black volcanic rock where nothing grows.

**Smaller inventory bar** (her request): narrower, smaller items, no second line of text.

**Gift & trade** (Adriana, 7 October 2026: "gift coins and dragon only"; "for trading you can put in dragons and add coins"). Online only: a "🎁 Gift & trade" button on the left shows when someone else is on your server. It lists the players; **Gift** sends coins (type how many) or a dragon (press Give, then Sure?); **Trade** asks them (a Yes/No box, which says no by itself after 20 s). In a trade both see both offers, put in dragons and coins, and it only happens when both press Accept; changing an offer means both have to accept again. Server messages: `gift`/`gifted`/`giftsent`/`giftback` (a gift to someone who left comes back), `tradeask`, `tradeanswer`, `tradeopen`, `tradeset`, `tradestate`, `tradeaccept`, `tradedone`, `tradecancel`/`tradeclosed` (also sent when the other player leaves). A dragon travels with its mutations, upgrader, speed, name and outfit (`dragonCard`, `getDragon`). Claude's choices: admin storm dragons, the dragon you're riding, and an admin's unlimited coins can't be given; a gifted dragon goes on your plot if there's room, else into the inventory. Like everything else, the server trusts each device about what it owns.

**Shared plot decorations and admin eggs** (bug fix, 7 October 2026: other players' decorations and admin-spawned eggs were only on their own device). Each player sends their decorations, arch and (admins only, checked by the server) admin decorations (`sendDecor`, server message `decor`, also in each player's card); everyone builds them on that player's plot (`drawAllDecor`; the models take `decorPlot`). An admin's spawned egg goes to everyone on that server (`egg`, kept in `room.eggs` for people joining later; `makeSpawnedEgg`, `netEgg`). Whoever picks it up first takes it from everyone else (`eggtaken`); if they drop it, it shows again where they dropped it (the server lets a non-admin re-place only an egg they took).

**Tutorial** (her request): 7 tips at the top of the screen, only for a first-time player on that device (no saved dragons, no name yet, never played; `mutation-mayhem-played`), never for admins or after the first time. Walking and claiming a plot move it on by themselves; Next and Skip tutorial buttons.

**Mutations** (6 October 2026, Adriana's list of 26 plus UFO, Angel, Devil, Dirt and Giant; table `MUTATIONS`): each changes the look (`buildMutFx`, `mutStep`: colour wash, see-through, glow, rainbow, glitch flicker, and little effects: rising flames/bubbles, falling snow, dripping goo, orbiting clouds/metal/stars/dirt, crystals and gems stuck on, auras, rings, halo, horns, disco beams, a tiny UFO) and multiplies coins (Claude's amounts, by rarity: common ×1.5, uncommon ×2, rare ×3, legendary ×5; UFO ×4, Electric/Fire/Dirt/Giant ×2). Fire also gives 3× riding speed; Giant makes the dragon twice as big. Mutations stack and their coin bonuses multiply. Lists show them like "🌌 Cosmic ×5 Ruby dragon".
- **Every mutation comes from its own event** (Adriana, 6 October 2026: no handing them out; `EVENT_LIST`, 33 events with tacos). Every 30 minutes on the clock an event picked at random starts and lasts 5 minutes, the same for everyone (`slotEvents`, a dice roll from the half-hour number); about 1 in 8 times two events play at once (`EV_DOUBLE`). Kinds: 'fall' (fireballs, rocks, hail, lightning, candy, raindrops, crystals, goo, shooting stars, solar flares, moon rocks, flowers, disco balls, radioactive meteors, bubbles, golden meteors, eclipse rings, diamonds), 'fly' (UFOs, angels, devils, storm clouds, ghosts that stop and shine a beam down), 'spot' (air jets, black holes, rainbow beams, glitch zones, fire tornadoes, magnet storms, crimson mist, portals on the ground for a few seconds) and the volcano. Everything lands at random all over the island (her request: not just the plots). A dragon of yours caught in it gets that mutation. The eclipse darkens the screen; the fire storm makes its edges glow. Electric also still comes from an admin's storm lightning. The random mutations and the admin "Give a mutation" button were removed at her request.
- **Taco mutation** (Adriana, 7 October 2026): event "🌮 Raining tacos" (a 'fall' event, look `taco`, `tacoModel`: a folded yellow shell with lettuce and tomato). Lots of little tacos rain down all around you (mostly where you're looking; `spawnLittleTaco`, up to 140 at once) and only bounce off; only a BIG taco (one of the normal falling ones, `tacoModel(18)`) landing on a dragon gives it the Taco mutation (Adriana's rule): little tacos orbit it. ×3 coins (Claude's choice). Now 33 mutations and 33 events.
- **🌈 Turn on all mutations** (admin button, Adriana's request): starts every event at once for 5 minutes, for everyone online.
- **The volcano** (`VOLCANO`, on its own land north-east of town since 7 October; ring of colliders round it): smokes a little all the time; during "🌋 Volcano eruption" its crater glows and it shoots magma rocks in arcs all over the island (Magma mutation).
- Admins: "Start an event" (pick any of the 32; for everyone online).
- Not shared online yet: other players see your dragons, but not their mutations.

**Choosing a server** (Adriana: her friends ended up on a different server): the front cover lists all 11 servers with how many are playing (and who, on hover), full ones greyed out (`refreshServers`, from the server's `/status`). The busiest server with room is picked to start with; tap another to choose it. If the chosen one fills up first, you go to one with room and are told.

**Fire storm and the Fire mutation** (her idea): every 30 minutes on the clock, for 5 minutes, fireballs fall at random all over the island (`FS_PERIOD`, `fireStormStep`, `spawnFireball`); a dragon is hit only if one happens to land on it. A dragon hit gets the Fire mutation for good (orange embers): 3× riding speed. Mutations are now a list per dragon (`hasMut`, `addMut`), so a dragon can have Lightning and Fire. The screen edges glow orange during a storm. Admins have "🔥 Start a fire storm" (for everyone online).

**"Open my plot"** now sits at the left side of the screen instead of over the player (`#shopOpen.corner`).

**Admin shop** (admins only, all free): a "⭐ Admin shop" button on screen opens the Everything Shop's panel in admin mode with 8 extremely cool decorations (`ADMIN_DECOR`, `adminDecorModel`): rainbow portal, floating crystal island, mini volcano, lightning tower, giant spinning diamond, golden dragon throne, laser light show, fireworks launcher. Most move (`adminAnims`). Saved in `mutation-mayhem-admin-decor`; only shown while an admin is signed in.

**Riding from the inventory** (her request): clicking a dragon in the inventory puts it under you and you ride it. Get off on your plot and it stays there (if there's room); anywhere else it goes back into the inventory.

**Getting off a dragon** (Adriana's rule, 6 October 2026): off your plot it goes into your inventory (`storeDragon`) instead of flying home; on your plot it stays there.

**Admin dragons hover**: letting go of Jump keeps a Storm dragon at its height; only diving (C or the Down button) brings it down. (Also fixed: a mistake had let gravity pull on flying dragons since the dive button went in.)

**The nuke bunker and the nuke egg** (6 October 2026, Adriana's idea; section "The nuke bunker"):
- Hidden since 6 October 2026: sand heaped over the roof and banked against the walls, rocks and bushes round it, a small sign; it looks like a dune with a door. The monster sleeps inside at the back, by a puddle of glowing goo (`DEN`), and wakes 0.05 s after you grab the egg; speed 165, which needs 9 Prismatic upgraders on a fire dragon from every plot.
- A concrete bunker on the far north-east corner (`W.BUNKER`, 84, 84; the ground there is levelled in the World script, so some plants and hiding places moved a little). Hazard stripes, a radiation sign, a "NUKE BUNKER" sign, barrels, and a locked steel door with a keypad.
- The code is **5367** (her number). It's written on a sign in the mud cavern under the swamp (it was in the mine before): "5367 / Go to the nuke bunker and put it in." At the door the button says "Use the keypad"; typing 5367 (buttons or number keys, Enter) slides the door open until Leave.
- Getting in also needs a **Radioactive resistant upgrader** from the secret shop (1,000,000 coins, 5 minutes, adds up; `mutation-mayhem-radres`); without it the radiation bounces you back out.
- Inside, the nuke egg glows on a stand. Grab it: **13 seconds** to get home, and the **nuclear monster** (a huge glowing green brute) climbs out of its toxic pit behind the bunker and chases you (`MONSTER_SPEED` 170, pit 15 behind the egg). Worked out so a fire dragon needs 9 Prismatic upgraders from the four far plots and 8 from the three nearest (Adriana asked for 9). Caught, too slow, or dropped: back to your plot, egg back in the bunker. Home: a **nuke dragon**, boy or girl 50/50 (glowing green, hazard stripes, radiation signs; boy black horns and chin spike, girl eyelashes and a yellow bow), 750,000 coins a payday and a little faster than fire dragons. One nuke egg every 10 minutes (`mutation-mayhem-nuke-taken`). Admins can spawn a Nuke egg too; the monster still chases.
- Storm-dragon lightning bounces the monster back for a moment too.

**Lightning mutation** (Adriana: "if an admin zaps someone's dragon it gets the lightning mutation"): riding a Storm dragon, click one of your own dragons on the plot. It gets the Lightning mutation for good (`dragonMutation`, `mutation-mayhem-mutations`): twice the coins, yellow sparks around it, "⚡ Lightning" in its name in lists. Without a server it only reaches the admin's own dragons; with one it would work on other players' dragons.

**Diving** (her request, for the slow glide down): while flying, hold C (or Ctrl, or the "Down" button on touch screens) to dive fast.

**Skip** button on long conversations (the twins): jumps to the last line with the answers showing.

**Dropping an egg** (Adriana's request): while carrying an egg a Drop button (or G) puts it on the ground where you stand; walk away and come back to pick it up (its timer starts again). A fire egg dropped goes back to the fire and the villagers go home.

**Flying higher** (her bug report: dragons barely left the ground): taking off now climbs by itself for 1.4 s, holding Jump climbs at 24 (times the dragon's size), letting go glides down slowly, and the ceiling is 200.

**Lucky blocks (section "Lucky blocks"):** 8 yellow "?" blocks spinning around the island (outside town). Walk into one to pick it up (held over your head); Adriana asked that it be brought back to your plot and opened there, before a countdown runs out: `LUCKY_BASE` 30 seconds plus 1 per 7 units from your plot (her request: "time based on how far it is"). The clock stops once you are on your plot; too late and the block crumbles and turns up elsewhere 45 seconds later. No jumping to places while carrying it, and no picking up eggs or other blocks. On your plot the button reads "Open the lucky block": Common egg 50%, Rare 30%, Legendary 10%, Mythic 5%, Prismatic 1% (Adriana's odds), which hatches on the spot, or the other 4% gives 250 coins (Claude's choice; she did not answer). Needs a claimed plot. Leave puts a carried block back. An opened block turns up somewhere else, at least 40 away, 45 seconds later.

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
- Title "DRAGON KEEPERS" in chunky letters (Luckiest Guy font from Google Fonts, with fallbacks). Adriana renamed the game from "Mutation Mayhem" on 6 October 2026, picking from Claude's list. DRAGON is big in fire colours, KEEPERS under it in jewel colours; the O is a gold dragon's eye with a slit pupil that blinks. The saved-data keys still start with `mutation-mayhem-` on purpose, so nobody loses their progress; don't rename them.
- Behind it the camera circles the island from the air.
- Tagline: "Hatch, raise and ride dragons on Isla Verde" (Claude's wording).
- A yellow **Play** button, then a box "Enter your name" (up to 16 characters, Enter also starts), then a controls reminder.
- An empty name becomes "Player". The name is remembered on the device.

### Admin sign-in
- One special name makes an "Admin code" box appear. The right code starts the game as an admin. A wrong code shows a message and does not start.
- **The name and code are not written in this folder on purpose. Adriana knows them. Ask her if you need them for testing, and never commit them.**
- In the code they exist only as scrambled numbers made by `scramble()`, one pair per admin in `ADMINS`. A second admin, Ellie, was added on 6 October 2026 at Adriana's request with the same powers (her name and code are known to Adriana; not written here). The check is `scramble(name.toLowerCase())` and `scramble(name.toLowerCase() + '#' + code)`. To change them, compute new numbers with the same function.
- This hides them from a quick look. It is **not real security**, and she was told so. Before admins get real powers in a shared game, the check must move to a server.
- An admin's name tag shows the part before the `@` plus a yellow "Admin" badge. Only that plain name is remembered, so the admin types the full name and code every time. Leaving signs the admin out.
- Small quirk: the tag keeps the capital letters as typed.

### Admin panel
- Admins get a yellow arrow tab on the right edge under the minimap. It slides a panel in ("Admin commands").
- New commands go inside `#adminCommands` as buttons; the "No commands yet" note hides itself when that element has children.
- **Unlimited coins** (6 October 2026): while an admin is signed in, coins are `Infinity` (shown as ∞); the admin's own coins are put aside (`realCoins`) and come back on Leave. Unlimited coins are never saved. Things bought while admin (upgraders, space) do stay on the device.
- **Spawn an egg** (6 October 2026): a button per tier, Common to Fire; the egg appears 3 steps in front of you and is carried home like any egg. A spawned Fire egg works like the real one (Adriana's request): 15 seconds, and the villagers chase you; it doesn't use up the village's fire egg. Spawned eggs vanish once used (`spawned`).
- **Add a dragon to your base**: pick any kind; it goes straight onto your plot (or the inventory if you have no plot yet).
- **Unlimited plot space** for admins (`slotLimit`); the sign's buy-space button is hidden for them. On Leave, extra dragons beyond your own spaces go back to the inventory (lowest earners first).
- **Ban a player**: type a name; that name can't press Play ("has been banned by an admin"). Kept on this device only (`mutation-mayhem-banned`) until there is a server. Admin names can't be banned. Unban buttons are listed below.
- **Lucky blocks + secret shop on map** (6 October 2026, Adriana's request): a toggle, on by itself when an admin signs in. Yellow squares on the minimap for every lucky block out on the island, a purple star for the secret jungle shop.
- **Restock shops** (6 October 2026): fills the red stall with every upgrader at its most (5, 3, 2, 1, 1) until the next normal restock (`adminRestock`). No server yet, so it only restocks the admin's own game.
- **Storm dragons, one kind per admin** (Adriana: "Ellie's is a girl and mine is a boy"): the first admin in `ADMINS` gets `stormboy` (deep blue, thick dark-tipped horns, chin spike, gold king's crown with a blue gem), the second `stormgirl` (sky blue and violet, eyelashes, silver tiara with a pink gem). Both wear a lightning saddle (dark seat, gold or silver trim, lightning bolts on the side flaps). Each admin's count is saved apart (`mutation-mayhem-storm-<admin number>`; `adminNo`). Speeds raised to walk 140, fly 600 (900 with Shift) at her request ("EXTREMELY fast").
- **Storm dragons** (6 October 2026, Adriana's request with a picture of a tall golden dragon on a mountain; "make it admin only"): button "⚡ Add a Storm dragon (admins only)". Electric blue with a long neck held high, a crown of swept-back horns, huge wings, yellow lightning stripes and sparks crackling around it (`sparkStep`). About 2.3 times bigger than other dragons (`big`), on the plot and when ridden (the camera sits higher and further back). Walks 60 and flies 220 (330 with Shift), far faster than anything else. Makes 30,000,000,000 coins every 3 seconds (10 billion a second); while an admin has unlimited coins, paydays go into their own coins (`realCoins`), which they keep after Leave. Riding one, click or tap someone to shoot lightning from its mouth (`zap`, `shootBolt`): whoever it hits is bounced backwards through the air (`knock`). For now that's villagers (they stop chasing for a moment) and shopkeepers (they walk back to the counter); other players once there's a server. Admin-only: they live in their own count (`mutation-mayhem-storm`), join the dragon list when an admin signs in (`addStorms`) and leave it on Leave (`removeStorms`); they are skipped when the saved list loads, can't be sold, and aren't in the "Add a dragon" list.
- **Announce to everyone** (6 October 2026): an admin types a message; it pops up at the top middle with their name and the Admin badge for 8 seconds (`showAnnouncement`). No server yet, so only the admin sees it; with a server, `sendAnnouncement` sends it and every game calls `showAnnouncement`.
- **Egg radar** (asked for on 4 October 2026, the first command): a button that turns on and off. While on, the minimap draws a dashed line to the nearest egg with a pulsing ring on it, and a yellow label under the minimap says which kind it is, how far, and "in the cave" or "in the mine". It switches on by itself when an admin signs in, and off on Leave. One use at a time (Adriana's request): picking up any egg switches it off; switch it on again for the next egg. To test admin features without the real name and code, run the harness on a copy of `index.html` where `start()` sets `isAdmin = true`; never commit that copy.

### Playing
- **Camera:** behind the avatar outdoors (`CAM_BACK = 5.2`). In the cave and dungeon it slides into the avatar's head (first person), because there is no room behind you. It is kept above the ground and the sea.
- **Keys:** up/down or W/S walk, left/right or A/D turn, Q/E sidestep, Space jumps, Shift runs, 1 to 8 jump to places, Enter opens the avatar shop when its button shows, Escape closes it.
- **Places:** Beach, Jungle, Desert, Waterfall, Cave, Peak, Meadow, Town, Village. Since 6 October 2026 only admins can jump to places (Adriana's rule); for everyone else the place buttons are hidden and the number keys say "Only admins can jump to places. Walk there, or ride your dragon!". Everyone starts in the middle of the four shops (`spawnInTown`), facing out between two stalls.
- **HUD:** name tag, zone name, place buttons, hint line, round minimap, key reminder, Leave button.
- **Leave** returns to the front cover at once. The next Play starts again in the middle of the shops. There is no "are you sure?" yet (see section 8).

### Avatar and avatar shop
- The avatar is a blocky figure built by `figure(paints)`. Limbs hang from joints and swing when walking.
- A new player starts with short hair, a red shirt and brown pants (Adriana's choice). What the player wears is in `AV`: `skin`, `hair`, `hairColor`, `shirt`, `pants`, `head`, `back`. The allowed values are in `CHOICES`. `dress(save)` applies it. It is remembered on the device.
- Choices: 6 skin colours, 11 hairstyles (short, buzz cut, spiky, swoop, curly, bob, long, **ponytail**, pigtails, bun, no hair), 8 hair colours, 10 shirt colours, 8 pants colours, head accessories (cap, crown, top hat, cat ears), back accessories (sword, skateboard, backpack, wings).
- Hairstyles are blocks listed in `HAIR_SHAPES`. Pieces under `up` stick up and are hidden under a cap, crown, or top hat.
- **Using the shop:** stand in front of the blue stall and a button "Open the avatar shop" appears. While it is open the camera faces the avatar, the game HUD is hidden, and movement is paused. Picking a back accessory turns the avatar around; picking hair turns it part way. There is a "Turn around" button and a "Done" button that stays in view.
- "Everything is free for now" is written in the panel, because coins do not exist.
- **Shopkeeper:** a stylish girl behind the blue stall's counter (pink jacket, white top, purple skirt, gold belt, white boots, sunglasses, gold jewellery, teal beret and handbag, long high ponytail with pink tips). She sways and waves when the player is near. Her name is **Mia**.
- **Sell shopkeeper Kai** (`sellKeeper`, Adriana: "black with spikey hair, you choose the colors"; she named him Kai on 6 October 2026): a boy with dark brown skin and spiky black hair with lime-green tips, lime hoodie, black joggers with a lime stripe, white sneakers, gold earring. His line (Claude's words): "Yo, I'm Kai! Got a dragon you don't need? I'll give you good coins for it." Answers "Sell a dragon" / "Not today".
- **The green stall is the sell shop** (section "The green stall: selling dragons"): sign "Sell"; every dragon listed with its price, `SELL_TIMES` 20 × its coins per payday (upgrades included), sorted dearest first. Sell asks "Sure? Sell for ..." on a second press. You can't sell the dragon you're riding. `removeDragon` keeps the parallel arrays and the plot pets' `index` in step.
- **Upgrade shopkeeper** (`upKeeper`, Adriana's request): a boy behind the red stall's counter in simple clothes (plain green T-shirt, jeans, white sneakers) with long swoopy light-brown hair across his forehead and down to his shoulders. He sways and waves like her (`keepers` in `keeperPose`). His name is **Leo**.
- **Talking to them** (Adriana's request): name tags float over their heads. At their stall a blue "Talk to Mia/Leo" button appears (beside the shop button); hold E for half a second (the button fills up) or tap it. Mia: "Ugh, what do you want? Hurry up and stop wasting my time." Leo: "Hi! How are you doing? Do you need an upgrader?" (Adriana's words, punctuation tidied). The words appear a few at a time. Answer buttons were Claude's addition: Mia "Show me the avatars" / "Bye", Leo "Yes please!" (opens the upgrade shop) / "No thanks". Walking away or Escape closes it. Near a shopkeeper E talks instead of stepping sideways.

### Saved on the device (`localStorage`)
- `mutation-mayhem-coins`: coins. Every 3 seconds (`PAYOUT_SECONDS`) the dragons placed on your plot pay out together, each its `DRAGON_COINS` (green and red 1, blue and purple 3, bronze and silver 8, gold and ruby 20, diamond 50, jade 60) times any upgrader; a "+N" floats up from the counter. Adriana asked for "combined, every 3 seconds"; Claude read that as each dragon's amount every 3 seconds (a third of the earlier per-second speed) and told her. Counted on the real clock in `tick` (`earn`); a gap such as a hidden tab counts 5 seconds at most; nothing is earned on the front cover. Saved at each payday, on Leave and when the tab closes.
- `mutation-mayhem-slots`: how many dragons fit on your plot (5 to start, up to `MAX_SLOTS` 24). `mutation-mayhem-placed`: which dragons (positions in `mutation-mayhem-dragons`) are on the plot; the rest are in storage and don't earn. A device with no `placed` saved puts its best earners out first.
- `mutation-mayhem-bought`: what you bought from the red stall this restock round.
- `mutation-mayhem-name`: the player's display name.
- `mutation-mayhem-name-locked`: `'1'` once the player answered "I'm sure" to "Are you sure <name> is your name? You can't change it later." (asked the first time a name is used, Back or I'm sure). After that the name box is filled in and any other name is refused with "Your name is X. Names can't be changed." (capitals don't matter). An empty name plays as "Player" and locks nothing. The admin name skips the question, is never locked, and never replaces a locked name. Clearing the site's data in the browser is the only way to unlock, which Adriana has not been told how to do.
- `mutation-mayhem-avatar`: the `AV` object as JSON.
- `mutation-mayhem-dragons`: the dragons you have hatched, as a JSON list of colour names.

## 8. What is not built, and open questions

**Not built**
- The starter pets (dog, cat, parrot) and pets following you. Dragons from eggs do live on your plot (see "Dragons and eggs").
- Spending coins: prices and buying (coins are earned by dragons, see Saved on the device).
- Mutation blocks, mutations, rarities.
- Admin commands other than the egg radar.
- Saving coins and other progress (the name, avatar, plot and dragons are saved).
- Multiplayer. This needs a server, in every version of the plan.
- App Store packaging.

**Promised to her for later**
- Once pets and coins exist, make sure progress is saved before Leave, or add a confirmation.
- Add prices to the avatar shop when coins exist.
- The artifact link is still titled "Isla Verde". The game is now called "Dragon Keepers".

**Chat (section "Chat"):** a box in the top right beside the minimap (Adriana moved it there from the top left), folded to a "Chat" button on small screens. Enter or Send posts, "/" jumps to it, Escape leaves it; game keys are ignored while typing; 120 letters at most; the last 40 lines kept. There is no server yet, so only you see your own messages, and the box says so. When a server exists, `sendChat` sends and `addChat` shows incoming messages. Before strangers can chat, think about safety for young players: a word filter, reporting, maybe preset phrases, and what the App Store asks of chat in apps for children.

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

For admin features, run it signed in as an admin: `ADMIN_NAME=... ADMIN_CODE=... MODE=admin` (the `playAgain` helper signs the admin back in after each Leave).

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
