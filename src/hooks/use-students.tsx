import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/hooks/use-auth';
import { useAddUpdate } from '@/hooks/use-updates';
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

export type NewPayment = { amount: number; method: PaymentMethod; note?: string };

/**
 * What the teacher fills in when adding a student; the rest is filled in automatically.
 * Here `lessonsCompleted` and `balance` are what the student brings from before joining.
 */
export type NewStudent = Omit<Student, 'id' | 'name' | 'createdAt' | 'lessonNotes' | 'payments'> & {
  /** Optional first note, e.g. the student's driving experience so far. */
  firstNote?: string;
};

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

type LessonNoteRow = { id: string; body: string; created_at: string };

type PaymentRow = { id: string; amount: number; method: PaymentMethod; paid_at: string; note: string };

type StudentRow = {
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
  lesson_notes: LessonNoteRow[];
  payments: PaymentRow[];
};

type BalanceRow = { student_id: string; lessons_completed: number; balance: number };

const STUDENT_COLUMNS =
  '*, lesson_notes(id, body, created_at), payments(id, amount, method, paid_at, note)';
const PAYMENT_COLUMNS = 'id, amount, method, paid_at, note';

function toNote(row: LessonNoteRow): LessonNote {
  return { id: row.id, date: new Date(row.created_at), text: row.body };
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

async function fetchBalances() {
  const { data, error } = await supabase
    .from('student_balances')
    .select('student_id, lessons_completed, balance')
    .returns<BalanceRow[]>();
  return error ? null : data;
}

/** Thrown by addStudent with a message in Hebrew that can be shown as-is. */
export class StudentSaveError extends Error {
  constructor(
    message: string,
    /** The form field the error belongs to, if any. */
    readonly field?: 'phone'
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
  addLessonNote: (studentId: string, text: string) => Promise<string | null>;
  /** Returns an error message in Hebrew, or null on success. */
  addPayment: (studentId: string, payment: NewPayment) => Promise<string | null>;
  /** Saves the student and returns it. Throws StudentSaveError. */
  addStudent: (input: NewStudent) => Promise<Student>;
};

const StudentsContext = createContext<StudentsContextValue | null>(null);

/**
 * Holds the signed-in teacher's students for the whole app. Must be inside AuthProvider
 * and UpdatesProvider. Row-level security in the database makes sure a teacher only
 * ever receives their own organization's students.
 */
export function StudentsProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const addUpdate = useAddUpdate();
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

  const addStudent = async ({ firstNote, ...input }: NewStudent): Promise<Student> => {
    const { data, error: insertError } = await supabase
      .from('students')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        id_number: input.idNumber ?? null,
        license_category: input.licenseCategory,
        transmission: input.transmission,
        theory_passed: input.theoryPassed ?? false,
        prior_lessons: input.lessonsCompleted,
        opening_balance: input.balance,
      })
      .select('*')
      .single<Omit<StudentRow, 'lesson_notes' | 'payments'>>();

    if (insertError || !data) {
      if (insertError?.code === '23505') {
        throw new StudentSaveError('כבר קיים תלמיד עם מספר הטלפון הזה', 'phone');
      }
      throw new StudentSaveError('שמירת התלמיד נכשלה. יש לנסות שוב.');
    }

    let notes: LessonNoteRow[] = [];
    if (firstNote) {
      const note = await supabase
        .from('lesson_notes')
        .insert({ student_id: data.id, body: firstNote })
        .select('id, body, created_at')
        .single<LessonNoteRow>();
      // The student is saved either way; a failed first note is not worth blocking on.
      if (note.data) notes = [note.data];
    }

    // A new student has no lessons or payments yet, so the opening values are the balance.
    const student = toStudent({ ...data, lesson_notes: notes, payments: [] });
    setStudents((current) => [student, ...current]);
    addUpdate({ kind: 'new-student', studentName: student.name });
    return student;
  };

  const addLessonNote = async (studentId: string, text: string): Promise<string | null> => {
    const { data, error: insertError } = await supabase
      .from('lesson_notes')
      .insert({ student_id: studentId, body: text })
      .select('id, body, created_at')
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

  return (
    <StudentsContext
      value={{ students, loading, error, reload, refreshBalances, addLessonNote, addPayment, addStudent }}>
      {children}
    </StudentsContext>
  );
}

function useStudentsContext() {
  const context = useContext(StudentsContext);
  if (!context) throw new Error('useStudents must be used inside StudentsProvider');
  return context;
}

/** The teacher's students. */
export function useStudents(): Student[] {
  return useStudentsContext().students;
}

/** Loading state and a retry for the student list. */
export function useStudentsStatus() {
  const { loading, error, reload } = useStudentsContext();
  return { loading, error, reload };
}

export function useStudent(id: string | undefined): Student | undefined {
  return useStudents().find((student) => student.id === id);
}

/** Add a lesson note (newest first) to a student's profile. Returns an error in Hebrew, or null. */
export function useAddLessonNote() {
  return useStudentsContext().addLessonNote;
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
