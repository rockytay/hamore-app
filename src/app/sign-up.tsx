import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AuthScreen,
  authFormStyles,
  FormError,
  FormField,
  FormFooterLink,
  PrimaryButton,
  RoleToggle,
} from '@/components/auth-form';
import { ChoiceChips, optionsOf, ToggleRow } from '@/components/form-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getAge, LANGUAGE_LABELS, parseTypedDate, type Language } from '@/hooks/student-file';
import { useAuth, type Role, type SignUpInput } from '@/hooks/use-auth';
import { formatPhone, isValidPhone } from '@/hooks/use-students';

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
});

const MIN_PASSWORD_LENGTH = 6;

type Draft = Pick<SignUpInput, 'firstName' | 'lastName' | 'phone' | 'email' | 'password'> & {
  driverLicenseNumber: string;
  teacherLicenseNumber: string;
  confirmPassword: string;
  /** Students: typed as DD/MM/YYYY. */
  birthDate: string;
  language: Language;
  privacyConsent: boolean;
  marketingConsent: boolean;
};

const EMPTY_DRAFT: Draft = {
  firstName: '',
  lastName: '',
  driverLicenseNumber: '',
  teacherLicenseNumber: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  birthDate: '',
  language: 'he',
  privacyConsent: false,
  marketingConsent: false,
};

/** Students younger than this can't start anything yet; older than this is a typo. */
const MIN_STUDENT_AGE = 14;
const MAX_STUDENT_AGE = 100;

/** Returns an error message in Hebrew, or null if the account can be created. */
function validate(draft: Draft, role: Role) {
  if (!draft.firstName.trim() || !draft.lastName.trim()) return 'יש למלא שם פרטי ושם משפחה.';
  if (role === 'student') {
    const born = parseTypedDate(draft.birthDate);
    if (!born) return 'יש להזין תאריך לידה תקין (DD/MM/YYYY).';
    const age = getAge(born);
    if (age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE) return 'תאריך הלידה אינו נראה תקין.';
  }
  if (role === 'teacher' && !draft.driverLicenseNumber) {
    return 'יש להזין מספר רישיון נהיגה, כדי שנוכל לאמת שאתם מורים לנהיגה.';
  }
  if (role === 'teacher' && !draft.teacherLicenseNumber) {
    return 'יש להזין מספר היתר הוראה, כדי שנוכל לאמת שאתם מורים לנהיגה.';
  }
  if (!isValidPhone(draft.phone)) return 'יש להזין מספר נייד תקין (05X-XXXXXXX).';
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'כתובת האימייל אינה תקינה.';
  if (draft.password.length < MIN_PASSWORD_LENGTH) {
    return `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.`;
  }
  if (draft.password !== draft.confirmPassword) return 'הסיסמאות אינן תואמות.';
  if (role === 'student' && !draft.privacyConsent) {
    return 'יש לאשר את שמירת הפרטים כדי ליצור חשבון.';
  }
  return null;
}

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>(params.role === 'student' ? 'student' : 'teacher');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const change = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const message = validate(draft, role);
    if (message) {
      setError(message);
      return;
    }
    // On success the root layout switches to the teacher or student side.
    setBusy(true);
    const result = await signUp({
      role,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: formatPhone(draft.phone),
      email: draft.email.trim(),
      password: draft.password,
      ...(role === 'teacher' && {
        driverLicenseNumber: draft.driverLicenseNumber,
        teacherLicenseNumber: draft.teacherLicenseNumber,
      }),
      ...(role === 'student' && {
        birthDate: parseTypedDate(draft.birthDate) ?? undefined,
        preferredLanguage: draft.language,
        privacyConsent: draft.privacyConsent,
        marketingConsent: draft.marketingConsent,
      }),
    });
    setBusy(false);
    setError(result);
  };

  const goToSignIn = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  return (
    <AuthScreen
      title="יצירת חשבון"
      subtitle={
        role === 'teacher'
          ? 'נהלו תלמידים, שיעורים ותשלומים במקום אחד'
          : 'עקבו אחרי השיעורים וההתקדמות שלכם'
      }>
      <View style={authFormStyles.form}>
        <RoleToggle value={role} onChange={setRole} />
        <View style={authFormStyles.row}>
          <View style={authFormStyles.rowItem}>
            <FormField
              label="שם פרטי"
              value={draft.firstName}
              onChangeText={(firstName) => change({ firstName })}
              autoComplete="given-name"
              textContentType="givenName"
            />
          </View>
          <View style={authFormStyles.rowItem}>
            <FormField
              label="שם משפחה"
              value={draft.lastName}
              onChangeText={(lastName) => change({ lastName })}
              autoComplete="family-name"
              textContentType="familyName"
            />
          </View>
        </View>
        {role === 'teacher' && (
          <>
            <FormField
              label="מספר רישיון נהיגה"
              value={draft.driverLicenseNumber}
              onChangeText={(text) => change({ driverLicenseNumber: text.replace(/\D/g, '') })}
              placeholder="לאימות שאתם מורים לנהיגה"
              keyboardType="number-pad"
            />
            <FormField
              label="מספר היתר הוראה"
              value={draft.teacherLicenseNumber}
              onChangeText={(text) => change({ teacherLicenseNumber: text.replace(/\D/g, '') })}
              placeholder="לאימות שאתם מורים לנהיגה"
              keyboardType="number-pad"
            />
          </>
        )}
        {role === 'student' && (
          <>
            <FormField
              label="תאריך לידה"
              value={draft.birthDate}
              onChangeText={(text) => change({ birthDate: text.replace(/[^\d/.-]/g, '').slice(0, 10) })}
              placeholder="DD/MM/YYYY"
              keyboardType="numbers-and-punctuation"
              autoComplete="birthdate-full"
            />
            <View style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary">
                שפה מועדפת
              </ThemedText>
              <ChoiceChips
                options={optionsOf(LANGUAGE_LABELS)}
                value={draft.language}
                onChange={(language) => change({ language: language ?? 'he' })}
                surface="backgroundElement"
              />
            </View>
          </>
        )}
        <FormField
          label="טלפון נייד"
          value={draft.phone}
          onChangeText={(phone) => change({ phone })}
          placeholder="050-1234567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <FormField
          label="אימייל"
          value={draft.email}
          onChangeText={(email) => change({ email })}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <FormField
          label="סיסמה"
          value={draft.password}
          onChangeText={(password) => change({ password })}
          placeholder={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <FormField
          label="אימות סיסמה"
          value={draft.confirmPassword}
          onChangeText={(confirmPassword) => change({ confirmPassword })}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {role === 'student' && (
          <View style={styles.group}>
            <ToggleRow
              label="אני מאשר/ת שמירת הפרטים שלי לצורך ניהול השיעורים"
              hint="הפרטים נשמרים בחשבון שלך וגלויים רק למורה שלך. חובה."
              value={draft.privacyConsent}
              onChange={(privacyConsent) => change({ privacyConsent })}
            />
            <ToggleRow
              label="אפשר לשלוח לי עדכונים ומבצעים"
              value={draft.marketingConsent}
              onChange={(marketingConsent) => change({ marketingConsent })}
            />
          </View>
        )}
        <FormError message={error} />
        <PrimaryButton
          label={role === 'teacher' ? 'הרשמה כמורה' : 'הרשמה כתלמיד/ה'}
          onPress={submit}
          busy={busy}
        />
      </View>

      <FormFooterLink text="כבר יש לכם חשבון?" linkText="התחברות" onPress={goToSignIn} />
    </AuthScreen>
  );
}
