# המורה — Hamore App

An app for driving instructors to manage students, lessons, payments and tests.
Expo (React Native) app with a Supabase backend (Postgres + Auth).

## First-time setup

You need Node.js and **Docker Desktop** (running) for the local database.

```bash
npm install
npm run db:start          # starts Supabase locally in Docker (first run downloads images)
```

`db:start` prints the local URLs and keys. Copy `.env.example` to `.env.local` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL` — the **API URL** (`http://127.0.0.1:54321`)
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the **Publishable** key
- `SUPABASE_SECRET_KEY` — the **Secret** key (only used by the seed script, never by the app)

Run `npx supabase status` any time to see them again.

> Testing on a phone with Expo Go? `127.0.0.1` on the phone is the phone itself.
> Use your computer's Wi-Fi IP instead, e.g. `http://192.168.1.20:54321`.

Then add the sample data and start the app:

```bash
npm run seed:dev          # sample teacher, student, 8 students, calendar, lessons and payments
npm start
```

Sample sign-in: `israel@example.com` / `123456` (teacher), `dana@example.com` / `123456` (student).
Development builds show a button on the sign-in screen that fills these in.

## Database

| Command | What it does |
| --- | --- |
| `npm run db:start` / `db:stop` | Start or stop local Supabase |
| `npm run db:reset` | Wipe the local database and re-run all migrations (then `seed:dev` again) |
| `npm run db:test` | Run the database tests in `supabase/tests` (security, calendar, balances) |

Supabase Studio (a table viewer) runs at http://127.0.0.1:54323 while the database is up.

- Schema changes go in a new file in `supabase/migrations/` — never edit one that has already run.
  `npx supabase migration new <name>` creates it.
- Every table has row-level security: a teacher can only read and change their own organization's
  data. `supabase/tests/database/rls.test.sql` and `lessons.test.sql` prove it; add checks for every new table.
- Balances and lesson counts are never stored. The `student_balances` view calculates them:
  opening balance + payments − price of booked lessons that have ended.
- When a user signs up, the database creates their profile. For a teacher it also creates an
  organization and the default lesson types.

### Moving to the hosted project later

Create the Supabase project in an **EU region**, then:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push      # applies the same migrations
```

and put the hosted URL and publishable key in `.env.local`. Hosted projects require email
confirmation on sign-up by default; the app handles that with a "check your email" message.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run db:test
```
