// Creates sample accounts and students in your LOCAL Supabase, for development.
//   npm run seed:dev
// Needs .env.local with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// and SUPABASE_SECRET_KEY (from `npx supabase status`). Safe to run more than once.
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error('Missing values in .env.local. See .env.example.');
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.)/.test(url)) {
  console.error(`Refusing to seed ${url}: this script is for a local Supabase only.`);
  process.exit(1);
}

const PASSWORD = '123456';

const ACCOUNTS = [
  {
    email: 'israel@example.com',
    metadata: {
      role: 'teacher',
      first_name: 'ישראל',
      last_name: 'ישראלי',
      phone: '050-9876543',
      driver_license_number: '7654321',
      teacher_license_number: '123456',
    },
  },
  {
    email: 'dana@example.com',
    metadata: { role: 'student', first_name: 'דנה', last_name: 'כהן', phone: '050-1234567' },
  },
];

const TEACHER_DETAILS = {
  city: 'תל אביב',
  teaching_categories: ['B', 'A2', 'A1'],
  car_model: 'מאזדה 3',
  transmission: 'automatic',
  lesson_price: 160,
  lesson_duration_min: 40,
};

const STUDENTS = [
  ['דנה', 'כהן', '050-1234567', 'B', 'automatic', 2, 300, [
    'שיעור שני. לתרגל התחלת נסיעה ועצירה חלקה, ולשים לב למראות לפני יציאה מהחניה.',
    'שיעור ראשון, היכרות עם הרכב. לחזור על תפעול האיתות והמגבים.',
  ]],
  ['יוסי', 'לוי', '052-2345678', 'B', 'manual', 14, 0, [
    'שליטה טובה במצמד. לשפר עצירה והתחלת נסיעה בעלייה בלי להידרדר אחורה.',
    'כניסה לכיכרות – לזכור לתת זכות קדימה ולאותת ביציאה.',
  ]],
  ['נועה', 'מזרחי', '054-3456789', 'B', 'automatic', 22, 150, [
    'מוכנה כמעט לטסט. לתרגל חניה במקביל ונסיעה בכביש מהיר עם שמירת מרחק.',
  ]],
  ['אבי', 'פרץ', '053-4567890', 'A2', 'manual', 9, -450, [
    'נסיעה איטית ושמירת שיווי משקל במגרש טובה. לעבוד על בלימה בפנייה.',
  ]],
  ['מיכל', 'אברהם', '058-5678901', 'B', 'automatic', 6, 0, [
    'לשפר מיקום בנתיב בפניות שמאלה ולשים לב להולכי רגל במעברי חצייה.',
  ]],
  ['עומר', 'ביטון', '050-6789012', 'C1', 'manual', 17, 200, [
    'נסיעה לאחור עם מראות בלבד – התקדמות יפה. לתרגל פניות חדות עם רכב ארוך.',
  ]],
  ['שירה', 'גולן', '052-7890123', 'B', 'automatic', 0, 0, []],
  ['רון', 'דהן', '054-8901234', 'A1', 'manual', 11, -150, [
    'לשפר הסתכלות למרחק ותכנון נתיב בכביש בין-עירוני.',
  ]],
];

const admin = createClient(url, secretKey, { auth: { persistSession: false } });

for (const account of ACCOUNTS) {
  const { error } = await admin.auth.admin.createUser({
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: account.metadata,
  });
  if (error && !/already/i.test(error.message)) throw error;
  console.log(error ? `exists   ${account.email}` : `created  ${account.email}`);
}

// Add the students as the teacher, through row-level security, like the app does.
const teacher = createClient(url, publishableKey, { auth: { persistSession: false } });
const signIn = await teacher.auth.signInWithPassword({ email: ACCOUNTS[0].email, password: PASSWORD });
if (signIn.error) throw signIn.error;

const profile = await teacher.from('profiles').update(TEACHER_DETAILS).eq('id', signIn.data.user.id);
if (profile.error) throw profile.error;

const existing = await teacher.from('students').select('phone');
if (existing.error) throw existing.error;
const known = new Set(existing.data.map((s) => s.phone));

let added = 0;
for (const [first, last, phone, category, transmission, lessons, balance, notes] of STUDENTS) {
  if (known.has(phone)) continue;
  const { data, error } = await teacher
    .from('students')
    .insert({
      first_name: first,
      last_name: last,
      phone,
      license_category: category,
      transmission,
      theory_passed: lessons > 0,
      prior_lessons: lessons,
      opening_balance: balance,
    })
    .select('id')
    .single();
  if (error) throw error;
  // Oldest note first, so the newest ends up on top.
  for (const body of [...notes].reverse()) {
    const note = await teacher.from('lesson_notes').insert({ student_id: data.id, body });
    if (note.error) throw note.error;
  }
  added += 1;
}

console.log(`students added: ${added} (already there: ${known.size})`);

// Calendar, past lessons and payments --------------------------------------
// Each student with lessons gets two past lessons and a payment that covers them,
// so their balance stays at the opening balance above, with real history behind it.

const lessonCount = await teacher.from('lessons').select('id', { count: 'exact', head: true });
if (lessonCount.error) throw lessonCount.error;

if (lessonCount.count > 0) {
  console.log('calendar: already seeded');
} else {
  const types = await teacher.from('lesson_types').select('id, name, duration_min').order('sort_order');
  if (types.error) throw types.error;
  const regular = types.data[0];

  const all = await teacher.from('students').select('id, phone, prior_lessons');
  if (all.error) throw all.error;
  const byPhone = new Map(all.data.map((s) => [s.phone, s]));

  /** A local date `days` from today at hh:mm, as an ISO timestamp. */
  const at = (days, time, plusMin = 0) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m + plusMin, 0, 0);
    return d.toISOString();
  };
  const lesson = (phone, days, time, status, awaiting = null) => ({
    student_id: byPhone.get(phone).id,
    lesson_type_id: regular.id,
    starts_at: at(days, time),
    ends_at: at(days, time, regular.duration_min),
    status,
    awaiting,
  });

  const slots = await teacher.from('availability_slots').insert([
    { starts_at: at(1, '09:00'), ends_at: at(1, '12:30') },
    { starts_at: at(1, '16:00'), ends_at: at(1, '19:00') },
    { starts_at: at(2, '14:00'), ends_at: at(2, '18:00') },
    { starts_at: at(3, '09:30'), ends_at: at(3, '12:00') },
    { starts_at: at(4, '15:00'), ends_at: at(4, '18:30') },
  ]);
  if (slots.error) throw slots.error;

  const upcoming = await teacher.from('lessons').insert([
    lesson('052-2345678', 1, '17:00', 'booked'),
    lesson('050-1234567', 2, '16:30', 'pending', 'teacher'),
    lesson('058-5678901', 3, '10:00', 'booked'),
    lesson('052-7890123', 4, '15:15', 'pending', 'student'),
  ]);
  if (upcoming.error) throw upcoming.error;

  let pastLessons = 0;
  for (const [index, student] of all.data.entries()) {
    if (student.prior_lessons === 0) continue;
    // One hour per student, so a teacher's lessons never overlap.
    const time = `${String(8 + index).padStart(2, '0')}:00`;
    const past = await teacher
      .from('lessons')
      .insert([lesson(student.phone, -7, time, 'booked'), lesson(student.phone, -3, time, 'booked')])
      .select('price');
    if (past.error) throw past.error;
    const cost = past.data.reduce((sum, row) => sum + row.price, 0);
    if (cost > 0) {
      const paid = await teacher
        .from('payments')
        .insert({ student_id: student.id, amount: cost, method: 'bit', paid_at: at(-3, '09:00') });
      if (paid.error) throw paid.error;
    }
    pastLessons += 2;
  }
  console.log(`calendar: 5 open-time blocks, 4 upcoming lessons, ${pastLessons} past lessons with payments`);
}
console.log(`Sign in with israel@example.com / ${PASSWORD} (teacher) or dana@example.com (student).`);
