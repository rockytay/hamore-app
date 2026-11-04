import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { CurrentUser } from '@/hooks/use-current-user';

export type Role = 'teacher' | 'student';

export const ROLE_LABELS: Record<Role, string> = {
  teacher: 'מורה',
  student: 'תלמיד/ה',
};

/** A student's own account. The student side of the app is still being built. */
export type StudentProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

type Account =
  | { id: string; role: 'teacher'; password: string; profile: CurrentUser }
  | { id: string; role: 'student'; password: string; profile: StudentProfile };

/** Who is signed in, with their profile. */
export type Session =
  | { role: 'teacher'; profile: CurrentUser }
  | { role: 'student'; profile: StudentProfile };

/** What a new user fills in on the sign-up screen. */
export type SignUpInput = {
  role: Role;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
};

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/** Sample accounts to sign in with until the app has a backend. */
export const SAMPLE_PASSWORD = '123456';

const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: 'teacher-1',
    role: 'teacher',
    password: SAMPLE_PASSWORD,
    profile: {
      firstName: 'ישראל',
      lastName: 'ישראלי',
      phone: '050-9876543',
      email: 'israel@example.com',
      city: 'תל אביב',
      teacherLicenseNumber: '123456',
      teachingCategories: ['B', 'A2', 'A1'],
      carModel: 'מאזדה 3',
      transmission: 'automatic',
      lessonPrice: 160,
      lessonDurationMin: 40,
      settings: { debtWarnings: true, lessonReminders: true },
      subscription: { planId: 'basic', renewsAt: daysFromNow(12) },
    },
  },
  {
    id: 'student-1',
    role: 'student',
    password: SAMPLE_PASSWORD,
    profile: {
      firstName: 'דנה',
      lastName: 'כהן',
      phone: '050-1234567',
      email: 'dana@example.com',
    },
  },
];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createAccountId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A new teacher's details; the professional details are filled in later in the profile. */
function newTeacherProfile(input: SignUpInput): CurrentUser {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    city: '',
    teacherLicenseNumber: '',
    teachingCategories: ['B'],
    carModel: '',
    transmission: 'manual',
    lessonPrice: 0,
    lessonDurationMin: 40,
    settings: { debtWarnings: true, lessonReminders: true },
    subscription: { planId: 'basic', renewsAt: daysFromNow(30) },
  };
}

type AuthContextValue = {
  session: Session | null;
  /** Returns an error message in Hebrew, or null when signed in. */
  signIn: (role: Role, email: string, password: string) => string | null;
  /** Creates the account and signs in. Returns an error message in Hebrew, or null on success. */
  signUp: (input: SignUpInput) => string | null;
  signOut: () => void;
  updateTeacher: (changes: Partial<CurrentUser>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the accounts and who is signed in, for the whole app.
 * The app is not connected to a backend yet, so accounts are kept in memory only
 * and passwords are stored as plain text. Replace this with real auth before release.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [accounts, setAccounts] = useState<Account[]>(SAMPLE_ACCOUNTS);
  const [accountId, setAccountId] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const session: Session | null = account
    ? account.role === 'teacher'
      ? { role: 'teacher', profile: account.profile }
      : { role: 'student', profile: account.profile }
    : null;

  const findByEmail = (email: string) =>
    accounts.find((a) => normalizeEmail(a.profile.email) === normalizeEmail(email));

  const signIn: AuthContextValue['signIn'] = (role, email, password) => {
    const found = findByEmail(email);
    if (!found || found.password !== password) return 'האימייל או הסיסמה שגויים.';
    if (found.role !== role) {
      return `החשבון הזה רשום כ${ROLE_LABELS[found.role]}. יש לבחור "${ROLE_LABELS[found.role]}" ולנסות שוב.`;
    }
    setAccountId(found.id);
    return null;
  };

  const signUp: AuthContextValue['signUp'] = (input) => {
    if (findByEmail(input.email)) return 'כבר קיים חשבון עם כתובת האימייל הזו.';
    const id = createAccountId();
    const newAccount: Account =
      input.role === 'teacher'
        ? { id, role: 'teacher', password: input.password, profile: newTeacherProfile(input) }
        : {
            id,
            role: 'student',
            password: input.password,
            profile: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              email: input.email,
            },
          };
    setAccounts((current) => [...current, newAccount]);
    setAccountId(id);
    return null;
  };

  const updateTeacher: AuthContextValue['updateTeacher'] = (changes) =>
    setAccounts((current) =>
      current.map((a) =>
        a.id === accountId && a.role === 'teacher' ? { ...a, profile: { ...a.profile, ...changes } } : a
      )
    );

  const value: AuthContextValue = {
    session,
    signIn,
    signUp,
    signOut: () => setAccountId(null),
    updateTeacher,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Who is signed in, or null if nobody is. */
export function useSession(): Session | null {
  return useAuth().session;
}
