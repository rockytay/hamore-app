import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { useAddUpdate } from '@/hooks/use-updates';

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
  name: string;
  phone: string;
  licenseCategory: LicenseCategory;
  transmission: Transmission;
  lessonsCompleted: number;
  /** Notes from past lessons, newest first. */
  lessonNotes: LessonNote[];
  /** In shekels: positive is prepaid credit, negative is debt to the teacher. */
  balance: number;
  /** Israeli ID number (teudat zehut), needed for the student's licence file. */
  idNumber?: string;
  /** Passed the theory test. */
  theoryPassed?: boolean;
  createdAt: Date;
};

/** What the teacher fills in when adding a student; the rest is filled in automatically. */
export type NewStudent = Omit<Student, 'id' | 'createdAt' | 'lessonNotes'> & {
  /** Optional first note, e.g. the student's driving experience so far. */
  firstNote?: string;
};

export type PaymentStatus = 'credit' | 'even' | 'debt';

export function getPaymentStatus(balance: number): PaymentStatus {
  if (balance > 0) return 'credit';
  if (balance < 0) return 'debt';
  return 'even';
}

/** Show example students. Set to false to see an empty student list. */
const SHOW_SAMPLE_STUDENTS = true;

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

const SAMPLE_STUDENTS: Student[] = ([
  {
    id: '1',
    name: 'דנה כהן',
    phone: '050-1234567',
    licenseCategory: 'B',
    transmission: 'automatic',
    lessonsCompleted: 2,
    lessonNotes: [
      { id: '1', date: daysAgo(3), text: 'שיעור שני. לתרגל התחלת נסיעה ועצירה חלקה, ולשים לב למראות לפני יציאה מהחניה.' },
      { id: '2', date: daysAgo(7), text: 'שיעור ראשון, היכרות עם הרכב. לחזור על תפעול האיתות והמגבים.' },
    ],
    balance: 300,
  },
  {
    id: '2',
    name: 'יוסי לוי',
    phone: '052-2345678',
    licenseCategory: 'B',
    transmission: 'manual',
    lessonsCompleted: 14,
    lessonNotes: [
      { id: '1', date: daysAgo(2), text: 'שליטה טובה במצמד. לשפר עצירה והתחלת נסיעה בעלייה בלי להידרדר אחורה.' },
      { id: '2', date: daysAgo(6), text: 'כניסה לכיכרות – לזכור לתת זכות קדימה ולאותת ביציאה.' },
      { id: '3', date: daysAgo(10), text: 'לעבוד על החלפת הילוכים בזמן, נוטה להישאר בהילוך שני יותר מדי.' },
    ],
    balance: 0,
  },
  {
    id: '3',
    name: 'נועה מזרחי',
    phone: '054-3456789',
    licenseCategory: 'B',
    transmission: 'automatic',
    lessonsCompleted: 22,
    lessonNotes: [
      { id: '1', date: daysAgo(1), text: 'מוכנה כמעט לטסט. לתרגל חניה במקביל ונסיעה בכביש מהיר עם שמירת מרחק.' },
      { id: '2', date: daysAgo(5), text: 'לשפר הסתכלות בשטחים מתים לפני החלפת נתיב.' },
    ],
    balance: 150,
  },
  {
    id: '4',
    name: 'אבי פרץ',
    phone: '053-4567890',
    licenseCategory: 'A2',
    transmission: 'manual',
    lessonsCompleted: 9,
    lessonNotes: [
      { id: '1', date: daysAgo(3), text: 'נסיעה איטית ושמירת שיווי משקל במגרש טובה. לעבוד על בלימה בפנייה.' },
      { id: '2', date: daysAgo(8), text: 'לתרגל שמונה במגרש ומבט קדימה בזמן פנייה.' },
    ],
    balance: -450,
  },
  {
    id: '5',
    name: 'מיכל אברהם',
    phone: '058-5678901',
    licenseCategory: 'B',
    transmission: 'automatic',
    lessonsCompleted: 6,
    lessonNotes: [
      { id: '1', date: daysAgo(4), text: 'לשפר מיקום בנתיב בפניות שמאלה ולשים לב להולכי רגל במעברי חצייה.' },
    ],
    balance: 0,
  },
  {
    id: '6',
    name: 'עומר ביטון',
    phone: '050-6789012',
    licenseCategory: 'C1',
    transmission: 'manual',
    lessonsCompleted: 17,
    lessonNotes: [
      { id: '1', date: daysAgo(2), text: 'נסיעה לאחור עם מראות בלבד – התקדמות יפה. לתרגל פניות חדות עם רכב ארוך.' },
      { id: '2', date: daysAgo(9), text: 'לשים לב לגובה הרכב במעברים תחתיים ולתכנן בלימה מוקדם יותר.' },
    ],
    balance: 200,
  },
  {
    id: '7',
    name: 'שירה גולן',
    phone: '052-7890123',
    licenseCategory: 'B',
    transmission: 'automatic',
    lessonsCompleted: 0,
    lessonNotes: [],
    balance: 0,
  },
  {
    id: '8',
    name: 'רון דהן',
    phone: '054-8901234',
    licenseCategory: 'A1',
    transmission: 'manual',
    lessonsCompleted: 11,
    lessonNotes: [
      { id: '1', date: daysAgo(5), text: 'לשפר הסתכלות למרחק ותכנון נתיב בכביש בין-עירוני.' },
    ],
    balance: -150,
  },
] satisfies Omit<Student, 'createdAt'>[]).map((student, index) => ({
  ...student,
  theoryPassed: student.lessonsCompleted > 0,
  createdAt: daysAgo(30 + index * 7),
}));

function createStudentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

type StudentsContextValue = {
  students: Student[];
  addLessonNote: (studentId: string, text: string) => void;
  addStudent: (input: NewStudent) => Student;
};

const StudentsContext = createContext<StudentsContextValue | null>(null);

/**
 * Holds the teacher's students for the whole app. Must be inside UpdatesProvider.
 * The app is not connected to a backend yet, so changes are kept in memory only.
 * When the database is connected, addStudent and addLessonNote become API calls
 * and the new id comes from the server.
 */
export function StudentsProvider({ children }: PropsWithChildren) {
  const addUpdate = useAddUpdate();
  const [students, setStudents] = useState<Student[]>(() =>
    SHOW_SAMPLE_STUDENTS ? SAMPLE_STUDENTS : []
  );

  const addStudent = ({ firstNote, ...input }: NewStudent) => {
    const createdAt = new Date();
    const student: Student = {
      ...input,
      id: createStudentId(),
      createdAt,
      lessonNotes: firstNote ? [{ id: createStudentId(), date: createdAt, text: firstNote }] : [],
    };
    setStudents((current) => [student, ...current]);
    addUpdate({ kind: 'new-student', studentName: student.name });
    return student;
  };

  const addLessonNote = (studentId: string, text: string) => {
    const note: LessonNote = {
      id: createStudentId(),
      date: new Date(),
      text,
    };
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId
          ? { ...student, lessonNotes: [note, ...student.lessonNotes] }
          : student
      )
    );
  };

  return <StudentsContext value={{ students, addLessonNote, addStudent }}>{children}</StudentsContext>;
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

export function useStudent(id: string | undefined): Student | undefined {
  return useStudents().find((student) => student.id === id);
}

/** Add a lesson note (newest first) to a student's profile. */
export function useAddLessonNote() {
  return useStudentsContext().addLessonNote;
}

/** Add a new student; returns the saved student. */
export function useAddStudent() {
  return useStudentsContext().addStudent;
}
