import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  DEFAULT_VALIDITY,
  FILE_COLUMNS,
  getFileAlerts,
  TEST_COLUMNS,
  toFile,
  toTest,
  type FileRow,
  type SpecialLessonKind,
  type StudentFile,
  type StudentPersonal,
  type StudentTest,
  type TaskProgress,
  type TaskStatus,
  type TestRow,
  type ValiditySettings,
} from '@/hooks/student-file';
import { fetchMyPersonal } from '@/hooks/student-personal';
import { useSession } from '@/hooks/use-auth';
import type { LessonType } from '@/hooks/use-calendar-events';
import type {
  LicenseCategory,
  Payment,
  PaymentMethod,
  Transmission,
} from '@/hooks/use-students';
import { supabase } from '@/lib/supabase';

/**
 * Everything the student app shows, for the signed-in student.
 * Row-level security makes sure a student only receives their own lessons, payments
 * and the notes their teacher shared. Every change goes through a database function
 * that checks the rules (see supabase/migrations/20261116120000_student_side.sql).
 */

/** The student's teacher, as the student sees them. */
export type StudentTeacher = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  carModel: string;
  transmission: Transmission;
  /** In shekels, for a lesson of lessonDurationMin minutes. */
  lessonPrice: number;
  lessonDurationMin: number;
  /** How long the green form and theory stay valid, for the expiry reminders. */
  validity: ValiditySettings;
};

/** The student's place on their teacher's list. */
export type StudentRecord = {
  id: string;
  licenseCategory: LicenseCategory;
  transmission: Transmission;
  theoryPassed: boolean;
  /** The teacher's file: green form, eye test, theory, status, payment plan... */
  file: StudentFile;
  joinedAt: Date;
  /** Calculated by the database: lessons before joining + booked lessons that have ended. */
  lessonsCompleted: number;
  /** In shekels: positive is prepaid credit, negative is debt to the teacher. */
  balance: number;
  totalPaid: number;
  totalCharged: number;
};

export type StudentLesson = {
  id: string;
  start: Date;
  end: Date;
  status: 'pending' | 'booked';
  /** Who still needs to approve a pending lesson. */
  awaiting: 'teacher' | 'student' | null;
  lessonTypeName: string;
  /** In shekels. */
  price: number;
  specialKind: SpecialLessonKind | null;
};

/** A lesson note the teacher chose to share with the student. */
export type SharedNote = { id: string; date: Date; text: string };

export type Reminder = {
  id: string;
  tone: 'action' | 'warning' | 'info';
  title: string;
  body?: string;
  /** The tab that deals with it, if any. */
  link?: '/student/lessons' | '/student/payments' | '/student/progress' | '/student/profile' | '/student/profile/details';
};

/** A day with the start times a lesson of the chosen type fits into. */
export type OpenDay = { day: Date; starts: Date[] };

/** Times snap to this step, like in the teacher's calendar. */
/** Missing personal details, fixed on the student's details screen. */
const PROFILE_ALERTS = new Set(['parent-missing', 'id-number-missing', 'address-missing']);

const STEP_MIN = 15;
/** How far ahead a student can request lessons. */
const REQUEST_DAYS = 14;
const MINUTE = 60_000;

type RecordRow = FileRow & {
  id: string;
  license_category: LicenseCategory;
  transmission: Transmission;
  created_at: string;
};
type BalanceRow = { lessons_completed: number; balance: number; total_paid: number; total_charged: number };
type LessonRow = {
  id: string;
  lesson_type_id: string;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'booked';
  awaiting: 'teacher' | 'student' | null;
  price: number;
  special_kind: SpecialLessonKind | null;
};
type PaymentRow = { id: string; amount: number; method: PaymentMethod; paid_at: string; note: string };
type NoteRow = { id: string; body: string; created_at: string };
type LessonTypeRow = { id: string; name: string; duration_min: number; price: number | null };
type TeacherRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  car_model: string;
  transmission: Transmission;
  lesson_price: number;
  lesson_duration_min: number;
  green_form_valid_years: number;
  theory_valid_years: number;
};
type TimeRow = { starts_at: string; ends_at: string };

type PortalData = {
  record: StudentRecord | null;
  teacher: StudentTeacher | null;
  lessons: StudentLesson[];
  payments: Payment[];
  notes: SharedNote[];
  lessonTypes: LessonType[];
  tests: StudentTest[];
  taskProgress: TaskProgress;
  /** Lesson type id → the student's own price, where the teacher set one. */
  prices: Record<string, number>;
  /** What the student filled in about themselves. Loaded even before a teacher adds them. */
  personal: StudentPersonal | null;
};

const EMPTY: PortalData = {
  record: null,
  teacher: null,
  lessons: [],
  payments: [],
  notes: [],
  lessonTypes: [],
  tests: [],
  taskProgress: {},
  prices: {},
  personal: null,
};

async function fetchPortal(userId: string): Promise<PortalData | null> {
  // A student is on at most one teacher's active list, and only sees that row.
  const [record, personal] = await Promise.all([
    supabase
      .from('students')
      .select(`id, license_category, transmission, created_at, ${FILE_COLUMNS}`)
      .is('removed_at', null)
      .maybeSingle<RecordRow>(),
    fetchMyPersonal(userId),
  ]);
  if (record.error) return null;
  if (!record.data) {
    // Without the student-side migration the database hides the row, which would look like
    // "no teacher yet". `my_teacher` comes with that migration, so its absence means the
    // server is out of date: report an error instead.
    const check = await supabase.rpc('my_teacher');
    if (check.error) {
      if (__DEV__) console.warn('Student portal: server check failed:', check.error.code, check.error.message);
      return null;
    }
    return { ...EMPTY, personal };
  }

  const studentId = record.data.id;
  const [balance, lessons, payments, notes, types, teacher, tests, progress, prices] = await Promise.all([
    supabase
      .from('student_balances')
      .select('lessons_completed, balance, total_paid, total_charged')
      .eq('student_id', studentId)
      .maybeSingle<BalanceRow>(),
    supabase
      .from('lessons')
      .select('id, lesson_type_id, starts_at, ends_at, status, awaiting, price, special_kind')
      .neq('status', 'cancelled')
      .order('starts_at')
      .returns<LessonRow[]>(),
    supabase
      .from('payments')
      .select('id, amount, method, paid_at, note')
      .order('paid_at', { ascending: false })
      .returns<PaymentRow[]>(),
    supabase
      .from('lesson_notes')
      .select('id, body, created_at')
      .order('created_at', { ascending: false })
      .returns<NoteRow[]>(),
    supabase
      .from('lesson_types')
      .select('id, name, duration_min, price')
      .eq('is_active', true)
      .order('sort_order')
      .returns<LessonTypeRow[]>(),
    supabase.rpc('my_teacher'),
    supabase.from('student_tests').select(TEST_COLUMNS).order('scheduled_at', { ascending: false }).returns<TestRow[]>(),
    supabase
      .from('student_task_progress')
      .select('task_id, status')
      .returns<{ task_id: number; status: Exclude<TaskStatus, 'not_started'> }[]>(),
    supabase.from('student_prices').select('lesson_type_id, price').returns<{ lesson_type_id: string; price: number }[]>(),
  ]);
  if (
    [balance, lessons, payments, notes, types, teacher, tests, progress, prices].some((result) => result.error)
  ) {
    return null;
  }

  const typeNames = new Map((types.data ?? []).map((type) => [type.id, type.name]));
  const teacherRow = (teacher.data as TeacherRow[] | null)?.[0];

  return {
    record: {
      id: studentId,
      licenseCategory: record.data.license_category,
      transmission: record.data.transmission,
      theoryPassed: record.data.theory_passed,
      file: toFile(record.data),
      joinedAt: new Date(record.data.created_at),
      lessonsCompleted: balance.data?.lessons_completed ?? 0,
      balance: balance.data?.balance ?? 0,
      totalPaid: balance.data?.total_paid ?? 0,
      totalCharged: balance.data?.total_charged ?? 0,
    },
    teacher: teacherRow
      ? {
          firstName: teacherRow.first_name,
          lastName: teacherRow.last_name,
          phone: teacherRow.phone,
          email: teacherRow.email,
          city: teacherRow.city,
          carModel: teacherRow.car_model,
          transmission: teacherRow.transmission,
          lessonPrice: teacherRow.lesson_price,
          lessonDurationMin: teacherRow.lesson_duration_min,
          validity: {
            greenFormValidYears: teacherRow.green_form_valid_years ?? DEFAULT_VALIDITY.greenFormValidYears,
            theoryValidYears: teacherRow.theory_valid_years ?? DEFAULT_VALIDITY.theoryValidYears,
          },
        }
      : null,
    tests: (tests.data ?? []).map(toTest),
    taskProgress: Object.fromEntries((progress.data ?? []).map((row) => [row.task_id, row.status])),
    prices: Object.fromEntries((prices.data ?? []).map((row) => [row.lesson_type_id, row.price])),
    personal,
    lessons: (lessons.data ?? []).map((row) => ({
      id: row.id,
      start: new Date(row.starts_at),
      end: new Date(row.ends_at),
      status: row.status,
      awaiting: row.awaiting,
      lessonTypeName: typeNames.get(row.lesson_type_id) ?? 'שיעור',
      price: row.price,
      specialKind: row.special_kind,
    })),
    payments: (payments.data ?? []).map((row) => ({
      id: row.id,
      amount: row.amount,
      method: row.method,
      paidAt: new Date(row.paid_at),
      note: row.note,
    })),
    notes: (notes.data ?? []).map((row) => ({ id: row.id, date: new Date(row.created_at), text: row.body })),
    lessonTypes: (types.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      durationMin: row.duration_min,
      price: row.price,
    })),
  };
}

/**
 * The price of a lesson type, the same way the database works it out: the student's own
 * price, else the type's price, else the teacher's lesson price per standard lesson.
 */
export function getStudentLessonPrice(
  type: LessonType,
  teacher: StudentTeacher | null,
  prices: Record<string, number> = {}
) {
  if (prices[type.id] !== undefined) return prices[type.id];
  if (type.price !== null) return type.price;
  if (!teacher || teacher.lessonDurationMin <= 0) return 0;
  return teacher.lessonPrice * Math.max(1, Math.round(type.durationMin / teacher.lessonDurationMin));
}

/**
 * Start times where a lesson of `durationMin` fits inside the teacher's open time
 * without touching another lesson, grouped by day.
 */
export function findOpenStarts(slots: TimeRow[], busy: TimeRow[], durationMin: number, now = new Date()) {
  const step = STEP_MIN * MINUTE;
  const length = durationMin * MINUTE;
  const busyRanges = busy.map((row) => [new Date(row.starts_at).getTime(), new Date(row.ends_at).getTime()]);
  const earliest = Math.ceil(now.getTime() / step) * step;
  const days = new Map<string, OpenDay>();

  const sorted = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const slot of sorted) {
    const slotEnd = new Date(slot.ends_at).getTime();
    let start = Math.max(new Date(slot.starts_at).getTime(), earliest);
    // Line up with the 15-minute grid.
    start = Math.ceil(start / step) * step;
    for (; start + length <= slotEnd; start += step) {
      const end = start + length;
      if (busyRanges.some(([busyStart, busyEnd]) => busyStart < end && start < busyEnd)) continue;
      const date = new Date(start);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const day = days.get(key) ?? {
        day: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        starts: [],
      };
      day.starts.push(date);
      days.set(key, day);
    }
  }
  return [...days.values()];
}

/** Database errors from the student functions, in Hebrew. */
function describeError(code: string | undefined) {
  switch (code) {
    case '23P01':
      return 'הזמן הזה כבר נתפס. יש לבחור זמן אחר.';
    case 'HM010':
      return 'עדיין לא נוספת לרשימת התלמידים של מורה.';
    case 'HM011':
      return 'סוג השיעור כבר לא זמין. יש לרענן ולנסות שוב.';
    case 'HM012':
      return 'הזמן הזה כבר עבר. יש לבחור זמן אחר.';
    case 'HM013':
      return 'הזמן הזה כבר לא פתוח אצל המורה. יש לבחור זמן אחר.';
    case 'HM014':
      return 'יש לך כבר 3 בקשות שמחכות לאישור המורה. אפשר לבקש שיעור נוסף אחרי שהמורה יענה.';
    case 'HM015':
      return 'השיעור כבר לא ממתין לאישור שלך.';
    case 'HM016':
      return 'אי אפשר לבטל את הבקשה הזו. ייתכן שהמורה כבר ענה עליה.';
    case 'HM017':
      return 'השיעורים שלך מוקפאים כרגע. לחידוש יש לפנות למורה.';
    default:
      return 'הפעולה נכשלה. יש לבדוק את החיבור ולנסות שוב.';
  }
}

function buildReminders(data: PortalData, now: Date): Reminder[] {
  const { record, lessons, notes } = data;
  if (!record) return [];
  const reminders: Reminder[] = [];

  const awaitingMe = lessons.filter((l) => l.status === 'pending' && l.awaiting === 'student' && l.start > now);
  if (awaitingMe.length > 0) {
    reminders.push({
      id: 'approve',
      tone: 'action',
      title:
        awaitingMe.length === 1
          ? 'שיעור אחד מחכה לאישור שלך'
          : `${awaitingMe.length} שיעורים מחכים לאישור שלך`,
      body: 'המורה קבע לך שיעור. יש לאשר או לדחות אותו.',
      link: '/student/lessons',
    });
  }

  if (!record.theoryPassed) {
    reminders.push({
      id: 'theory',
      tone: 'warning',
      title: 'עדיין לא עברת מבחן תאוריה',
      body: 'בלי מבחן תאוריה אי אפשר לגשת לטסט. כדאי לקבוע מבחן כבר עכשיו.',
      link: '/student/progress',
    });
  }

  if (record.balance < 0) {
    reminders.push({
      id: 'debt',
      tone: 'warning',
      title: 'יש יתרה לתשלום',
      body: 'אפשר לראות את פירוט השיעורים והתשלומים בלשונית התשלומים.',
      link: '/student/payments',
    });
  }

  // Green form, theory expiry, parent contact, upcoming tests and appeals.
  for (const alert of getFileAlerts(
    {
      file: record.file,
      tests: data.tests,
      birthDate: data.personal?.birthDate ?? null,
      contacts: data.personal?.contacts ?? [],
      hasAddress: !data.personal || data.personal.addresses.length > 0,
      hasIdNumber: !data.personal || !!data.personal.idNumber,
      licenseCategory: record.licenseCategory,
      lessonsCompleted: record.lessonsCompleted,
      validity: data.teacher?.validity ?? DEFAULT_VALIDITY,
      audience: 'student',
    },
    now
  )) {
    reminders.push({
      ...alert,
      link: PROFILE_ALERTS.has(alert.id) ? '/student/profile/details' : '/student/progress',
    });
  }

  if (record.file.status === 'frozen') {
    reminders.unshift({
      id: 'frozen',
      tone: 'info',
      title: 'השיעורים שלך מוקפאים',
      body: 'בזמן ההקפאה אי אפשר לבקש שיעורים חדשים. לחידוש יש לפנות למורה.',
    });
  }

  const latestNote = notes[0];
  if (latestNote) {
    reminders.push({
      id: `note-${latestNote.id}`,
      tone: 'info',
      title: 'מהמורה לקראת השיעור הבא',
      body: latestNote.text,
      link: '/student/progress',
    });
  }

  return reminders;
}

type StudentPortalValue = PortalData & {
  /** True while the first load is in progress. */
  loading: boolean;
  /** Last loading error in Hebrew, or null. */
  error: string | null;
  /** The student is on a teacher's list. Until then there is nothing to show. */
  linked: boolean;
  reminders: Reminder[];
  /** Loads everything again; `quiet` keeps the current screen instead of a spinner. */
  reload: (quiet?: boolean) => Promise<void>;
  /** Free start times in the teacher's open time for a lesson type, for the next two weeks. */
  loadOpenDays: (lessonType: LessonType) => Promise<OpenDay[] | string>;
  /** Each returns an error in Hebrew, or null on success. */
  requestLesson: (lessonTypeId: string, start: Date) => Promise<string | null>;
  respondToLesson: (lessonId: string, accept: boolean) => Promise<string | null>;
  cancelRequest: (lessonId: string) => Promise<string | null>;
};

const StudentPortalContext = createContext<StudentPortalValue | null>(null);

/** Holds the student app's data. Mounted by the student layout, so it starts fresh per student. */
export function StudentPortalProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const studentUserId = session?.role === 'student' ? session.userId : null;
  const [data, setData] = useState<PortalData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: PortalData | null) => {
    setLoading(false);
    if (!result) {
      setError('הטעינה נכשלה. יש לבדוק את החיבור ולנסות שוב.');
      return;
    }
    setError(null);
    setData(result);
  }, []);

  useEffect(() => {
    if (!studentUserId) return;
    let cancelled = false;
    fetchPortal(studentUserId).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [studentUserId, apply]);

  const reload = useCallback(
    async (quiet = false) => {
      if (!studentUserId) return;
      if (!quiet) setLoading(true);
      apply(await fetchPortal(studentUserId));
    },
    [studentUserId, apply]
  );

  const loadOpenDays = useCallback(async (lessonType: LessonType) => {
    const now = new Date();
    const until = new Date(now.getTime() + REQUEST_DAYS * 24 * 60 * MINUTE);
    const [slots, busy] = await Promise.all([
      supabase
        .from('availability_slots')
        .select('starts_at, ends_at')
        .gt('ends_at', now.toISOString())
        .lt('starts_at', until.toISOString())
        .returns<TimeRow[]>(),
      supabase.rpc('teacher_busy_times', { range_start: now.toISOString(), range_end: until.toISOString() }),
    ]);
    if (slots.error || busy.error) return describeError(undefined);
    return findOpenStarts(slots.data ?? [], (busy.data as TimeRow[] | null) ?? [], lessonType.durationMin, now);
  }, []);

  const requestLesson = async (lessonTypeId: string, start: Date) => {
    const { error: rpcError } = await supabase.rpc('request_lesson', {
      requested_type_id: lessonTypeId,
      requested_start: start.toISOString(),
    });
    if (rpcError) return describeError(rpcError.code);
    await reload(true);
    return null;
  };

  const respondToLesson = async (lessonId: string, accept: boolean) => {
    const { error: rpcError } = await supabase.rpc('respond_to_lesson', {
      target_lesson_id: lessonId,
      accept,
    });
    if (rpcError) return describeError(rpcError.code);
    await reload(true);
    return null;
  };

  const cancelRequest = async (lessonId: string) => {
    const { error: rpcError } = await supabase.rpc('cancel_lesson_request', { target_lesson_id: lessonId });
    if (rpcError) return describeError(rpcError.code);
    await reload(true);
    return null;
  };

  const reminders = useMemo(() => buildReminders(data, new Date()), [data]);

  const value: StudentPortalValue = {
    ...data,
    loading,
    error,
    linked: data.record !== null,
    reminders,
    reload,
    loadOpenDays,
    requestLesson,
    respondToLesson,
    cancelRequest,
  };

  return <StudentPortalContext value={value}>{children}</StudentPortalContext>;
}

/** The signed-in student's data and actions. */
export function useStudentPortal() {
  const context = useContext(StudentPortalContext);
  if (!context) throw new Error('useStudentPortal must be used inside StudentPortalProvider');
  return context;
}

/** Lessons split the way the student app shows them. */
export function useStudentLessons() {
  const { lessons } = useStudentPortal();
  return useMemo(() => {
    const now = new Date();
    const upcoming = lessons.filter((l) => l.end > now);
    return {
      awaitingMe: upcoming.filter((l) => l.status === 'pending' && l.awaiting === 'student'),
      awaitingTeacher: upcoming.filter((l) => l.status === 'pending' && l.awaiting === 'teacher'),
      booked: upcoming.filter((l) => l.status === 'booked'),
      past: lessons.filter((l) => l.status === 'booked' && l.end <= now).reverse(),
    };
  }, [lessons]);
}
