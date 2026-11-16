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
codes so a whole activity team can run identical setups.

**Data:** games, templates and history are stored in the browser's
localStorage on the device. Nothing about players or games leaves the
device. An optional staff account (Supabase Auth) syncs *custom
templates only* across a staffer's devices.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `engines.js` | Tournament engines (brackets, round robin, Swiss pairing, standings) — shared by the page and the tests |
| `config.js` | Supabase URL + anon key for the optional account (blank = accounts off) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline shell / installable PWA bits |
| `supabase/schema.sql` | One-time database setup for the optional account |
| `tests/engines.test.mjs` | Engine verification: `node tests/engines.test.mjs` |

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
   Row Level Security.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key (never the service_role key).
4. Paste both into `config.js` in this repo and commit.
5. Optional: under **Authentication → Providers → Email**, decide
   whether new accounts must confirm their email before signing in.

After that, the **Account** button in the app offers sign-in/sign-up,
and a signed-in staffer's custom templates sync across their devices.
