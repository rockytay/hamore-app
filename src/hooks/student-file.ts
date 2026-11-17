/**
 * The student file ("כרטיס תלמיד"): types, Hebrew labels and the automatic calculations
 * (age eligibility, expiry alerts, stage). Shared by the teacher and student sides.
 * The database side is supabase/migrations/20261117120000_student_file.sql.
 */
import type { LicenseCategory, PaymentMethod } from '@/hooks/use-students';

// ---------------------------------------------------------------------------
// The student's own details (on their account)
// ---------------------------------------------------------------------------

export type Language = 'he' | 'ar' | 'ru' | 'en';

export const LANGUAGE_LABELS: Record<Language, string> = {
  he: 'עברית',
  ar: 'العربية',
  ru: 'Русский',
  en: 'English',
};

export type ReminderChannel = 'push' | 'sms' | 'whatsapp';

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  push: 'התראה באפליקציה',
  sms: 'SMS',
  whatsapp: 'וואטסאפ',
};

export type Address = {
  id: string;
  label: string;
  street: string;
  houseNumber: string;
  city: string;
  pickupNotes: string;
  isDefault: boolean;
};

export type ContactKind = 'parent' | 'emergency';

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  parent: 'הורה',
  emergency: 'איש קשר לחירום',
};

export type Contact = {
  id: string;
  kind: ContactKind;
  name: string;
  phone: string;
  relation: string;
  isPayer: boolean;
};

/** A weekly time the student can usually take lessons. Minutes from midnight. */
export type AvailabilityWindow = { id: string; weekday: number; startMin: number; endMin: number };

export const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** What the student fills in about themselves. Teachers of the student can read and correct it. */
export type StudentPersonal = {
  profileId: string;
  email: string;
  birthDate: Date | null;
  /** The ID number the student entered on their account. Required at sign-up. */
  idNumber: string | null;
  language: Language;
  reminderChannel: ReminderChannel;
  reminderHoursBefore: number;
  addresses: Address[];
  contacts: Contact[];
  availability: AvailabilityWindow[];
};

// ---------------------------------------------------------------------------
// The teacher's file
// ---------------------------------------------------------------------------

export type StudentStatus = 'active' | 'frozen';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'פעיל/ה',
  frozen: 'מוקפא/ת',
};

export type PriorLicense = 'none' | 'add_category' | 'conversion' | 'foreign' | 'renewal';

export const PRIOR_LICENSE_LABELS: Record<PriorLicense, string> = {
  none: 'נהג/ת חדש/ה',
  add_category: 'הוספת דרגה',
  conversion: 'המרה',
  foreign: 'רישיון זר',
  renewal: 'חידוש לאחר פקיעה',
};

export type PaymentPlan = 'per_lesson' | 'package' | 'contract' | 'deposit';

export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  per_lesson: 'לפי שיעור',
  package: 'חבילה',
  contract: 'קבלנות',
  deposit: 'מקדמה',
};

export type Payer = 'student' | 'parent';

export const PAYER_LABELS: Record<Payer, string> = {
  student: 'התלמיד/ה',
  parent: 'הורה',
};

export type ReferralSource = 'recommendation' | 'instagram' | 'facebook' | 'google' | 'other';

export const REFERRAL_LABELS: Record<ReferralSource, string> = {
  recommendation: 'המלצה',
  instagram: 'אינסטגרם',
  facebook: 'פייסבוק',
  google: 'גוגל',
  other: 'אחר',
};

/** Columns of public.students that make up the teacher's file. */
export type StudentFile = {
  status: StudentStatus;
  greenFormIssuedAt: Date | null;
  eyeTestDone: boolean;
  needsGlasses: boolean;
  healthDeclarationDone: boolean;
  theoryPassed: boolean;
  theoryPassedAt: Date | null;
  priorLicense: PriorLicense;
  /** 1–5, the teacher's own rating. Never shown to the student. */
  testReadiness: number | null;
  paymentPlan: PaymentPlan;
  paymentPlanNote: string;
  preferredPaymentMethod: PaymentMethod | null;
  payer: Payer;
  cancellationNoticeHours: number;
  referralSource: ReferralSource | null;
};

export type FileRow = {
  status: StudentStatus;
  green_form_issued_at: string | null;
  eye_test_done: boolean;
  needs_glasses: boolean;
  health_declaration_done: boolean;
  theory_passed: boolean;
  theory_passed_at: string | null;
  prior_license: PriorLicense;
  test_readiness: number | null;
  payment_plan: PaymentPlan;
  payment_plan_note: string;
  preferred_payment_method: PaymentMethod | null;
  payer: Payer;
  cancellation_notice_hours: number;
  referral_source: ReferralSource | null;
};

export const FILE_COLUMNS =
  'status, green_form_issued_at, eye_test_done, needs_glasses, health_declaration_done, theory_passed, ' +
  'theory_passed_at, prior_license, test_readiness, payment_plan, payment_plan_note, ' +
  'preferred_payment_method, payer, cancellation_notice_hours, referral_source';

export function toFile(row: FileRow): StudentFile {
  return {
    status: row.status,
    greenFormIssuedAt: parseDay(row.green_form_issued_at),
    eyeTestDone: row.eye_test_done,
    needsGlasses: row.needs_glasses,
    healthDeclarationDone: row.health_declaration_done,
    theoryPassed: row.theory_passed,
    theoryPassedAt: parseDay(row.theory_passed_at),
    priorLicense: row.prior_license,
    testReadiness: row.test_readiness,
    paymentPlan: row.payment_plan,
    paymentPlanNote: row.payment_plan_note,
    preferredPaymentMethod: row.preferred_payment_method,
    payer: row.payer,
    cancellationNoticeHours: row.cancellation_notice_hours,
    referralSource: row.referral_source,
  };
}

/** The file fields as database columns, for an update. */
export function toFileColumns(changes: Partial<StudentFile>) {
  const columns: Record<string, unknown> = {};
  const set = (key: keyof StudentFile, column: string, value: unknown) => {
    if (changes[key] !== undefined) columns[column] = value;
  };
  set('status', 'status', changes.status);
  set('greenFormIssuedAt', 'green_form_issued_at', toDayString(changes.greenFormIssuedAt ?? null));
  set('eyeTestDone', 'eye_test_done', changes.eyeTestDone);
  set('needsGlasses', 'needs_glasses', changes.needsGlasses);
  set('healthDeclarationDone', 'health_declaration_done', changes.healthDeclarationDone);
  set('theoryPassed', 'theory_passed', changes.theoryPassed);
  set('theoryPassedAt', 'theory_passed_at', toDayString(changes.theoryPassedAt ?? null));
  set('priorLicense', 'prior_license', changes.priorLicense);
  set('testReadiness', 'test_readiness', changes.testReadiness);
  set('paymentPlan', 'payment_plan', changes.paymentPlan);
  set('paymentPlanNote', 'payment_plan_note', changes.paymentPlanNote);
  set('preferredPaymentMethod', 'preferred_payment_method', changes.preferredPaymentMethod);
  set('payer', 'payer', changes.payer);
  set('cancellationNoticeHours', 'cancellation_notice_hours', changes.cancellationNoticeHours);
  set('referralSource', 'referral_source', changes.referralSource);
  return columns;
}

// ---------------------------------------------------------------------------
// Tests and driving tasks
// ---------------------------------------------------------------------------

export type TestKind = 'internal' | 'practical';

export const TEST_KIND_LABELS: Record<TestKind, string> = {
  internal: 'טסט פנימי',
  practical: 'טסט מעשי',
};

export type TestResult = 'scheduled' | 'passed' | 'failed' | 'cancelled';

export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  scheduled: 'נקבע',
  passed: 'עבר/ה',
  failed: 'נכשל/ה',
  cancelled: 'בוטל',
};

export type StudentTest = {
  id: string;
  kind: TestKind;
  scheduledAt: Date;
  location: string;
  attempt: number;
  result: TestResult;
  feePaid: boolean;
  feeReference: string;
  /** In shekels: what the teacher charges for the car on test day. */
  vehicleFee: number | null;
  failureReasons: string;
  notes: string;
};

export type TestRow = {
  id: string;
  kind: TestKind;
  scheduled_at: string;
  location: string;
  attempt: number;
  result: TestResult;
  fee_paid: boolean;
  fee_reference: string;
  vehicle_fee: number | null;
  failure_reasons: string;
  notes: string;
};

export const TEST_COLUMNS =
  'id, kind, scheduled_at, location, attempt, result, fee_paid, fee_reference, vehicle_fee, failure_reasons, notes';

export function toTest(row: TestRow): StudentTest {
  return {
    id: row.id,
    kind: row.kind,
    scheduledAt: new Date(row.scheduled_at),
    location: row.location,
    attempt: row.attempt,
    result: row.result,
    feePaid: row.fee_paid,
    feeReference: row.fee_reference,
    vehicleFee: row.vehicle_fee,
    failureReasons: row.failure_reasons,
    notes: row.notes,
  };
}

export function toTestColumns(test: Omit<StudentTest, 'id'>) {
  return {
    kind: test.kind,
    scheduled_at: test.scheduledAt.toISOString(),
    location: test.location.trim(),
    attempt: test.attempt,
    result: test.result,
    fee_paid: test.feePaid,
    fee_reference: test.feeReference.trim(),
    vehicle_fee: test.vehicleFee,
    failure_reasons: test.failureReasons.trim(),
    notes: test.notes.trim(),
  };
}

/** One of the official "כרטיס תלמיד" tasks. `code` is stage.chapter.task, for example 1.3.5. */
export type DrivingTask = { id: number; stage: number; chapter: number; code: string; title: string };

export type TaskStatus = 'not_started' | 'practicing' | 'mastered' | 'not_relevant';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'לא תורגל',
  practicing: 'בתרגול',
  mastered: 'שולט',
  not_relevant: 'לא רלוונטי',
};

export const TASK_STAGE_LABELS: Record<number, string> = {
  1: 'שלב א · תפעול הרכב',
  2: 'שלב ב · הדרך',
  3: 'שלב ג · התנועה',
  4: 'שלב ד · משימות נהיגה מיוחדות',
};

const HEBREW_ORDINALS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

export function formatChapter(chapter: number) {
  return `פרק ${HEBREW_ORDINALS[chapter - 1] ?? chapter}`;
}

/** Task id → status. Tasks that are missing are not practised yet. */
export type TaskProgress = Record<number, Exclude<TaskStatus, 'not_started'>>;

export type StageTasks = { stage: number; tasks: DrivingTask[]; mastered: number; relevant: number };

/**
 * The tasks grouped by stage, with how many are mastered out of those that apply to this
 * student (tasks marked "not relevant", such as clutch tasks in an automatic, don't count).
 */
export function groupTasksByStage(tasks: DrivingTask[], progress: TaskProgress): StageTasks[] {
  const stages = new Map<number, DrivingTask[]>();
  for (const task of tasks) stages.set(task.stage, [...(stages.get(task.stage) ?? []), task]);
  return [...stages.entries()].map(([stage, stageTasks]) => ({
    stage,
    tasks: stageTasks,
    mastered: stageTasks.filter((task) => progress[task.id] === 'mastered').length,
    relevant: stageTasks.filter((task) => progress[task.id] !== 'not_relevant').length,
  }));
}

export type SpecialLessonKind = 'night' | 'highway' | 'rain';

export const SPECIAL_LESSON_LABELS: Record<SpecialLessonKind, string> = {
  night: 'נהיגת לילה',
  highway: 'כביש מהיר / בין־עירוני',
  rain: 'נהיגה בגשם',
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** A database date ("2026-11-17") as a local date, without a time zone shift. */
export function parseDay(value: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A local date as a database date ("2026-11-17"). */
export function toDayString(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Typed as DD/MM/YYYY (or with dots / dashes) → a date, or null if it isn't a real date. */
export function parseTypedDate(text: string): Date | null {
  const match = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** A date as DD/MM/YYYY, for date inputs. */
export function formatTypedDate(date: Date | null) {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number) {
  return addMonths(date, years * 12);
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Full years of age on `now`. */
export function getAge(birthDate: Date, now = new Date()) {
  let age = now.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** e.g. "17 ו־4 חודשים" */
export function formatAge(birthDate: Date, now = new Date()) {
  const years = getAge(birthDate, now);
  let months = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) months -= 1;
  months = (months + 12) % 12;
  return months === 0 ? `${years}` : `${years} ו־${months} חודשים`;
}

/**
 * Appeals on a failed practical test are allowed within 7 business days.
 * Business days in Israel: Sunday to Thursday.
 */
export function getAppealDeadline(testDate: Date) {
  const deadline = startOfDay(testDate);
  let left = 7;
  while (left > 0) {
    deadline.setDate(deadline.getDate() + 1);
    const weekday = deadline.getDay();
    if (weekday !== 5 && weekday !== 6) left -= 1;
  }
  return deadline;
}

/** Shows only the last 4 digits of an ID number. */
export function maskIdNumber(id: string) {
  return id.length <= 4 ? id : `${'•'.repeat(id.length - 4)}${id.slice(-4)}`;
}

/** e.g. 16:30 from minutes since midnight. */
export function formatMinutes(minutes: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "16:30" → 990, or null. */
export function parseMinutes(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** "הרצל 10, חיפה" */
export function formatAddress(address: Pick<Address, 'street' | 'houseNumber' | 'city'>) {
  return `${address.street} ${address.houseNumber}`.trim() + `, ${address.city}`;
}

/** Opens navigation to the address (Waze if installed, else maps in the browser). */
export function getNavigationUrl(address: Address) {
  return `https://waze.com/ul?q=${encodeURIComponent(formatAddress(address))}&navigate=yes`;
}

// ---------------------------------------------------------------------------
// Automatic calculations
// ---------------------------------------------------------------------------

/**
 * Age rules for a private car (licence B), in months. Verified 17.11.2026 against the
 * Ministry of Education (traffic education) and gov.il: theory 15y6m, lessons 16y6m,
 * practical test and licence 16y9m (older sources saying 17 are out of date).
 */
export const AGE_RULES_B = {
  theoryMonths: 15 * 12 + 6,
  lessonsMonths: 16 * 12 + 6,
  testMonths: 16 * 12 + 9,
};

/** The minimum number of lessons before a test, licence B. */
export const MIN_LESSONS_B = 28;

/** How long before an expiry date to start warning. */
const EXPIRY_WARNING_DAYS = 60;

export type Eligibility = { label: string; from: Date; reached: boolean };

/** When the student may start theory, lessons and the test (licence B only). */
export function getEligibility(birthDate: Date | null, category: LicenseCategory, now = new Date()) {
  if (!birthDate || category !== 'B') return [];
  const at = (months: number) => addMonths(birthDate, months);
  return [
    { label: 'מבחן תאוריה', from: at(AGE_RULES_B.theoryMonths) },
    { label: 'שיעורי נהיגה', from: at(AGE_RULES_B.lessonsMonths) },
    { label: 'טסט מעשי', from: at(AGE_RULES_B.testMonths) },
  ].map((rule) => ({ ...rule, reached: rule.from <= now }));
}

export type Stage = 'waiting_green_form' | 'learning' | 'ready_for_test' | 'test_scheduled' | 'passed';

export const STAGE_LABELS: Record<Stage, string> = {
  waiting_green_form: 'ממתין/ה לטופס ירוק',
  learning: 'לומד/ת',
  ready_for_test: 'עבר/ה טסט פנימי',
  test_scheduled: 'טסט נקבע',
  passed: 'עבר/ה טסט 🎉',
};

export const STAGES = Object.keys(STAGE_LABELS) as Stage[];

/** Where the student is on the way to the licence, worked out from the file and the tests. */
export function getStage(file: StudentFile, tests: StudentTest[], now = new Date()): Stage {
  const practical = tests.filter((test) => test.kind === 'practical');
  if (practical.some((test) => test.result === 'passed')) return 'passed';
  if (practical.some((test) => test.result === 'scheduled' && test.scheduledAt > now)) return 'test_scheduled';
  if (tests.some((test) => test.kind === 'internal' && test.result === 'passed')) return 'ready_for_test';
  if (!file.greenFormIssuedAt) return 'waiting_green_form';
  return 'learning';
}

export type ValiditySettings = { greenFormValidYears: number; theoryValidYears: number };

/** gov.il: the medical declaration (green form) and a passed theory test are both valid 5 years. */
export const DEFAULT_VALIDITY: ValiditySettings = { greenFormValidYears: 5, theoryValidYears: 5 };

export type FileAlert = {
  id: string;
  tone: 'action' | 'warning' | 'info';
  title: string;
  body?: string;
};

export type AlertInput = {
  file: StudentFile;
  tests: StudentTest[];
  birthDate: Date | null;
  contacts: Contact[];
  /** The student has a default pickup address. */
  hasAddress: boolean;
  hasIdNumber: boolean;
  licenseCategory: LicenseCategory;
  lessonsCompleted: number;
  validity: ValiditySettings;
  /** Wording: the teacher reads about the student, the student about themselves. */
  audience: 'teacher' | 'student';
};

/** Expiry dates, missing details and upcoming tests that need attention. */
export function getFileAlerts(input: AlertInput, now = new Date()): FileAlert[] {
  const { file, tests, birthDate, contacts, hasAddress, hasIdNumber, licenseCategory, lessonsCompleted, validity, audience } =
    input;
  const forStudent = audience === 'student';
  const alerts: FileAlert[] = [];

  const expiry = (id: string, name: string, issued: Date | null, years: number) => {
    if (!issued) return;
    const expires = addYears(issued, years);
    const days = daysBetween(now, expires);
    if (days < 0) {
      alerts.push({
        id,
        tone: 'warning',
        title: `תוקף ה${name} פג`,
        body: `פג ב־${expires.toLocaleDateString('he-IL')}. יש לחדש לפני הטסט.`,
      });
    } else if (days <= EXPIRY_WARNING_DAYS) {
      alerts.push({
        id,
        tone: 'warning',
        title: `תוקף ה${name} עומד לפוג`,
        body: `בתוקף עד ${expires.toLocaleDateString('he-IL')} (עוד ${days} ימים).`,
      });
    }
  };

  if (!file.greenFormIssuedAt) {
    alerts.push({
      id: 'green-form-missing',
      tone: 'action',
      title: 'עדיין אין טופס ירוק',
      body: forStudent
        ? 'כדי להתחיל לנהוג צריך טופס ירוק: בדיקת ראייה והצהרת בריאות, ואז הנפקה במשרד הרישוי.'
        : 'לסמן בתיק אחרי שהתלמיד/ה מנפיק/ה את הטופס.',
    });
  }
  expiry('green-form-expiry', 'טופס הירוק', file.greenFormIssuedAt, validity.greenFormValidYears);
  if (file.theoryPassed) {
    expiry('theory-expiry', 'מבחן התאוריה', file.theoryPassedAt, validity.theoryValidYears);
  }

  if (birthDate && getAge(birthDate, now) < 18 && !contacts.some((contact) => contact.kind === 'parent')) {
    alerts.push({
      id: 'parent-missing',
      tone: 'action',
      title: 'חסר איש קשר הורה',
      body: forStudent
        ? 'מתחת לגיל 18 צריך להוסיף פרטי הורה. אפשר להוסיף בלשונית הפרופיל.'
        : 'התלמיד/ה מתחת לגיל 18. יש להוסיף פרטי הורה.',
    });
  }
  if (!hasIdNumber) {
    alerts.push({
      id: 'id-number-missing',
      tone: 'action',
      title: 'חסר מספר תעודת זהות',
      body: forStudent
        ? 'נדרש לרישום לטסט. אפשר להוסיף בלשונית הפרופיל.'
        : 'נדרש לרישום לטסט במשרד התחבורה.',
    });
  }
  if (!hasAddress) {
    alerts.push({
      id: 'address-missing',
      tone: 'action',
      title: 'חסרה כתובת איסוף',
      body: forStudent ? 'כדי שהמורה ידע מאיפה לאסוף אותך. אפשר להוסיף בלשונית הפרופיל.' : 'אפשר להוסיף בפרטים האישיים.',
    });
  }
  if (!birthDate && !forStudent) {
    alerts.push({ id: 'birth-date-missing', tone: 'info', title: 'חסר תאריך לידה', body: 'נדרש לחישוב זכאות גיל.' });
  }

  if (licenseCategory === 'B' && lessonsCompleted >= MIN_LESSONS_B && !forStudent) {
    const passedInternal = tests.some((test) => test.kind === 'internal' && test.result === 'passed');
    if (!passedInternal) {
      alerts.push({
        id: 'min-lessons',
        tone: 'info',
        title: `הגיע/ה ל־${MIN_LESSONS_B} שיעורים`,
        body: 'אפשר לשקול טסט פנימי.',
      });
    }
  }

  for (const test of tests) {
    const days = daysBetween(now, test.scheduledAt);
    if (test.result === 'scheduled' && test.scheduledAt > now && days <= 14) {
      const when = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;
      const missingFee = test.kind === 'practical' && !test.feePaid;
      alerts.push({
        id: `test-${test.id}`,
        tone: missingFee ? 'warning' : 'info',
        title: `${TEST_KIND_LABELS[test.kind]} ${when}`,
        body:
          test.kind === 'practical'
            ? [
                missingFee ? 'אגרת הטסט עדיין לא שולמה.' : null,
                forStudent ? 'להביא ביום הטסט: תעודת זהות ואישור תשלום אגרה.' : null,
                test.location ? `מקום: ${test.location}` : null,
              ]
                .filter(Boolean)
                .join(' ')
            : test.location || undefined,
      });
    }
    if (test.kind === 'practical' && test.result === 'failed') {
      const deadline = getAppealDeadline(test.scheduledAt);
      if (deadline >= startOfDay(now)) {
        alerts.push({
          id: `appeal-${test.id}`,
          tone: 'info',
          title: 'אפשר לערער על הטסט',
          body: `הערעור אפשרי עד ${deadline.toLocaleDateString('he-IL')} (7 ימי עסקים).`,
        });
      }
    }
  }

  return alerts;
}
