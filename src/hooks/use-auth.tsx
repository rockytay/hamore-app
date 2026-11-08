import type { Session as SupabaseSession } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import type { CurrentUser } from '@/hooks/use-current-user';
import type { LicenseCategory, Transmission } from '@/hooks/use-students';
import { supabase } from '@/lib/supabase';

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

/** Who is signed in, with their profile. */
export type Session =
  | { userId: string; organizationId: string; role: 'teacher'; profile: CurrentUser }
  | { userId: string; role: 'student'; profile: StudentProfile };

/** What a new user fills in on the sign-up screen. */
export type SignUpInput = {
  role: Role;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  /**
   * Teachers only: their driving licence and teaching permit numbers, so we can check they are
   * really driving teachers. Saved on the profile; the teacher stays unverified
   * (`licenses_verified = false`) until someone checks both.
   */
  driverLicenseNumber?: string;
  teacherLicenseNumber?: string;
};

/** Created by `npm run seed:dev`; the sign-in screen offers them in development builds. */
export const SAMPLE_PASSWORD = '123456';

type ProfileRow = {
  id: string;
  role: Role;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  driver_license_number: string;
  teacher_license_number: string;
  teaching_categories: string[];
  car_model: string;
  transmission: Transmission;
  lesson_price: number;
  lesson_duration_min: number;
  debt_warnings: boolean;
  lesson_reminders: boolean;
  organization: { id: string; plan_id: string; plan_renews_at: string } | null;
};

const PROFILE_COLUMNS = '*, organization:organizations(id, plan_id, plan_renews_at)';

function toSession(row: ProfileRow): Session {
  if (row.role === 'student') {
    return {
      userId: row.id,
      role: 'student',
      profile: { firstName: row.first_name, lastName: row.last_name, phone: row.phone, email: row.email },
    };
  }
  return {
    userId: row.id,
    organizationId: row.organization?.id ?? '',
    role: 'teacher',
    profile: {
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      city: row.city,
      driverLicenseNumber: row.driver_license_number,
      teacherLicenseNumber: row.teacher_license_number,
      teachingCategories: row.teaching_categories as LicenseCategory[],
      carModel: row.car_model,
      transmission: row.transmission,
      lessonPrice: row.lesson_price,
      lessonDurationMin: row.lesson_duration_min,
      settings: { debtWarnings: row.debt_warnings, lessonReminders: row.lesson_reminders },
      subscription: {
        planId: row.organization?.plan_id ?? 'basic',
        renewsAt: new Date(row.organization?.plan_renews_at ?? Date.now()),
      },
    },
  };
}

/** The editable teacher fields, as profile columns. Email, role and organization are not editable here. */
function toProfileColumns(changes: Partial<CurrentUser>) {
  const columns: Record<string, unknown> = {};
  if (changes.firstName !== undefined) columns.first_name = changes.firstName;
  if (changes.lastName !== undefined) columns.last_name = changes.lastName;
  if (changes.phone !== undefined) columns.phone = changes.phone;
  if (changes.city !== undefined) columns.city = changes.city;
  if (changes.driverLicenseNumber !== undefined) columns.driver_license_number = changes.driverLicenseNumber;
  if (changes.teacherLicenseNumber !== undefined) columns.teacher_license_number = changes.teacherLicenseNumber;
  if (changes.teachingCategories !== undefined) columns.teaching_categories = changes.teachingCategories;
  if (changes.carModel !== undefined) columns.car_model = changes.carModel;
  if (changes.transmission !== undefined) columns.transmission = changes.transmission;
  if (changes.lessonPrice !== undefined) columns.lesson_price = changes.lessonPrice;
  if (changes.lessonDurationMin !== undefined) columns.lesson_duration_min = changes.lessonDurationMin;
  if (changes.settings !== undefined) {
    columns.debt_warnings = changes.settings.debtWarnings;
    columns.lesson_reminders = changes.settings.lessonReminders;
  }
  return columns;
}

/** Supabase's English auth errors, in Hebrew. */
function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'האימייל או הסיסמה שגויים.';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'כבר קיים חשבון עם כתובת האימייל הזו.';
  }
  if (text.includes('email not confirmed')) return 'יש לאשר את כתובת האימייל לפני ההתחברות.';
  if (text.includes('password')) return 'הסיסמה חלשה מדי. יש לבחור סיסמה ארוכה יותר.';
  if (text.includes('network') || text.includes('fetch')) return 'אין חיבור לשרת. יש לבדוק את החיבור לאינטרנט.';
  return 'אירעה שגיאה. יש לנסות שוב.';
}

type AuthContextValue = {
  /** True until the saved session (if any) has been checked on launch. */
  loading: boolean;
  session: Session | null;
  /** Returns an error message in Hebrew, or null when signed in. */
  signIn: (role: Role, email: string, password: string) => Promise<string | null>;
  /** Creates the account and signs in. Returns an error message in Hebrew, or null on success. */
  signUp: (input: SignUpInput) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Saves the teacher's details. Returns an error message in Hebrew, or null on success. */
  updateTeacher: (changes: Partial<CurrentUser>) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Signs users in and out with Supabase and keeps the signed-in profile for the whole app. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string): Promise<Session | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .single<ProfileRow>();
    if (error || !data) return null;
    return toSession(data);
  }, []);

  // Restore the saved session on launch, then follow sign-in, sign-out and token refreshes.
  useEffect(() => {
    const apply = (next: SupabaseSession | null) => {
      setAuthSession(next);
      if (!next) {
        setSession(null);
        setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => apply(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = authSession?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadProfile(userId).then((loaded) => {
      if (cancelled) return;
      setSession(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  const signIn: AuthContextValue['signIn'] = async (role, email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return translateAuthError(error.message);

    const loaded = await loadProfile(data.user.id);
    if (!loaded) {
      await supabase.auth.signOut();
      return 'לא נמצא פרופיל לחשבון הזה.';
    }
    if (loaded.role !== role) {
      await supabase.auth.signOut();
      return `החשבון הזה רשום כ${ROLE_LABELS[loaded.role]}. יש לבחור "${ROLE_LABELS[loaded.role]}" ולנסות שוב.`;
    }
    setSession(loaded);
    return null;
  };

  const signUp: AuthContextValue['signUp'] = async (input) => {
    // The database creates the profile (and, for teachers, the organization and
    // default lesson types) from this metadata. See supabase/migrations.
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          role: input.role,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          phone: input.phone.trim(),
          driver_license_number: input.driverLicenseNumber ?? '',
          teacher_license_number: input.teacherLicenseNumber ?? '',
        },
      },
    });
    if (error) return translateAuthError(error.message);
    // Email confirmation is off locally. If it is on (hosted project), there is no session yet.
    if (!data.session) return 'נשלח אליכם אימייל לאישור החשבון. אחרי האישור אפשר להתחבר.';
    return null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updateTeacher: AuthContextValue['updateTeacher'] = async (changes) => {
    if (session?.role !== 'teacher') return 'רק מורה יכול לעדכן את הפרטים האלה.';

    // Show the change right away, and put it back if saving fails.
    const previous = session;
    setSession({ ...session, profile: { ...session.profile, ...changes } });

    const columns = toProfileColumns(changes);
    const saves = [];
    if (Object.keys(columns).length > 0) {
      saves.push(supabase.from('profiles').update(columns).eq('id', session.userId));
    }
    if (changes.subscription && changes.subscription.planId !== previous.profile.subscription.planId) {
      saves.push(
        supabase
          .from('organizations')
          .update({ plan_id: changes.subscription.planId })
          .eq('id', session.organizationId)
      );
    }

    const results = await Promise.all(saves);
    if (results.some((result) => result.error)) {
      setSession(previous);
      return 'שמירת הפרטים נכשלה. יש לנסות שוב.';
    }
    return null;
  };

  const value: AuthContextValue = { loading, session, signIn, signUp, signOut, updateTeacher };

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
