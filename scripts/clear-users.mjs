// Deletes ALL users and everything that belongs to them: accounts, profiles,
// organizations, students, lessons, lesson notes, payments, open-time blocks and lesson types.
// The tables, security rules and migrations stay, so the app keeps working with a clean sheet.
//
//   npm run db:clear-users -- --local          shows what would be deleted in the local Supabase
//   npm run db:clear-users -- --local --yes    deletes it
//   npm run db:clear-users                     same for the hosted project (shows only)
//   npm run db:clear-users -- --yes            deletes everything in the HOSTED project
//
// Local: the key is read from `npx supabase status`, so Docker must be running.
// Hosted: needs SUPABASE_HOSTED_SECRET_KEY in .env.local (Supabase dashboard → Project Settings →
// API Keys → Secret key). That key can do anything; never commit it or give it an EXPO_PUBLIC_ name.
//
// The same steps as SQL, for the Supabase SQL editor: supabase/snippets/clear-users.sql
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const confirmed = args.has('--yes');

function localTarget() {
  let status;
  try {
    const output = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    status = JSON.parse(output.slice(output.indexOf('{')));
  } catch {
    console.error('Could not read the local Supabase. Is Docker running? Try `npm run db:start`.');
    process.exit(1);
  }
  return { url: status.API_URL, key: status.SECRET_KEY, label: 'LOCAL Supabase' };
}

function hostedTarget() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_HOSTED_SECRET_KEY;
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co/.test(url)) {
    console.error(`EXPO_PUBLIC_SUPABASE_URL in .env.local is not a hosted project (${url ?? 'missing'}).`);
    console.error('For the local Supabase, add --local.');
    process.exit(1);
  }
  if (!key) {
    console.error('Missing SUPABASE_HOSTED_SECRET_KEY in .env.local.');
    console.error('Copy it from the Supabase dashboard → Project Settings → API Keys → Secret key.');
    process.exit(1);
  }
  return { url, key, label: `HOSTED project ${new URL(url).hostname.split('.')[0]}` };
}

const target = local ? localTarget() : hostedTarget();
const admin = createClient(target.url, target.key, { auth: { persistSession: false } });

// Children before parents: lessons point at lesson types, and a teacher's profile must always
// have an organization, so the accounts go before the organizations.
const DATA_TABLES = ['lessons', 'payments', 'lesson_notes', 'availability_slots', 'students', 'lesson_types'];

async function count(table) {
  const { count: rows, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows ?? 0;
}

async function listUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

console.log(`Target: ${target.label} (${target.url})\n`);

const users = await listUsers();
console.log(`accounts: ${users.length}`);
for (const user of users) console.log(`  - ${user.email ?? user.id}`);
for (const table of [...DATA_TABLES, 'profiles', 'organizations']) {
  console.log(`${table}: ${await count(table)}`);
}

if (!confirmed) {
  console.log('\nNothing was deleted. Run again with --yes to delete all of the above.');
  process.exit(0);
}

console.log('\nDeleting…');
for (const table of DATA_TABLES) {
  const { error } = await admin.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);
}
// Deleting an account also deletes its profile.
for (const user of users) {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`${user.email}: ${error.message}`);
}
const { error: orgError } = await admin.from('organizations').delete().not('id', 'is', null);
if (orgError) throw new Error(`organizations: ${orgError.message}`);

console.log(`\nDone. accounts: ${(await listUsers()).length}`);
for (const table of [...DATA_TABLES, 'profiles', 'organizations']) {
  console.log(`${table}: ${await count(table)}`);
}
