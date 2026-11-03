import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { LicenseCategory, Transmission } from '@/hooks/use-students';

/** Lesson lengths the teacher can choose from, in minutes. */
export const LESSON_DURATIONS = [40, 45, 60, 80, 90];

export type SubscriptionPlan = {
  id: string;
  name: string;
  /** Monthly price in shekels. */
  monthlyPrice: number;
  /** Most students the teacher can have on this plan. */
  maxStudents: number;
};

/** The monthly plans, from smallest to largest. */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'basic', name: 'בסיסי', monthlyPrice: 100, maxStudents: 30 },
  { id: 'pro', name: 'מקצועי', monthlyPrice: 150, maxStudents: 60 },
  { id: 'school', name: 'בית ספר', monthlyPrice: 220, maxStudents: 100 },
];

export function getPlan(planId: string): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? SUBSCRIPTION_PLANS[0];
}

export type Subscription = {
  planId: string;
  /** Next monthly charge. */
  renewsAt: Date;
};

export type TeacherSettings = {
  /** Warn before scheduling a lesson for a student who owes money. */
  debtWarnings: boolean;
  /** Remind the teacher before each lesson (needs device notifications, not connected yet). */
  lessonReminders: boolean;
};

export type CurrentUser = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  teacherLicenseNumber: string;
  teachingCategories: LicenseCategory[];
  carModel: string;
  transmission: Transmission;
  /** In shekels. */
  lessonPrice: number;
  /** Default length of a new lesson in the calendar. */
  lessonDurationMin: number;
  settings: TeacherSettings;
  subscription: Subscription;
};

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/** Sample teacher shown until the app has real sign-in. Set to null to start signed out. */
const SAMPLE_USER: CurrentUser | null = {
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
};

type CurrentUserContextValue = {
  user: CurrentUser | null;
  updateUser: (changes: Partial<CurrentUser>) => void;
  signIn: () => void;
  signOut: () => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/**
 * Holds the signed-in teacher for the whole app.
 * The app is not connected to a backend yet, so sign-in uses the sample teacher
 * and changes are kept in memory only.
 */
export function CurrentUserProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<CurrentUser | null>(SAMPLE_USER);

  const value: CurrentUserContextValue = {
    user,
    updateUser: (changes) => setUser((current) => (current ? { ...current, ...changes } : current)),
    signIn: () => setUser(SAMPLE_USER),
    signOut: () => setUser(null),
  };

  return <CurrentUserContext value={value}>{children}</CurrentUserContext>;
}

function useCurrentUserContext() {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error('useCurrentUser must be used inside CurrentUserProvider');
  return context;
}

/** The teacher who is signed in to the app, or null if nobody is. */
export function useCurrentUser(): CurrentUser | null {
  return useCurrentUserContext().user;
}

/** Update, sign in or sign out the current teacher. */
export function useCurrentUserActions() {
  const { updateUser, signIn, signOut } = useCurrentUserContext();
  return { updateUser, signIn, signOut };
}
