import type { Session as SupabaseSession } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  toDayString,
  type AvailabilityWindow,
  type Language,
  type PriorLicense,
  type ReferralSource,
  type ReminderChannel,
} from '@/hooks/student-file';
import type { CurrentUser } from '@/hooks/use-current-user';
import type { LicenseCategory, PaymentMethod, Transmission } from '@/hooks/use-students';
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
  /** Students only: for the age eligibility checks and the parent contact rule. */
  birthDate?: Date;
  preferredLanguage?: Language;
  /** Students only: agreed that their details are kept (privacy law). Required. */
  privacyConsent?: boolean;
  marketingConsent?: boolean;
  /** Students only: required. Copied into the teacher's file when the teacher adds them. */
  idNumber?: string;
  /** Students only: the default pickup address. Required. */
  address?: { street: string; houseNumber: string; city: string; pickupNotes: string };
  /** Students under 18 only: a parent to contact. Required for them. */
  parent?: { name: string; phone: string; relation: string };
  /**
   * Students only: their side of the licence file. The teacher's add-student form starts
   * from it; whatever the teacher leaves empty is copied into their file.
   */
  licence?: {
    category: LicenseCategory;
    transmission: Transmission;
    greenFormIssuedAt: Date | null;
    eyeTestDone: boolean;
    needsGlasses: boolean;
    healthDeclarationDone: boolean;
    theoryPassedAt: Date | null;
    priorLicense: PriorLicense;
    specialRestrictions: string;
  };
  preferredPaymentMethod?: PaymentMethod | null;
  referralSource?: ReferralSource | null;
  reminderChannel?: ReminderChannel;
  reminderHoursBefore?: number;
  /** When the student can usually take lessons. */
  availability?: Omit<AvailabilityWindow, 'id'>[];
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
  green_form_valid_years: number;
  theory_valid_years: number;
  organization:{ id: string; plan_id: string; plan_renews_at: string } | null;
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
      validity: {
        greenFormValidYears: row.green_form_valid_years ?? 5,
        theoryValidYears: row.theory_valid_years ?? 5,
      },
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
  if (changes.validity !== undefined) {
    columns.green_form_valid_years = changes.validity.greenFormValidYears;
    columns.theory_valid_years = changes.validity.theoryValidYears;
  }
  return columns;
}

/** Supabase's English auth errors, in Hebrew. Logs the original error in development. */
function translateAuthError(error: { message: string; code?: string }): string {
  if (__DEV__) console.warn('Supabase auth error:', error.code ?? '(no code)', error.message);
  const text = error.message.toLowerCase();
  const code = error.code ?? '';
  if (code === 'over_email_send_rate_limit' || text.includes('email rate limit')) {
    return 'נשלחו יותר מדי אימיילים בזמן קצר. יש לנסות שוב מאוחר יותר.';
  }
  if (text.includes('error sending') && text.includes('email')) {
    return 'לא הצלחנו לשלוח את אימייל האישור. יש לנסות שוב מאוחר יותר.';
  }
  if (code === 'over_request_rate_limit' || text.includes('for security purposes')) {
    return 'יותר מדי ניסיונות. יש להמתין דקה ולנסות שוב.';
  }
  if (code === 'email_address_invalid' || text.includes('is invalid')) {
    return 'כתובת האימייל נדחתה. יש להשתמש בכתובת אימייל אמיתית.';
  }
  if (code === 'signup_disabled' || text.includes('signups not allowed')) {
    return 'ההרשמה סגורה כרגע.';
  }
  if (code === 'unexpected_failure' || text.includes('database error')) {
    return 'שמירת החשבון נכשלה בשרת. יש לנסות שוב.';
  }
  if (text.includes('invalid login credentials')) return 'האימייל או הסיסמה שגויים.';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'כבר קיים חשבון עם כתובת האימייל הזו.';
  }
  if (text.includes('email not confirmed')) return 'יש לאשר את כתובת האימייל לפני ההתחברות.';
  if (code === 'weak_password' && text.includes('pwned')) {
    return 'הסיסמה הזו הופיעה בדליפות מידע מאתרים אחרים. יש לבחור סיסמה אחרת.';
  }
  if (code === 'weak_password' || text.includes('password')) {
    return 'הסיסמה חלשה מדי. יש לבחור לפחות 8 תווים עם אותיות וספרות.';
  }
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
  /**
   * Checks the password, saves the feedback and deletes the account for good, then signs
   * out. Returns an error message in Hebrew, or null once deleted.
   */
  deleteAccount: (password: string, feedback: DeletionFeedback) => Promise<string | null>;
};

/** Why the user deletes their account. Kept for the Hamore team; see supabase/migrations. */
export type DeletionFeedback =
  | { role: 'student'; reason: 'passed_test' | 'other'; details: string; improvements: string }
  | { role: 'teacher'; satisfied: boolean; details: string; improvements: string };

const AuthContext = createContext<AuthContextValue | null>(null);

/** Signs users in and out with Supabase and keeps the signed-in profile for the whole app. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The role picked on the sign-in screen, while `signIn` checks it. Supabase reports the new
   * session before that check, so without this the app would open the other role's screens for a
   * moment, then sign out and show a fresh sign-in screen with no error.
   */
  const requiredRole = useRef<Role | null>(null);

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
      // Wrong role for what was picked: `signIn` signs out and shows the error.
      if (loaded && requiredRole.current && loaded.role !== requiredRole.current) return;
      setSession(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  const signIn: AuthContextValue['signIn'] = async (role, email, password) => {
    // Stays set after a wrong-role attempt, so a late profile load cannot open the app.
    requiredRole.current = role;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return translateAuthError(error);

    const loaded = await loadProfile(data.user.id);
    if (!loaded) {
      await supabase.auth.signOut();
      return 'לא נמצא פרופיל לחשבון הזה.';
    }
    if (loaded.role !== role) {
      await supabase.auth.signOut();
      return `החשבון הזה רשום כ${ROLE_LABELS[loaded.role]}. יש לבחור "${ROLE_LABELS[loaded.role]}" ולנסות שוב.`;
    }
    requiredRole.current = null;
    setSession(loaded);
    return null;
  };

  const signUp: AuthContextValue['signUp'] = async (input) => {
    requiredRole.current = null;
    // The database creates the profile (and, for teachers, the organization and
    // default lesson types) from this metadata. See supabase/migrations.
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        // The confirmation email opens the app, which finishes signing in.
        // hamoreapp://auth/callback in a build; an exp:// address in Expo Go.
        emailRedirectTo: Linking.createURL('auth/callback'),
        data: {
          role: input.role,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          phone: input.phone.trim(),
          driver_license_number: input.driverLicenseNumber ?? '',
          teacher_license_number: input.teacherLicenseNumber ?? '',
          birth_date: toDayString(input.birthDate ?? null) ?? '',
          preferred_language: input.preferredLanguage ?? 'he',
          privacy_consent: input.privacyConsent ? 'true' : 'false',
          marketing_consent: input.marketingConsent ? 'true' : 'false',
          id_number: input.idNumber ?? '',
          address_street: input.address?.street.trim() ?? '',
          address_house_number: input.address?.houseNumber.trim() ?? '',
          address_city: input.address?.city.trim() ?? '',
          address_pickup_notes: input.address?.pickupNotes.trim() ?? '',
          parent_name: input.parent?.name.trim() ?? '',
          parent_phone: input.parent?.phone.trim() ?? '',
          parent_relation: input.parent?.relation.trim() ?? '',
          ...(input.licence && {
            license_category: input.licence.category,
            transmission: input.licence.transmission,
            green_form_issued_at: toDayString(input.licence.greenFormIssuedAt) ?? '',
            eye_test_done: input.licence.eyeTestDone ? 'true' : 'false',
            needs_glasses: input.licence.needsGlasses ? 'true' : 'false',
            health_declaration_done: input.licence.healthDeclarationDone ? 'true' : 'false',
            theory_passed_at: toDayString(input.licence.theoryPassedAt) ?? '',
            prior_license: input.licence.priorLicense,
            special_restrictions: input.licence.specialRestrictions.trim(),
          }),
          preferred_payment_method: input.preferredPaymentMethod ?? '',
          referral_source: input.referralSource ?? '',
          reminder_channel: input.reminderChannel ?? 'push',
          reminder_hours_before: String(input.reminderHoursBefore ?? 24),
          availability: (input.availability ?? []).map((window) => ({
            weekday: window.weekday,
            start_min: window.startMin,
            end_min: window.endMin,
          })),
        },
      },
    });
    if (error) return translateAuthError(error);
    // Email confirmation is off locally. If it is on (hosted project), there is no session yet.
    if (!data.session) {
      return 'נשלח אליכם אימייל לאישור החשבון. פתחו את הקישור שבאימייל בטלפון הזה כדי להיכנס לאפליקציה.';
    }
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

  const deleteAccount: AuthContextValue['deleteAccount'] = async (password, feedback) => {
    if (!session) return 'אין משתמש מחובר.';
    // Deleting can't be undone, so the password is checked first.
    requiredRole.current = session.role;
    const check = await supabase.auth.signInWithPassword({ email: session.profile.email, password });
    if (check.error) {
      return check.error.message.toLowerCase().includes('invalid login credentials')
        ? 'הסיסמה שגויה.'
        : translateAuthError(check.error);
    }

    const { error } = await supabase.rpc('delete_my_account', {
      p_reason: feedback.role === 'student' ? feedback.reason : null,
      p_satisfied: feedback.role === 'teacher' ? feedback.satisfied : null,
      p_details: feedback.details.trim(),
      p_improvements: feedback.improvements.trim(),
      p_app_version: Constants.expoConfig?.version ?? '',
      p_platform: Platform.OS,
    });
    if (error) {
      if (__DEV__) console.warn('Delete account failed:', error.code, error.message);
      if (error.code === 'HM021') return 'יש להשלים את השאלון לפני המחיקה.';
      return 'מחיקת החשבון נכשלה. יש לבדוק את החיבור ולנסות שוב.';
    }

    // The login no longer exists on the server; clear it from this device.
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    return null;
  };

  const value: AuthContextValue = { loading, session, signIn, signUp, signOut, updateTeacher, deleteAccount };

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
