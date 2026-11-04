import { useAuth, useSession } from '@/hooks/use-auth';
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

/** The teacher who is signed in, or null if nobody is or a student is signed in. */
export function useCurrentUser(): CurrentUser | null {
  const session = useSession();
  return session?.role === 'teacher' ? session.profile : null;
}

/** Update the signed-in teacher's details, or sign out. */
export function useCurrentUserActions() {
  const { updateTeacher, signOut } = useAuth();
  return { updateUser: updateTeacher, signOut };
}
