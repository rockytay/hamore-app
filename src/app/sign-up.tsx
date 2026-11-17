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
import { formatPhone, isValidIsraeliId, isValidPhone } from '@/hooks/use-students';
import { getPasswordChecks, MIN_PASSWORD_LENGTH, validatePassword } from '@/utils/password';

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  wide: {
    flex: 2,
  },
  checks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    marginTop: -Spacing.one,
  },
});


type Draft = Pick<SignUpInput, 'firstName' | 'lastName' | 'phone' | 'email' | 'password'> & {
  driverLicenseNumber: string;
  teacherLicenseNumber: string;
  confirmPassword: string;
  /** Students: typed as DD/MM/YYYY. */
  birthDate: string;
  language: Language;
  privacyConsent: boolean;
  marketingConsent: boolean;
  idNumber: string;
  street: string;
  houseNumber: string;
  city: string;
  pickupNotes: string;
  parentName: string;
  parentPhone: string;
  parentRelation: string;
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
  idNumber: '',
  street: '',
  houseNumber: '',
  city: '',
  pickupNotes: '',
  parentName: '',
  parentPhone: '',
  parentRelation: '',
};

/** Under 18 a parent contact is required (from the typed birth date, once it is complete). */
function isMinor(birthDate: string) {
  const born = parseTypedDate(birthDate);
  return born !== null && getAge(born) < 18;
}

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
    if (!isValidIsraeliId(draft.idNumber)) return 'יש להזין מספר תעודת זהות תקין (9 ספרות).';
    if (!draft.street.trim() || !draft.houseNumber.trim() || !draft.city.trim()) {
      return 'יש למלא כתובת איסוף: רחוב, מספר בית ועיר.';
    }
    if (age < 18) {
      if (!draft.parentName.trim()) return 'מתחת לגיל 18 יש למלא את שם ההורה.';
      if (!isValidPhone(draft.parentPhone)) return 'יש להזין מספר נייד תקין של ההורה (05X-XXXXXXX).';
      if (!draft.parentRelation.trim()) return 'יש לציין את הקרבה של ההורה (אמא, אבא...).';
    }
  }
  if (role === 'teacher' && !draft.driverLicenseNumber) {
    return 'יש להזין מספר רישיון נהיגה, כדי שנוכל לאמת שאתם מורים לנהיגה.';
  }
  if (role === 'teacher' && !draft.teacherLicenseNumber) {
    return 'יש להזין מספר היתר הוראה, כדי שנוכל לאמת שאתם מורים לנהיגה.';
  }
  if (!isValidPhone(draft.phone)) return 'יש להזין מספר נייד תקין (05X-XXXXXXX).';
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'כתובת האימייל אינה תקינה.';
  const passwordError = validatePassword(draft.password, {
    email: draft.email,
    phone: draft.phone,
    firstName: draft.firstName,
    lastName: draft.lastName,
  });
  if (passwordError) return passwordError;
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
        idNumber: draft.idNumber,
        address: {
          street: draft.street,
          houseNumber: draft.houseNumber,
          city: draft.city,
          pickupNotes: draft.pickupNotes,
        },
        parent: isMinor(draft.birthDate)
          ? { name: draft.parentName, phone: formatPhone(draft.parentPhone), relation: draft.parentRelation }
          : undefined,
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
            <FormField
              label="מספר תעודת זהות"
              value={draft.idNumber}
              onChangeText={(text) => change({ idNumber: text.replace(/\D/g, '').slice(0, 9) })}
              placeholder="9 ספרות, נדרש לרישום לטסט"
              keyboardType="number-pad"
            />
            <View style={styles.group}>
              <ThemedText type="smallBold">כתובת איסוף לשיעורים</ThemedText>
              <View style={authFormStyles.row}>
                <View style={styles.wide}>
                  <FormField
                    label="רחוב"
                    value={draft.street}
                    onChangeText={(street) => change({ street })}
                    autoComplete="street-address"
                    textContentType="streetAddressLine1"
                  />
                </View>
                <View style={authFormStyles.rowItem}>
                  <FormField
                    label="מספר"
                    value={draft.houseNumber}
                    onChangeText={(houseNumber) => change({ houseNumber })}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <FormField
                label="עיר"
                value={draft.city}
                onChangeText={(city) => change({ city })}
                textContentType="addressCity"
              />
              <FormField
                label="הערות לאיסוף (לא חובה)"
                value={draft.pickupNotes}
                onChangeText={(pickupNotes) => change({ pickupNotes })}
                placeholder="למשל: ליד השער האחורי"
              />
            </View>
            {isMinor(draft.birthDate) && (
              <View style={styles.group}>
                <ThemedText type="smallBold">פרטי הורה (חובה מתחת לגיל 18)</ThemedText>
                <FormField
                  label="שם ההורה"
                  value={draft.parentName}
                  onChangeText={(parentName) => change({ parentName })}
                />
                <View style={authFormStyles.row}>
                  <View style={styles.wide}>
                    <FormField
                      label="טלפון ההורה"
                      value={draft.parentPhone}
                      onChangeText={(parentPhone) => change({ parentPhone })}
                      placeholder="050-1234567"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={authFormStyles.rowItem}>
                    <FormField
                      label="קרבה"
                      value={draft.parentRelation}
                      onChangeText={(parentRelation) => change({ parentRelation })}
                      placeholder="אמא / אבא"
                    />
                  </View>
                </View>
              </View>
            )}
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
          placeholder={`לפחות ${MIN_PASSWORD_LENGTH} תווים, אות וספרה`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          passwordRules={`minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: digit;`}
        />
        {draft.password.length > 0 && (
          <View style={styles.checks}>
            {getPasswordChecks(draft.password).map((check) => (
              <ThemedText
                key={check.label}
                type="small"
                themeColor={check.met ? 'slotAvailable' : 'textSecondary'}>
                {check.met ? '✓' : '○'} {check.label}
              </ThemedText>
            ))}
          </View>
        )}
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
