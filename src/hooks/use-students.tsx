import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/hooks/use-auth';
import {
  FILE_COLUMNS,
  parseDay,
  TEST_COLUMNS,
  toFile,
  toFileColumns,
  toTest,
  toTestColumns,
  type Address,
  type Contact,
  type FileRow,
  type PriorLicense,
  type ReferralSource,
  type StudentFile,
  type StudentPersonal,
  type StudentTest,
  type TaskProgress,
  type TaskStatus,
  type TestRow,
} from '@/hooks/student-file';
import {
  PERSONAL_COLUMNS,
  saveAddress,
  saveContact,
  toPersonal,
  type PersonalRow,
} from '@/hooks/student-personal';
import { supabase } from '@/lib/supabase';

/** Israeli driving licence categories. */
export const LICENSE_CATEGORIES = {
  A2: 'אופנוע עד 14.6 כ״ס',
  A1: 'אופנוע עד 47.5 כ״ס',
  A: 'אופנוע ללא הגבלת הספק',
  B: 'רכב פרטי עד 3.5 טון',
  C1: 'רכב משא עד 12 טון',
  C: 'רכב משא מעל 12 טון',
  'C+E': 'רכב משא עם גרור (סמי טריילר)',
  D1: 'מונית / אוטובוס זעיר',
  D: 'אוטובוס',
  '1': 'טרקטור',
} as const;

export type LicenseCategory = keyof typeof LICENSE_CATEGORIES;

export type Transmission = 'manual' | 'automatic';

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: 'ידני',
  automatic: 'אוטומטי',
};

export type LessonNote = {
  id: string;
  date: Date;
  /** What went well and what to improve in the next lesson. */
  text: string;
  /** The teacher chose to show this note to the student in the student app. */
  shared: boolean;
};

export type Student = {
  id: string;
  firstName: string;
  lastName: string;
  /** First and last name together, for display. */
  name: string;
  phone: string;
  licenseCategory: LicenseCategory;
  transmission: Transmission;
  /** Lessons before joining + booked lessons that have ended. Calculated by the database. */
  lessonsCompleted: number;
  /** Notes from past lessons, newest first. */
  lessonNotes: LessonNote[];
  /**
   * In shekels: positive is prepaid credit, negative is debt to the teacher.
   * Opening balance + payments − lessons taken. Calculated by the database.
   */
  balance: number;
  /** Payments received, newest first. */
  payments: Payment[];
  /** Israeli ID number (teudat zehut), needed for the student's licence file. */
  idNumber?: string;
  /** Passed the theory test. */
  theoryPassed?: boolean;
  createdAt: Date;
  /** Set when the teacher removed the student from their list. History is kept. */
  removal?: StudentRemoval;
  /** The teacher's file: licence file, status, money arrangements. */
  file: StudentFile;
  /**
   * What the student filled in about themselves (birth date, addresses, contacts...).
   * Null if the student deleted their account.
   */
  personal: StudentPersonal | null;
  /** Internal and practical tests, newest first. */
  tests: StudentTest[];
  taskProgress: TaskProgress;
  /** Lesson type id → this student's own price in shekels. Other types use the usual price. */
  prices: Record<string, number>;
};

export type RemovalReason = 'passed_test' | 'stopped' | 'other_teacher' | 'other';

export const REMOVAL_REASON_LABELS: Record<RemovalReason, string> = {
  passed_test: 'עבר/ה טסט',
  stopped: 'הפסיק/ה ללמוד',
  other_teacher: 'עבר/ה למורה אחר',
  other: 'סיבה אחרת',
};

export type StudentRemoval = {
  removedAt: Date;
  reason: RemovalReason;
  note: string;
};

export type PaymentMethod = 'cash' | 'bit' | 'paybox' | 'bank_transfer' | 'credit_card' | 'check';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  bit: 'ביט',
  paybox: 'פייבוקס',
  bank_transfer: 'העברה בנקאית',
  credit_card: 'אשראי',
  check: 'צ׳ק',
};

export type Payment = {
  id: string;
  /** In shekels. */
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note: string;
};

export type NewPayment = {
  amount: number;
  method: PaymentMethod;
  note?: string;
};

/**
 * What the teacher fills in when adding a student; the rest is filled in automatically.
 * The student must already have an account: the database takes the name and phone
 * from it. Here `lessonsCompleted` and `balance` are what the student brings from
 * before joining.
 */
export type NewStudent = Omit<
  Student,
  | 'id'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'createdAt'
  | 'lessonNotes'
  | 'payments'
  | 'file'
  | 'personal'
  | 'tests'
  | 'taskProgress'
  | 'prices'
> & {
  /** The student's own account, found with findStudentAccount. */
  profileId: string;
  /** Optional first note, e.g. the student's driving experience so far. */
  firstNote?: string;
  /** The teacher's file at the start: green form, theory date, payment plan... */
  file?: Partial<StudentFile>;
  /** Pickup address, when the student did not enter one at sign-up. */
  address?: Omit<Address, 'id'>;
  /** Parent contact, when the student is under 18 and did not enter one. */
  parent?: Omit<Contact, 'id'>;
};

/** A student account found by email, before the teacher adds it to their list. */
export type StudentAccount = {
  profileId: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** The student is already on this teacher's list. */
  alreadyAdded: boolean;
  /** The student is on this teacher's former list; bring them back instead of adding. */
  removedStudentId: string | null;
  /** The student is on another teacher's list. A student has one teacher at a time. */
  hasOtherTeacher: boolean;
  /**
   * Which required details the student already entered on their account. Only yes/no:
   * the details themselves become visible once the student is on the teacher's list.
   */
  hasIdNumber: boolean;
  hasBirthDate: boolean;
  isMinor: boolean;
  hasAddress: boolean;
  hasParent: boolean;
  /**
   * The student's own licence answers from sign-up, to start the form from. Null for
   * accounts made before sign-up asked them.
   */
  answers: StudentAnswers | null;
};

/** What the student answered at sign-up about their licence file, payment and referral. */
export type StudentAnswers = {
  licenseCategory: LicenseCategory;
  transmission: Transmission | null;
  greenFormIssuedAt: Date | null;
  eyeTestDone: boolean;
  needsGlasses: boolean;
  healthDeclarationDone: boolean;
  theoryPassedAt: Date | null;
  priorLicense: PriorLicense;
  specialRestrictions: string;
  preferredPaymentMethod: PaymentMethod | null;
  referralSource: ReferralSource | null;
};

type StudentAccountRow = {
  profile_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  already_added: boolean;
  removed_student_id: string | null;
  has_other_teacher: boolean;
  // Missing on a database without the 20261120 update.
  has_id_number?: boolean;
  has_birth_date?: boolean;
  is_minor?: boolean;
  has_address?: boolean;
  has_parent?: boolean;
  // Missing on a database without the 20261121 update.
  answered_licence?: boolean;
  license_category?: LicenseCategory | null;
  transmission?: Transmission | null;
  green_form_issued_at?: string | null;
  eye_test_done?: boolean;
  needs_glasses?: boolean;
  health_declaration_done?: boolean;
  theory_passed_at?: string | null;
  prior_license?: PriorLicense;
  special_restrictions?: string;
  preferred_payment_method?: PaymentMethod | null;
  referral_source?: ReferralSource | null;
};

/**
 * Looks up a student account by its exact email. Returns null if no student signed
 * up with that email. Throws StudentSaveError if the lookup itself fails.
 */
export async function findStudentAccount(email: string): Promise<StudentAccount | null> {
  const { data, error } = await supabase.rpc('find_student_account', {
    student_email: email.trim(),
  });
  if (error) throw new StudentSaveError('החיפוש נכשל. יש לבדוק את החיבור ולנסות שוב.');
  // The database function returns a table: one row if found, none otherwise.
  const row = (data as StudentAccountRow[] | null)?.[0];
  if (!row) return null;
  return {
    profileId: row.profile_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    alreadyAdded: row.already_added,
    removedStudentId: row.removed_student_id,
    hasOtherTeacher: row.has_other_teacher,
    hasIdNumber: row.has_id_number ?? false,
    hasBirthDate: row.has_birth_date ?? false,
    isMinor: row.is_minor ?? false,
    hasAddress: row.has_address ?? false,
    hasParent: row.has_parent ?? false,
    answers:
      row.answered_licence && row.license_category
        ? {
            licenseCategory: row.license_category,
            transmission: row.transmission ?? null,
            greenFormIssuedAt: parseDay(row.green_form_issued_at ?? null),
            eyeTestDone: row.eye_test_done ?? false,
            needsGlasses: row.needs_glasses ?? false,
            healthDeclarationDone: row.health_declaration_done ?? false,
            theoryPassedAt: parseDay(row.theory_passed_at ?? null),
            priorLicense: row.prior_license ?? 'none',
            specialRestrictions: row.special_restrictions ?? '',
            preferredPaymentMethod: row.preferred_payment_method ?? null,
            referralSource: row.referral_source ?? null,
          }
        : null,
  };
}

export type PaymentStatus = 'credit' | 'even' | 'debt';

export function getPaymentStatus(balance: number): PaymentStatus {
  if (balance > 0) return 'credit';
  if (balance < 0) return 'debt';
  return 'even';
}

/** Digits only, e.g. "050-123 4567" → "0501234567". */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

/** An Israeli mobile number: 10 digits starting with 05. */
export function isValidPhone(phone: string) {
  return /^05\d{8}$/.test(normalizePhone(phone));
}

/** Formats an Israeli mobile number as 050-1234567. */
export function formatPhone(phone: string) {
  const digits = normalizePhone(phone);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : phone.trim();
}

/** Checks an Israeli ID number with its check digit. */
export function isValidIsraeliId(id: string) {
  const digits = id.replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 9) return false;
  const sum = [...digits.padStart(9, '0')].reduce((total, char, index) => {
    const product = Number(char) * ((index % 2) + 1);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return sum % 10 === 0;
}

type LessonNoteRow = { id: string; body: string; created_at: string; shared_with_student: boolean };

type PaymentRow = { id: string; amount: number; method: PaymentMethod; paid_at: string; note: string };

type StudentRow = FileRow & {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  id_number: string | null;
  license_category: LicenseCategory;
  transmission: Transmission;
  theory_passed: boolean;
  prior_lessons: number;
  opening_balance: number;
  created_at: string;
  removed_at: string | null;
  removal_reason: RemovalReason | null;
  removal_note: string;
  lesson_notes: LessonNoteRow[];
  payments: PaymentRow[];
  profile: PersonalRow | null;
  student_tests: TestRow[];
  student_task_progress: { task_id: number; status: Exclude<TaskStatus, 'not_started'> }[];
  student_prices: { lesson_type_id: string; price: number }[];
};

type BalanceRow = {
  student_id: string;
  lessons_completed: number;
  balance: number;
};

const NOTE_COLUMNS = 'id, body, created_at, shared_with_student';
const STUDENT_COLUMNS =
  `id, first_name, last_name, phone, id_number, license_category, transmission, prior_lessons, ` +
  `opening_balance, created_at, removed_at, removal_reason, removal_note, ${FILE_COLUMNS}, ` +
  `lesson_notes(${NOTE_COLUMNS}), payments(id, amount, method, paid_at, note), ` +
  `profile:profiles(${PERSONAL_COLUMNS}), student_tests(${TEST_COLUMNS}), ` +
  `student_task_progress(task_id, status), student_prices(lesson_type_id, price)`;
const PAYMENT_COLUMNS = 'id, amount, method, paid_at, note';

function toNote(row: LessonNoteRow): LessonNote {
  return { id: row.id, date: new Date(row.created_at), text: row.body, shared: row.shared_with_student };
}

function toPayment(row: PaymentRow): Payment {
  return { id: row.id, amount: row.amount, method: row.method, paidAt: new Date(row.paid_at), note: row.note };
}

function toStudent(row: StudentRow, balance?: BalanceRow): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`,
    phone: row.phone,
    idNumber: row.id_number ?? undefined,
    licenseCategory: row.license_category,
    transmission: row.transmission,
    theoryPassed: row.theory_passed,
    lessonsCompleted: balance?.lessons_completed ?? row.prior_lessons,
    balance: balance?.balance ?? row.opening_balance,
    createdAt: new Date(row.created_at),
    removal:
      row.removed_at && row.removal_reason
        ? { removedAt: new Date(row.removed_at), reason: row.removal_reason, note: row.removal_note }
        : undefined,
    file: toFile(row),
    personal: row.profile ? toPersonal(row.profile) : null,
    tests: row.student_tests.map(toTest).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime()),
    taskProgress: Object.fromEntries(row.student_task_progress.map((p) => [p.task_id, p.status])),
    prices: Object.fromEntries(row.student_prices.map((p) => [p.lesson_type_id, p.price])),
    lessonNotes: [...row.lesson_notes]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(toNote),
    payments: [...row.payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map(toPayment),
  };
}

/** Students with their notes and payments, plus the balances the database calculates. */
async function fetchStudents() {
  const [students, balances] = await Promise.all([
    supabase
      .from('students')
      .select(STUDENT_COLUMNS)
      .order('created_at', { ascending: false })
      .returns<StudentRow[]>(),
    supabase.from('student_balances').select('student_id, lessons_completed, balance').returns<BalanceRow[]>(),
  ]);
  if (students.error || balances.error || !students.data || !balances.data) {
    return { students: null, failed: true };
  }
  const byStudent = new Map(balances.data.map((row) => [row.student_id, row]));
  return { students: students.data.map((row) => toStudent(row, byStudent.get(row.id))), failed: false };
}

/** One student, e.g. after their details changed. */
async function fetchStudent(id: string) {
  const [student, balance] = await Promise.all([
    supabase.from('students').select(STUDENT_COLUMNS).eq('id', id).single<StudentRow>(),
    supabase
      .from('student_balances')
      .select('student_id, lessons_completed, balance')
      .eq('student_id', id)
      .maybeSingle<BalanceRow>(),
  ]);
  if (student.error || !student.data) return null;
  return toStudent(student.data, balance.data ?? undefined);
}

async function fetchBalances() {
  const { data, error } = await supabase
    .from('student_balances')
    .select('student_id, lessons_completed, balance')
    .returns<BalanceRow[]>();
  return error ? null : data;
}

/** A student has one teacher at a time (see supabase/migrations). */
export const STUDENT_HAS_OTHER_TEACHER =
  'התלמיד רשום כרגע אצל מורה אחר. תלמיד יכול להיות אצל מורה אחד בלבד בכל פעם.';

/** Thrown by addStudent with a message in Hebrew that can be shown as-is. */
export class StudentSaveError extends Error {
  constructor(
    message: string,
    /** The form field the error belongs to, if any. */
    readonly field?: 'email'
  ) {
    super(message);
  }
}

type StudentsContextValue = {
  students: Student[];
  /** True while the list is loading for the first time. */
  loading: boolean;
  /** Last loading error in Hebrew, or null. */
  error: string | null;
  reload: () => Promise<void>;
  /** Re-reads balances and lesson counts, e.g. after a lesson changed. */
  refreshBalances: () => Promise<void>;
  /** Returns an error message in Hebrew, or null on success. */
  addLessonNote: (studentId: string, text: string, shared?: boolean) => Promise<string | null>;
  /** Shows or hides a note in the student app. Returns an error in Hebrew, or null. */
  setNoteShared: (studentId: string, noteId: string, shared: boolean) => Promise<string | null>;
  /** Saves part of the teacher's file. Returns an error in Hebrew, or null. */
  updateFile: (studentId: string, changes: Partial<StudentFile>) => Promise<string | null>;
  /** Adds a test (no id) or updates one. Returns an error in Hebrew, or null. */
  saveTest: (studentId: string, test: Omit<StudentTest, 'id'>, testId?: string) => Promise<string | null>;
  deleteTest: (studentId: string, testId: string) => Promise<string | null>;
  setTaskStatus: (studentId: string, taskId: number, status: TaskStatus) => Promise<string | null>;
  /** The student's own price for a lesson type, or null to go back to the usual price. */
  setStudentPrice: (studentId: string, lessonTypeId: string, price: number | null) => Promise<string | null>;
  /** Loads one student again, e.g. after their addresses or contacts changed. */
  reloadStudent: (studentId: string) => Promise<void>;
  /** Returns an error message in Hebrew, or null on success. */
  addPayment: (studentId: string, payment: NewPayment) => Promise<string | null>;
  /** Saves the student and returns it. Throws StudentSaveError. */
  addStudent: (input: NewStudent) => Promise<Student>;
  /** Moves a student to the former list. Returns an error in Hebrew, or null. */
  removeStudent: (studentId: string, reason: RemovalReason, note?: string) => Promise<string | null>;
  /** Brings a former student back to the list. Returns an error in Hebrew, or null. */
  restoreStudent: (studentId: string) => Promise<string | null>;
};

const StudentsContext = createContext<StudentsContextValue | null>(null);

/**
 * Holds the signed-in teacher's students for the whole app. Must be inside AuthProvider.
 * Row-level security in the database makes sure a teacher only
 * ever receives their own organization's students.
 */
export function StudentsProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const teacherId = session?.role === 'teacher' ? session.userId : null;

  // The provider is keyed by account in the root layout, so this state starts
  // fresh for every account that signs in.
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(teacherId !== null);
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchStudents>>) => {
    setLoading(false);
    if (result.failed || !result.students) {
      setError('טעינת התלמידים נכשלה. יש לבדוק את החיבור ולנסות שוב.');
      return;
    }
    setError(null);
    setStudents(result.students);
  }, []);

  const reload = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    applyResult(await fetchStudents());
  }, [teacherId, applyResult]);

  const refreshBalances = useCallback(async () => {
    const rows = await fetchBalances();
    if (!rows) return;
    const byStudent = new Map(rows.map((row) => [row.student_id, row]));
    setStudents((current) =>
      current.map((student) => {
        const row = byStudent.get(student.id);
        return row ? { ...student, balance: row.balance, lessonsCompleted: row.lessons_completed } : student;
      })
    );
  }, []);

  // Load once the teacher is signed in.
  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    fetchStudents().then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [teacherId, applyResult]);

  const addStudent = async ({ firstNote, file, address, parent, ...input }: NewStudent): Promise<Student> => {
    const { data, error: insertError } = await supabase
      .from('students')
      .insert({
        // The database copies the name and phone from this account.
        profile_id: input.profileId,
        id_number: input.idNumber ?? null,
        license_category: input.licenseCategory,
        transmission: input.transmission,
        theory_passed: input.theoryPassed ?? false,
        prior_lessons: input.lessonsCompleted,
        opening_balance: input.balance,
        ...toFileColumns(file ?? {}),
      })
      .select(STUDENT_COLUMNS)
      .single<StudentRow>();

    if (insertError || !data) {
      switch (insertError?.code) {
        case '23505': {
          // The phone is unique per teacher too, and that check can fire first even when the
          // real reason is that this account is already on the list, so look for it directly.
          const { count } = await supabase
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', input.profileId);
          throw new StudentSaveError(
            count
              ? 'התלמיד כבר נמצא ברשימת התלמידים שלך'
              : 'כבר קיים ברשימה תלמיד עם מספר הטלפון של החשבון הזה',
            'email'
          );
        }
        case 'HM005':
          throw new StudentSaveError(STUDENT_HAS_OTHER_TEACHER, 'email');
        // The database only accepts existing student accounts (see supabase/migrations).
        case 'HM001':
        case 'HM002':
          throw new StudentSaveError(
            'לא נמצא חשבון תלמיד. התלמיד צריך להירשם לאפליקציה קודם.',
            'email'
          );
        default:
          throw new StudentSaveError('שמירת התלמיד נכשלה. יש לנסות שוב.');
      }
    }

    let notes: LessonNoteRow[] = [];
    if (firstNote) {
      const note = await supabase
        .from('lesson_notes')
        .insert({ student_id: data.id, body: firstNote })
        .select(NOTE_COLUMNS)
        .single<LessonNoteRow>();
      // The student is saved either way; a failed first note is not worth blocking on.
      if (note.data) notes = [note.data];
    }

    // Details the student did not enter themselves. They go on the student's account, which
    // the teacher may write to now that the student is on their list. The student is saved
    // either way; a missing detail shows up as an alert on the student's page.
    let personalSaved = false;
    if (address) personalSaved = (await saveAddress(input.profileId, address)) === null || personalSaved;
    if (parent) personalSaved = (await saveContact(input.profileId, parent)) === null || personalSaved;
    const reloaded = personalSaved ? await fetchStudent(data.id) : null;

    // A new student has no lessons or payments yet, so the opening values are the balance.
    // (Reloading also brings the first note, which was saved above.)
    const student = reloaded ?? toStudent({ ...data, lesson_notes: notes });
    setStudents((current) => [student, ...current]);
    return student;
  };

  const addLessonNote = async (studentId: string, text: string, shared = false): Promise<string | null> => {
    const { data, error: insertError } = await supabase
      .from('lesson_notes')
      .insert({ student_id: studentId, body: text, shared_with_student: shared })
      .select(NOTE_COLUMNS)
      .single<LessonNoteRow>();
    if (insertError || !data) return 'שמירת ההערה נכשלה. יש לנסות שוב.';

    const note = toNote(data);
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId
          ? { ...student, lessonNotes: [note, ...student.lessonNotes] }
          : student
      )
    );
    return null;
  };

  const setNoteShared = async (studentId: string, noteId: string, shared: boolean) => {
    const { error: updateError } = await supabase
      .from('lesson_notes')
      .update({ shared_with_student: shared })
      .eq('id', noteId);
    if (updateError) return 'עדכון ההערה נכשל. יש לנסות שוב.';
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              lessonNotes: student.lessonNotes.map((note) => (note.id === noteId ? { ...note, shared } : note)),
            }
          : student
      )
    );
    return null;
  };

  const patchStudent = (studentId: string, update: (student: Student) => Student) =>
    setStudents((current) => current.map((student) => (student.id === studentId ? update(student) : student)));

  const updateFile = async (studentId: string, changes: Partial<StudentFile>) => {
    const { error: updateError } = await supabase
      .from('students')
      .update(toFileColumns(changes))
      .eq('id', studentId);
    if (updateError) return 'שמירת התיק נכשלה. יש לנסות שוב.';
    patchStudent(studentId, (student) => ({
      ...student,
      file: { ...student.file, ...changes },
      theoryPassed: changes.theoryPassed ?? student.theoryPassed,
    }));
    return null;
  };

  const saveTest = async (studentId: string, test: Omit<StudentTest, 'id'>, testId?: string) => {
    const columns = toTestColumns(test);
    const result = testId
      ? await supabase.from('student_tests').update(columns).eq('id', testId).select(TEST_COLUMNS).single<TestRow>()
      : await supabase
          .from('student_tests')
          .insert({ ...columns, student_id: studentId })
          .select(TEST_COLUMNS)
          .single<TestRow>();
    if (result.error || !result.data) return 'שמירת הטסט נכשלה. יש לנסות שוב.';
    const saved = toTest(result.data);
    patchStudent(studentId, (student) => ({
      ...student,
      tests: [...student.tests.filter((t) => t.id !== saved.id), saved].sort(
        (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime()
      ),
    }));
    return null;
  };

  const deleteTest = async (studentId: string, testId: string) => {
    const { error: deleteError } = await supabase.from('student_tests').delete().eq('id', testId);
    if (deleteError) return 'מחיקת הטסט נכשלה. יש לנסות שוב.';
    patchStudent(studentId, (student) => ({ ...student, tests: student.tests.filter((t) => t.id !== testId) }));
    return null;
  };

  const setTaskStatus = async (studentId: string, taskId: number, status: TaskStatus) => {
    const { error: saveError } =
      status === 'not_started'
        ? await supabase.from('student_task_progress').delete().eq('student_id', studentId).eq('task_id', taskId)
        : await supabase
            .from('student_task_progress')
            .upsert({ student_id: studentId, task_id: taskId, status }, { onConflict: 'student_id,task_id' });
    if (saveError) return 'העדכון נכשל. יש לנסות שוב.';
    patchStudent(studentId, (student) => {
      const taskProgress = { ...student.taskProgress };
      if (status === 'not_started') delete taskProgress[taskId];
      else taskProgress[taskId] = status;
      return { ...student, taskProgress };
    });
    return null;
  };

  const setStudentPrice = async (studentId: string, lessonTypeId: string, price: number | null) => {
    const { error: saveError } =
      price === null
        ? await supabase
            .from('student_prices')
            .delete()
            .eq('student_id', studentId)
            .eq('lesson_type_id', lessonTypeId)
        : await supabase
            .from('student_prices')
            .upsert(
              { student_id: studentId, lesson_type_id: lessonTypeId, price },
              { onConflict: 'student_id,lesson_type_id' }
            );
    if (saveError) return 'שמירת המחיר נכשלה. יש לנסות שוב.';
    patchStudent(studentId, (student) => {
      const prices = { ...student.prices };
      if (price === null) delete prices[lessonTypeId];
      else prices[lessonTypeId] = price;
      return { ...student, prices };
    });
    return null;
  };

  const reloadStudent = async (studentId: string) => {
    const student = await fetchStudent(studentId);
    if (student) patchStudent(studentId, () => student);
  };

  const addPayment = async (studentId: string, payment: NewPayment): Promise<string | null> => {
    if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
      return 'הסכום חייב להיות מספר שלם גדול מאפס.';
    }
    const { data, error: insertError } = await supabase
      .from('payments')
      .insert({ student_id: studentId, amount: payment.amount, method: payment.method, note: payment.note ?? '' })
      .select(PAYMENT_COLUMNS)
      .single<PaymentRow>();
    if (insertError || !data) return 'שמירת התשלום נכשלה. יש לנסות שוב.';

    const saved = toPayment(data);
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId ? { ...student, payments: [saved, ...student.payments] } : student
      )
    );
    await refreshBalances();
    return null;
  };

  const setRemoval = async (studentId: string, removal: StudentRemoval | undefined) => {
    const { error: updateError } = await supabase
      .from('students')
      .update({
        removed_at: removal ? removal.removedAt.toISOString() : null,
        removal_reason: removal?.reason ?? null,
        removal_note: removal?.note ?? '',
      })
      .eq('id', studentId);
    if (updateError) return updateError.code ?? 'error';
    setStudents((current) =>
      current.map((student) => (student.id === studentId ? { ...student, removal } : student))
    );
    return null;
  };

  // The database cancels the student's upcoming lessons; the calendar reloads them.
  const removeStudent = async (studentId: string, reason: RemovalReason, note = '') => {
    const failed = await setRemoval(studentId, { removedAt: new Date(), reason, note: note.trim() });
    return failed ? 'הסרת התלמיד נכשלה. יש לנסות שוב.' : null;
  };

  const restoreStudent = async (studentId: string) => {
    const failed = await setRemoval(studentId, undefined);
    if (!failed) return null;
    // A former student who has since joined another teacher can't be brought back.
    if (failed === 'HM005' || failed === '23505') return STUDENT_HAS_OTHER_TEACHER;
    return 'החזרת התלמיד נכשלה. יש לנסות שוב.';
  };

  return (
    <StudentsContext
      value={{
        students,
        loading,
        error,
        reload,
        refreshBalances,
        addLessonNote,
        setNoteShared,
        updateFile,
        saveTest,
        deleteTest,
        setTaskStatus,
        setStudentPrice,
        reloadStudent,
        addPayment,
        addStudent,
        removeStudent,
        restoreStudent,
      }}>
      {children}
    </StudentsContext>
  );
}

function useStudentsContext() {
  const context = useContext(StudentsContext);
  if (!context) throw new Error('useStudents must be used inside StudentsProvider');
  return context;
}

/** The teacher's current students. Removed students are left out; see useFormerStudents. */
export function useStudents(): Student[] {
  const { students } = useStudentsContext();
  return useMemo(() => students.filter((student) => !student.removal), [students]);
}

/** Students the teacher removed from their list, most recently removed first. */
export function useFormerStudents(): Student[] {
  const { students } = useStudentsContext();
  return useMemo(
    () =>
      students
        .filter((student) => student.removal)
        .sort((a, b) => b.removal!.removedAt.getTime() - a.removal!.removedAt.getTime()),
    [students]
  );
}

/** Current and former students, e.g. to name the student on a past lesson. */
export function useAllStudents(): Student[] {
  return useStudentsContext().students;
}

/** Loading state and a retry for the student list. */
export function useStudentsStatus() {
  const { loading, error, reload } = useStudentsContext();
  return { loading, error, reload };
}

/** A current or former student by id. */
export function useStudent(id: string | undefined): Student | undefined {
  return useAllStudents().find((student) => student.id === id);
}

/** Remove a student from the list (passed the test, stopped, ...). Returns an error in Hebrew, or null. */
export function useRemoveStudent() {
  return useStudentsContext().removeStudent;
}

/** Bring a former student back to the list. Returns an error in Hebrew, or null. */
export function useRestoreStudent() {
  return useStudentsContext().restoreStudent;
}

/** Add a lesson note (newest first) to a student's profile. Returns an error in Hebrew, or null. */
export function useAddLessonNote() {
  return useStudentsContext().addLessonNote;
}

/** Show or hide a lesson note in the student app. Returns an error in Hebrew, or null. */
export function useSetNoteShared() {
  return useStudentsContext().setNoteShared;
}

/** Changes to the teacher's file on a student: licence file, tests, tasks, prices. */
export function useStudentFileActions() {
  const { updateFile, saveTest, deleteTest, setTaskStatus, setStudentPrice, reloadStudent } =
    useStudentsContext();
  return { updateFile, saveTest, deleteTest, setTaskStatus, setStudentPrice, reloadStudent };
}

/** Record a payment from a student. Returns an error in Hebrew, or null. */
export function useAddPayment() {
  return useStudentsContext().addPayment;
}

/** Re-read balances from the database, e.g. after a lesson was booked or cancelled. */
export function useRefreshBalances() {
  return useStudentsContext().refreshBalances;
}

/** Add a new student; resolves to the saved student or throws StudentSaveError. */
export function useAddStudent() {
  return useStudentsContext().addStudent;
}
