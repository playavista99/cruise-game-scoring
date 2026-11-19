# Cruise Game Scoring App

A static web app that replaces the paper name-and-score sheets cruise
activity staff use for deck games. One phone or tablet runs everything;
it works fully offline after the first load.

**Formats:** Quick Score leaderboard · Bracket (single + double
elimination) · Round Robin (pre-set schedules, or results-based Swiss
pairing with a manual "pair next round" button, plus an optional
playoff bracket seeded from the final standings).

**Games:** Soccer Shootout, Hole-in-One Golf, Bean Bag Toss, Pop Darts,
Axe Throw, Shuffleboard, Mini Golf — every scoring rule editable at
setup and mid-game — plus a custom game builder with export/import
codes so a whole activity team can run identical setups, and
**Closest Wins**, scored by camera-measured distance (below).

**Quick Score rounds:** Quick Score games can optionally play in
rounds (set at setup; brackets and round robins are unaffected). Two
scoring bases: **Cumulative** — each round's score adds to a running
total — or **Advance** — reach the round's target to stay in; anyone
below it is out (if nobody reaches a target, the round's top scorer(s)
advance instead, so a game never dead-ends). Round targets can be
planned at setup *and/or* set or changed on the summary screen after
each round, and rounds keep being added until staff finish the game —
there is no fixed round count. Finishing crowns the best running total
(Cumulative) or the best score in the final round among those still in
(Advance); ties are joint winners. The finish screen and history show
a round-by-round breakdown, and Play Again keeps the rounds setup.
Games saved before rounds existed load as classic Quick Score.

**Winner-only matches (v2.4.7):** any Bracket or Round Robin match —
playoff brackets included — can be decided with no score at all: the
scoring sheet's "Or just pick the winner:" buttons record who won
and nothing else. A winner-only match counts as played everywhere
(standings get the win/loss but no points; brackets advance the
winner and drop the loser as usual), shows as "X def. Y" in shared
results, history and the player view, and can be converted to a
scored result (or have its winner switched) by reopening it.
Replacing a recorded *score* with a winner-only result asks for a
second tap, since the numbers are discarded.

**Mid-game walk-ups:** players can join after a game has started.
Quick Score always allowed walk-ups; brackets accept them only while
no match has been scored (the bracket is rebuilt with the newcomer as
last seed). In a **pre-set round robin**, adding a player regenerates
the remaining schedule: scored matches are kept exactly as they are,
unscored pairings are rebuilt so everyone still gets their full game
count — and if the round robin was already complete, the newcomer is
rotated in against players who each get one extra game so they can
play. A **↻ Regenerate remaining schedule** button does the same
rebuild on demand (two-tap confirm). In a **results-based round
robin**, a walk-up joins the pool immediately (their standings row
says "Joins next round") and is paired when staff pair the next
round. Adds close once a playoff bracket has started.

**Editing players:** the **👥 Edit players** button on the play
screen (every format) opens an editor for the current game: fix a
name or cabin (handy for sign-up typos — the sign-up list itself also
edits names inline via the ✎ on each row), change a player's color,
**replace a player with a substitute** — the substitute takes over
that player's scores, matches and color, so a mid-game dropout costs
nothing — or **swap two players' identities**, trading their names,
cabins and colors while scores stay with the slots. Substitutions
and swaps are recorded on the finish screen, in history, and in the
shared results text ("Subs: Maria for John"). Finished games in
history are a record and can't be edited.

**Playoff field & bracket view:** when a round robin with a playoff
finishes, *Start playoff* opens a **field screen** before anything is
built: the top 2 / 4 / 8 from the final standings (size and
single/double style adjustable there), each seed with its standings
line. Any seed can be **replaced** with another player from the
standings — for someone who can't stay for the playoff — and the field
can be reset to the standings at any time. *Generate bracket* then
builds the bracket with standard seeding (1v8, 5v4, 3v6, 7v2, so 1
and 2 can't meet before the final). While no playoff match has been
scored, **↻ Regenerate bracket** returns to the field screen (field
preserved) and generating again rebuilds the bracket wholesale; once
a playoff match is scored the field is locked (use Edit players to
swap a person). The **🏆 View bracket** button — on round robin
playoffs and standalone bracket games alike — shows the whole bracket
as one chart: every round, with undecided slots reading "Winner of
Semifinal 1" / "Loser of Winners SF 2" instead of match numbers, and
matches can be scored right from the chart. A slot whose feeder match
has been decided shows that winner's (or loser's) name right away,
even before the other feeder is played — the match itself still only
becomes scorable once both players are set. These are format-level
features — they work the same for every game, built-in or custom.

**Entry colors — your choice at setup:** player colors are a setup
option, not automatic. The setup screen's *Player colors* toggle
defaults **on for Bean Bag Toss only** (the bags themselves are
colored) and **off for every other game**; flip it either way before
the game starts. When on, every player or team gets a color (Red,
Blue, Green, Yellow, Orange, Purple, Black, White) in sign-up order —
so Bean Bag starts Red vs Blue — changeable by tapping the color
swatch on the sign-up row, and the color dot follows the entry
through play, standings, brackets, results and history (Bean Bag
tap-by-tap scoring blocks are also tinted). When off, there is no
color UI anywhere and entries carry no color at all. Games saved
before the choice existed simply keep showing their colors.

**Game labels:** the setup screen's optional *Game label* names a
specific game — "Soccer Shootout — Day 1", "Soccer Shootout
Tournament" — and then titles it everywhere the game's name appears:
the play screen (base game name kept in the sub-line), home,
history, the results screen and the shared results text. The label
can also be set or changed later in the ⚙ Game settings screen.

**Saved setups:** *💾 Save these settings* on the setup screen stores
the whole configuration — base game, edited scoring rules, format
and its options, Quick Score rounds plan, colors choice and label —
under a name you pick. The home screen's *Saved setups* section
launches one straight to sign-up with two taps (▶ Start); players
are never stored, they sign up fresh each time. A setup whose custom
game template has been deleted is greyed out and can't start.
Setups are stored **on-device only** (localStorage, like games and
history) — they deliberately do not sync through Supabase; cloud
sync would need a new table and is out of scope.

**Home & starting a game (v2.0):** the home screen leads with two
big actions — *🎮 New game* and *🛳 New cruise* — followed by the
*Your cruises*, *In progress*, *Saved setups* and *History*
sections (each shown only when it has something in it). Tapping
*New game* with at least one cruise on file first asks **Where's
this game?** — *Standalone game*, or one of the cruises; with no
cruises it goes straight to the pick screen. Every entry (Home,
the chooser, and a cruise page's *New game in this cruise*) lands
on the **same pick-a-game screen**; when the game is headed into a
cruise, a banner above the list says *🛳 This game will be saved
in: <cruise>* with a *Make standalone* option that drops the cruise
and stays on the screen.

**Cruises:** the home screen's *Your cruises* section files a whole
sailing's games together. *🛳 New cruise* asks for a name (ship and
start/end dates are optional); opening a cruise shows its page: a
**summary card** (games played, the whole roster counted as
players, and a wins tally
per player — joint winners each count), its in-progress and finished
games, and a **roster** — the cruise's own player list. Anyone who
plays a game in the cruise joins the roster automatically (matched
by name; a cabin learned later fills in), including mid-game
walk-ups; substitutes brought in through Edit players do not join.
The roster can also be managed by hand on the cruise page (add,
edit, remove — removing someone never changes games already
played). At sign-up inside a cruise (Individuals), the roster
appears as tap-to-pick rows: tap who is playing, leave the no-shows
untapped. On **any** sign-up, *Copy players from another game…*
adds a previous game's players to the list (same-cruise games
first, names already listed skipped), ready to edit before
starting. *Delete cruise* removes the cruise and its roster only —
its games stay, as standalone games. Deeper stats analysis is a
planned later phase; the summary's wins tally is its seed.

**Data:** games, templates, saved setups, cruises and history are stored in
the browser's localStorage on the device. An optional staff account
(Supabase Auth) syncs *custom templates only* across a staffer's
devices. The single exception is the **live player view** (below):
when staff explicitly share a game, a first-names-only snapshot of
that game is published for players — nothing else leaves the device,
and cabins never do.

**Navigation:** the header title is centered, and the ☰ menu's
first item is *Home*. Every screen except Home itself carries one
shared nav row at the top — *← Back* on the left where a meaningful
previous screen exists, *🏠 Home* on the right — so no screen is a
dead end; the play and round-summary screens offer Home only (their
games stay in progress), and the finish screen keeps its own
*Play again* / *Home* buttons.

**☰ Menu (top right):** *Home* · *Account* (the optional staff
account — it lived in the topbar until v2.4.4) · *Install this app* (PWA install prompt, or
Add-to-Home-Screen instructions) · *Share / QR code* (a QR code for
this site's URL, generated on-device by `qr.js` — nothing is fetched —
plus Share / Copy link) · *Join the WhatsApp group* (only shown when
`WHATSAPP_GROUP_URL` is set in `config.js`) · *Send feedback*. The
same feedback form is also behind the **Send feedback** button at the
bottom of the home page. Feedback is written to the Supabase
`feedback` table (insert-only — see below). The menu's **App
version** section shows the running version, checks the published
`version.json` automatically whenever the menu opens (and on demand
via *Check for updates*), and — when a newer version is published —
shows an **⬆ Update now** button that activates any waiting service
worker, clears the offline shell caches, and reloads into the new
build. A failed check (normal on ship Wi-Fi) simply says it can't
check right now.

**Self-healing version guard (v2.1.1).** Pages publishes file by
file and the service worker's cache fills per file, so a phone that
loads the app mid-deploy can cache a *mixed* shell — a new
`index.html` with an older `app.js`, whose buttons then render but do
nothing (this is how v2.1's Home buttons failed on one phone while
the title button, wired by every build, kept working). At startup
the app compares `index.html`'s `<meta name="app-version">` against
its own `APP_VERSION`; on a mismatch (or a missing meta, meaning an
older `index.html`) it clears the `cgsa-shell-*` caches and reloads
once, so the browser refetches a consistent pair. A sessionStorage
flag per version-pair caps it at one heal per session — if the
reload still serves the same mixed pair (offline, cache-only), the
app runs as-is rather than looping, and retries next session. The
reload is safe for the same reason reopening the app is: all games,
drafts and settings are written to localStorage as they change, so
nothing in progress is lost.

**Deleting an in-progress game (v2.1.2).** Every in-progress card —
on the home screen's *In progress* list and on a cruise page's game
list — has a *Delete* button next to *Continue*, using the same
two-step in-app confirm as History delete: the first tap arms
*Confirm delete?* for ~4 seconds, the second tap removes the game.
It deletes only that game (a mistakenly started game no longer has
to be finished or kept); a cruise's roster and all finished games
are untouched, and the list section disappears when its last
in-progress game is deleted.

**Camera measurement (v2.2).** The app can measure real distances
from a photo. Photograph the flat surface where things landed with
a known-size rectangle in the shot, tap the rectangle's 4 corners
to calibrate (a perspective transform — a homography solved in
`engines.js` — undoes the camera angle), then tap any two points
on that surface to read the real distance between them. Reference
presets: a **cornhole board (24″ × 48″)**, a **credit card
(3.37″ × 2.125″)** and **US Letter paper (8.5″ × 11″)**, plus a
custom size. Markers can be dragged to fine-tune a tap, and if the
rectangle was photographed the other way round (a board shot from
its side) the app notices and swaps its width and height. Two
honest limits: both measured points must lie on the **same flat
plane** as the calibration rectangle, and accuracy depends on
careful corner taps — expect about **half an inch** in practice,
not survey-grade precision. The photo lives only in memory while
you measure: it is **never saved** (not to localStorage, not to the
cloud), and leaving the screen discards it. Only numbers persist.

It ships in two places. The **📏 Camera measure** button on the
home screen is a free pocket tape measure: as many point-to-point
measurements as you like on one photo, readouts in feet/inches or
centimetres, nothing kept. And **Closest Wins** is a built-in
Quick Score game scored by distance: on its play screen, *Measure
from a photo* opens the same screen in contest mode — calibrate
once, tap the target, then tap each ball and say whose it is;
*Save distances* writes each entry's distance (inches, 0.1
precision) as their score, and from there the game behaves exactly
like any other Quick Score game — the lowest distance wins. Each row
also has a *Type…* button to enter a distance by hand (feet +
inches) when a photo isn't practical, and Finish stays locked
until at least one distance exists. Closest Wins is Quick
Score-only by design: its setup locks the format, hides the
rounds option, and has no scoring-buttons editor.

**Live player view (v2.3).** The **👥 Player view** button — on the
play screen and the finish screen — shares a game with the players
watching it. *Start sharing* publishes a view-only snapshot of the
game to the Supabase `shared_views` table under an unguessable
12-character code and shows a QR code (drawn on-device, like the
app-share code) plus a link of the form
`…/view.html?c=<code>`. Players open it on their own phones and see
the game's standings, the round or matches being played now, and
what's up next (bracket fixtures keep their "Winner of Semifinal 1"
labels until decided; a results-based round robin says its next
round is paired from the standings when the current one finishes).
The page refreshes itself every 20 seconds, and the snapshot is
re-published — debounced, fire-and-forget — after every scoring
change, when the sheet opens, and when sharing starts. *Stop
sharing* (two-tap confirm) deletes the published view and clears
the code from the game.

Privacy is a hard rule, enforced where the payload is built:
**individuals appear by first name only** (the first word of their
name), **teams appear under their team name and never their member
names**, and **cabin numbers are never published** — the builder
does not read them. The table itself has no direct read policy:
reads go only through the `get_shared_view(code)` database
function, which returns a payload for an exact code that hasn't
expired, so views can't be listed or browsed. Each push rolls the
expiry forward to **24 hours** after that update; a view nobody
updates quietly disappears a day later.

Two honest limits: sharing **needs an internet connection** (the
staff phone publishes, the players' phones load the page) —
scoring itself never does, and a failed push never blocks or
errors the scoring UI; the sheet simply says it couldn't start or
update. And the feature needs its database table: until
`supabase/schema.sql`'s `shared_views` block has been run in the
project, *Start sharing* fails with that same plain "couldn't
start" message instead of pretending to work.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `view.html` | The standalone player page for the live player view (v2.3) — self-contained (inline CSS/JS), reads one shared view by code via the `get_shared_view` database function; deliberately NOT part of the offline shell |
| `engines.js` | Tournament engines (brackets, round robin, Swiss pairing, standings) plus the camera-measurement homography — shared by the page and the tests |
| `qr.js` | QR Code Generator for JavaScript (Kazuhiko Arase, MIT) — draws the share QR code on-device, works offline |
| `config.js` | Supabase URL + anon key for the optional account (blank = accounts off), plus `WHATSAPP_GROUP_URL` for the menu's WhatsApp entry (blank = entry hidden) |
| `version.json` | Published version marker, fetched by the menu's update check |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline shell / installable PWA bits |
| `supabase/schema.sql` | One-time database setup: staff-account templates, feedback, and the live player view's `shared_views` table + `get_shared_view` function |
| `tests/engines.test.mjs` | Engine verification: `node tests/engines.test.mjs` |
| `tests/quick-rounds.test.mjs`, `tests/rr-adds.test.mjs`, `tests/edit-players.test.mjs`, `tests/playoff-field.test.mjs`, `tests/winner-flow.test.mjs`, `tests/setup-features.test.mjs`, `tests/cruises.test.mjs`, `tests/update-check.test.mjs`, `tests/home-flow.test.mjs`, `tests/signup-hint.test.mjs`, `tests/nav.test.mjs`, `tests/version-guard.test.mjs`, `tests/inprogress-delete.test.mjs`, `tests/measure.test.mjs`, `tests/player-view.test.mjs` | End-to-end DOM tests (jsdom) driving the shipped app: `node tests/<name>.test.mjs` |

## Release checklist

Every release bumps **five things together** — if any one is left
behind, the update check and the offline shell disagree about what
"current" means:

1. `APP_VERSION` in `app.js` (the code's single source of truth).
2. The `version` value in `version.json` (what the menu's update
   check fetches).
3. The menu fallback version line in `index.html` (what shows before
   JavaScript runs; the app rewrites it from `APP_VERSION` on load).
4. The service-worker cache name in `sw.js` (`cgsa-shell-vNN`, one
   higher than the previous release).
5. The `<meta name="app-version" content="…">` tag in `index.html`
   (the pair-mate the self-healing version guard compares against
   `APP_VERSION` at startup — see below).

## Hosting (GitHub Pages)

1. Create a **public** repository named `cruise-game-scoring` and push
   these files to its `main` branch (site files at the repo root).
2. In the repo: **Settings → Pages → Deploy from a branch → main / (root)**.
3. The app is then live at `https://<account>.github.io/cruise-game-scoring/`.

## Enabling the optional staff account (Supabase)

Accounts are optional and the app works without them. To switch them on:

1. At [supabase.com](https://supabase.com), create a **new project**
   (any name, e.g. `cruise-game-scoring`).
2. In the project, open **SQL Editor**, paste in `supabase/schema.sql`,
   and run it. That creates the `templates` table with owner-only
   Row Level Security, **and the `feedback` table** (insert-only:
   anyone can send feedback from the app, nobody can read it back
   through the API — read submissions in the Supabase Table editor).
   Feedback needs that table: if it hasn't been created yet, the
   app's feedback form reports that the message couldn't be sent
   instead of pretending it worked. The same script also creates
   the **`shared_views` table** and the **`get_shared_view`
   function** for the live player view (v2.3) — code-targeted
   anonymous writes, reads only through the function, 24-hour
   rolling expiry. Player view needs them just like feedback needs
   its table: until the script has been run, *Start sharing* in
   the app reports that it couldn't start.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key (never the service_role key).
4. Paste both into `config.js` in this repo and commit.
5. Optional: under **Authentication → Providers → Email**, decide
   whether new accounts must confirm their email before signing in.

After that, the **Account** item in the app's ☰ menu offers sign-in/sign-up,
and a signed-in staffer's custom templates sync across their devices.
