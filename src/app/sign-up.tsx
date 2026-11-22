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
import { ChoiceChips, FieldHint, MultiChoiceChips, optionsOf, ToggleRow } from '@/components/form-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  getAge,
  LANGUAGE_LABELS,
  parseMinutes,
  parseTypedDate,
  PRIOR_LICENSE_LABELS,
  REFERRAL_LABELS,
  REMINDER_CHANNEL_LABELS,
  WEEKDAY_LABELS,
  type Language,
  type PriorLicense,
  type ReferralSource,
  type ReminderChannel,
} from '@/hooks/student-file';
import { useAuth, type Role, type SignUpInput } from '@/hooks/use-auth';
import {
  formatPhone,
  isValidIsraeliId,
  isValidPhone,
  LICENSE_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  TRANSMISSION_LABELS,
  type LicenseCategory,
  type PaymentMethod,
  type Transmission,
} from '@/hooks/use-students';
import { getPasswordChecks, MIN_PASSWORD_LENGTH, validatePassword } from '@/utils/password';

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  wide: {
    flex: 2,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
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
  licenseCategory: LicenseCategory;
  /** Null until chosen: required. */
  transmission: Transmission | null;
  /** Null until answered: required. */
  hasGreenForm: boolean | null;
  /** DD/MM/YYYY */
  greenFormIssuedAt: string;
  eyeTestDone: boolean;
  needsGlasses: boolean;
  healthDeclarationDone: boolean;
  /** Null until answered: required. */
  theoryPassed: boolean | null;
  /** DD/MM/YYYY */
  theoryPassedAt: string;
  priorLicense: PriorLicense;
  specialRestrictions: string;
  /** 0 = Sunday … 6 = Saturday. */
  availableDays: number[];
  /** HH:MM */
  availableFrom: string;
  availableTo: string;
  reminderChannel: ReminderChannel;
  reminderHoursBefore: number;
  preferredPaymentMethod: PaymentMethod | null;
  referralSource: ReferralSource | null;
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
  licenseCategory: 'B',
  transmission: null,
  hasGreenForm: null,
  greenFormIssuedAt: '',
  eyeTestDone: false,
  needsGlasses: false,
  healthDeclarationDone: false,
  theoryPassed: null,
  theoryPassedAt: '',
  priorLicense: 'none',
  specialRestrictions: '',
  availableDays: [],
  availableFrom: '',
  availableTo: '',
  reminderChannel: 'push',
  reminderHoursBefore: 24,
  preferredPaymentMethod: null,
  referralSource: null,
};

const YES_NO: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'כן' },
  { value: 'no', label: 'לא' },
];

const yesNo = (value: boolean | null) => (value === null ? null : value ? 'yes' : 'no');

const REMINDER_TIMES = [
  { value: 1, label: 'שעה לפני' },
  { value: 2, label: 'שעתיים לפני' },
  { value: 12, label: '12 שעות לפני' },
  { value: 24, label: 'יום לפני' },
  { value: 48, label: 'יומיים לפני' },
];

/** Sunday first, like WEEKDAY_LABELS. */
const DAY_OPTIONS = WEEKDAY_LABELS.map((label, weekday) => ({ value: weekday, label }));

const CATEGORY_OPTIONS = (Object.keys(LICENSE_CATEGORIES) as LicenseCategory[]).map((value) => ({
  value,
  label: value,
}));

/** Keeps only what a typed date can contain. */
const cleanDate = (text: string) => text.replace(/[^\d/.-]/g, '').slice(0, 10);

/** A typed past date: an error message, or null when it is fine. */
function checkPastDate(text: string, what: string) {
  const date = parseTypedDate(text);
  if (!date) return `יש להזין ${what} (DD/MM/YYYY).`;
  if (date > new Date()) return `${what} עוד לא הגיע.`;
  return null;
}

/** Under 18 a parent contact is required (from the typed birth date, once it is complete). */
function isMinor(birthDate: string) {
  const born = parseTypedDate(birthDate);
  return born !== null && getAge(born) < 18;
}

/** The chosen days and hours as weekly windows, or none when not filled in. */
function availabilityOf(draft: Draft) {
  const startMin = parseMinutes(draft.availableFrom);
  const endMin = parseMinutes(draft.availableTo);
  if (startMin === null || endMin === null || endMin <= startMin) return [];
  return draft.availableDays.map((weekday) => ({ weekday, startMin, endMin }));
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
    if (!draft.transmission) return 'יש לבחור תיבת הילוכים: ידני או אוטומט.';
    if (draft.hasGreenForm === null) return 'יש לציין אם כבר יש לך טופס ירוק.';
    if (draft.hasGreenForm) {
      const greenError = checkPastDate(draft.greenFormIssuedAt, 'תאריך הנפקת הטופס הירוק');
      if (greenError) return greenError;
    }
    if (draft.theoryPassed === null) return 'יש לציין אם עברת את מבחן התאוריה.';
    if (draft.theoryPassed) {
      const theoryError = checkPastDate(draft.theoryPassedAt, 'תאריך מבחן התאוריה');
      if (theoryError) return theoryError;
    }
    const from = parseMinutes(draft.availableFrom);
    const to = parseMinutes(draft.availableTo);
    const typedHours = draft.availableFrom.trim() !== '' || draft.availableTo.trim() !== '';
    if (draft.availableDays.length > 0 || typedHours) {
      if (draft.availableDays.length === 0) return 'יש לבחור באילו ימים נוח לך ללמוד.';
      if (from === null || to === null) return 'יש להזין שעות זמינות בפורמט 16:00.';
      if (to <= from) return 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.';
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
        licence: {
          category: draft.licenseCategory,
          transmission: draft.transmission ?? 'manual',
          greenFormIssuedAt: draft.hasGreenForm ? parseTypedDate(draft.greenFormIssuedAt) : null,
          eyeTestDone: draft.eyeTestDone,
          needsGlasses: draft.needsGlasses,
          healthDeclarationDone: draft.healthDeclarationDone,
          theoryPassedAt: draft.theoryPassed ? parseTypedDate(draft.theoryPassedAt) : null,
          priorLicense: draft.priorLicense,
          specialRestrictions: draft.specialRestrictions,
        },
        preferredPaymentMethod: draft.preferredPaymentMethod,
        referralSource: draft.referralSource,
        reminderChannel: draft.reminderChannel,
        reminderHoursBefore: draft.reminderHoursBefore,
        availability: availabilityOf(draft),
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

            <View style={styles.section}>
              <ThemedText type="smallBold">רישיון (תיק משרד התחבורה)</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                דרגת רישיון
              </ThemedText>
              <ChoiceChips
                options={CATEGORY_OPTIONS}
                value={draft.licenseCategory}
                onChange={(licenseCategory) => licenseCategory && change({ licenseCategory })}
                surface="backgroundElement"
              />
              <FieldHint>{LICENSE_CATEGORIES[draft.licenseCategory]}</FieldHint>
              <ThemedText type="small" themeColor="textSecondary">
                תיבת הילוכים
              </ThemedText>
              <ChoiceChips
                options={optionsOf(TRANSMISSION_LABELS)}
                value={draft.transmission}
                onChange={(transmission) => transmission && change({ transmission })}
                surface="backgroundElement"
              />
              <ThemedText type="small" themeColor="textSecondary">
                יש לך טופס ירוק (הצהרה רפואית)?
              </ThemedText>
              <ChoiceChips
                options={YES_NO}
                value={yesNo(draft.hasGreenForm)}
                onChange={(answer) => answer && change({ hasGreenForm: answer === 'yes' })}
                surface="backgroundElement"
              />
              {draft.hasGreenForm && (
                <FormField
                  label="תאריך הנפקת הטופס הירוק"
                  value={draft.greenFormIssuedAt}
                  onChangeText={(text) => change({ greenFormIssuedAt: cleanDate(text) })}
                  placeholder="DD/MM/YYYY · בתוקף 5 שנים"
                  keyboardType="numbers-and-punctuation"
                />
              )}
              <ToggleRow
                label="עשיתי בדיקת ראייה"
                value={draft.eyeTestDone}
                onChange={(eyeTestDone) => change({ eyeTestDone })}
              />
              <ToggleRow
                label="אני חייב/ת לנהוג עם משקפיים או עדשות"
                hint="מגבלה שרשומה ברישיון"
                value={draft.needsGlasses}
                onChange={(needsGlasses) => change({ needsGlasses })}
              />
              <ToggleRow
                label="הצהרת הבריאות שלי אושרה"
                hint="כן/לא בלבד. לא שומרים פרטים רפואיים."
                value={draft.healthDeclarationDone}
                onChange={(healthDeclarationDone) => change({ healthDeclarationDone })}
              />
              <ThemedText type="small" themeColor="textSecondary">
                עברת את מבחן התאוריה?
              </ThemedText>
              <ChoiceChips
                options={YES_NO}
                value={yesNo(draft.theoryPassed)}
                onChange={(answer) => answer && change({ theoryPassed: answer === 'yes' })}
                surface="backgroundElement"
              />
              {draft.theoryPassed && (
                <FormField
                  label="תאריך מבחן התאוריה"
                  value={draft.theoryPassedAt}
                  onChangeText={(text) => change({ theoryPassedAt: cleanDate(text) })}
                  placeholder="DD/MM/YYYY · בתוקף 5 שנים"
                  keyboardType="numbers-and-punctuation"
                />
              )}
              <ThemedText type="small" themeColor="textSecondary">
                רישיון קודם
              </ThemedText>
              <ChoiceChips
                options={optionsOf(PRIOR_LICENSE_LABELS)}
                value={draft.priorLicense}
                onChange={(priorLicense) => priorLicense && change({ priorLicense })}
                surface="backgroundElement"
              />
              <FormField
                label="מגבלות מיוחדות (לא חובה)"
                value={draft.specialRestrictions}
                onChangeText={(text) => change({ specialRestrictions: text.slice(0, 200) })}
                placeholder="למשל: רכב מותאם"
              />
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">מתי נוח לך ללמוד? (לא חובה)</ThemedText>
              <MultiChoiceChips
                options={DAY_OPTIONS}
                values={draft.availableDays}
                onChange={(availableDays) => change({ availableDays })}
                surface="backgroundElement"
              />
              <View style={authFormStyles.row}>
                <View style={authFormStyles.rowItem}>
                  <FormField
                    label="משעה"
                    value={draft.availableFrom}
                    onChangeText={(availableFrom) => change({ availableFrom })}
                    placeholder="16:00"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={authFormStyles.rowItem}>
                  <FormField
                    label="עד שעה"
                    value={draft.availableTo}
                    onChangeText={(availableTo) => change({ availableTo })}
                    placeholder="20:00"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                תזכורת לשיעור
              </ThemedText>
              <ChoiceChips
                options={optionsOf(REMINDER_CHANNEL_LABELS)}
                value={draft.reminderChannel}
                onChange={(reminderChannel) => reminderChannel && change({ reminderChannel })}
                surface="backgroundElement"
              />
              <ChoiceChips
                options={REMINDER_TIMES}
                value={draft.reminderHoursBefore}
                onChange={(reminderHoursBefore) => reminderHoursBefore && change({ reminderHoursBefore })}
                surface="backgroundElement"
              />
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">תשלום והיכרות (לא חובה)</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                אמצעי תשלום מועדף
              </ThemedText>
              <ChoiceChips
                options={optionsOf(PAYMENT_METHOD_LABELS)}
                value={draft.preferredPaymentMethod}
                onChange={(preferredPaymentMethod) => change({ preferredPaymentMethod })}
                allowNone
                surface="backgroundElement"
              />
              <ThemedText type="small" themeColor="textSecondary">
                איך הגעת אל המורה?
              </ThemedText>
              <ChoiceChips
                options={optionsOf(REFERRAL_LABELS)}
                value={draft.referralSource}
                onChange={(referralSource) => change({ referralSource })}
                allowNone
                surface="backgroundElement"
              />
            </View>

            <ThemedText type="smallBold" style={styles.section}>
              פרטי התחברות
            </ThemedText>
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
