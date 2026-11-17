import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips, DateField, FieldHint, optionsOf, TextField, ToggleRow } from '@/components/form-ui';
import { formatShekels } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  PAYER_LABELS,
  PAYMENT_PLAN_LABELS,
  PRIOR_LICENSE_LABELS,
  REFERRAL_LABELS,
  type Payer,
  type PaymentPlan,
  type PriorLicense,
  type ReferralSource,
} from '@/hooks/student-file';
import { getPlan, useCurrentUser } from '@/hooks/use-current-user';
import {
  findStudentAccount,
  formatPhone,
  isValidIsraeliId,
  isValidPhone,
  PAYMENT_METHOD_LABELS,
  LICENSE_CATEGORIES,
  STUDENT_HAS_OTHER_TEACHER,
  StudentSaveError,
  TRANSMISSION_LABELS,
  useAddStudent,
  useStudents,
  type LicenseCategory,
  type PaymentMethod,
  type StudentAccount,
  type Transmission,
} from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/utils/dialogs';

type BalanceType = 'even' | 'credit' | 'debt';

const BALANCE_LABELS: Record<BalanceType, string> = {
  even: 'מאוזן',
  credit: 'שילם מראש',
  debt: 'חוב קודם',
};

type Form = {
  /** The email the student signed up with; their account is found by it. */
  email: string;
  idNumber: string;
  licenseCategory: LicenseCategory;
  transmission: Transmission;
  theoryPassed: boolean;
  theoryPassedAt: Date | null;
  /** Null until the teacher answers: it is a required question. */
  hasGreenForm: boolean | null;
  greenFormIssuedAt: Date | null;
  eyeTestDone: boolean;
  needsGlasses: boolean;
  healthDeclarationDone: boolean;
  priorLicense: PriorLicense;
  /** Asked only when the student did not enter a birth date. */
  minorAnswer: boolean;
  street: string;
  houseNumber: string;
  city: string;
  pickupNotes: string;
  parentName: string;
  parentPhone: string;
  parentRelation: string;
  paymentPlan: PaymentPlan | null;
  payer: Payer;
  preferredPaymentMethod: PaymentMethod | null;
  referralSource: ReferralSource | null;
  lessonsCompleted: number;
  balanceType: BalanceType;
  /** Shekels, kept as text while typing. */
  balanceAmount: string;
  firstNote: string;
};

type FormErrors = Partial<Record<keyof Form, string>>;

const ALL_CATEGORIES = Object.keys(LICENSE_CATEGORIES) as LicenseCategory[];

export default function AddStudentScreen() {
  const theme = useTheme();
  const user = useCurrentUser();
  const students = useStudents();
  const addStudent = useAddStudent();

  // Offer the categories the teacher teaches first, and default to their car's transmission.
  const teacherCategories = user?.teachingCategories.length ? user.teachingCategories : ['B' as const];
  const emptyForm = (): Form => ({
    email: '',
    idNumber: '',
    licenseCategory: teacherCategories[0],
    transmission: user?.transmission ?? 'automatic',
    theoryPassed: false,
    theoryPassedAt: null,
    hasGreenForm: null,
    greenFormIssuedAt: null,
    eyeTestDone: false,
    needsGlasses: false,
    healthDeclarationDone: false,
    priorLicense: 'none',
    minorAnswer: false,
    street: '',
    houseNumber: '',
    city: '',
    pickupNotes: '',
    parentName: '',
    parentPhone: '',
    parentRelation: '',
    paymentPlan: null,
    payer: 'student',
    preferredPaymentMethod: null,
    referralSource: null,
    lessonsCompleted: 0,
    balanceType: 'even',
    balanceAmount: '',
    firstNote: '',
  });

  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showAllCategories, setShowAllCategories] = useState(false);
  /** The student's account, once found by email. The rest of the form needs it. */
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [searching, setSearching] = useState(false);
  /** Set when the email belongs to a student on the former list. */
  const [formerStudentId, setFormerStudentId] = useState<string | null>(null);

  const plan = user ? getPlan(user.subscription.planId) : null;
  const planFull = plan !== null && students.length >= plan.maxStudents;
  const categories = showAllCategories ? ALL_CATEGORIES : teacherCategories;

  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    // A different email means a different student: search again.
    if (key === 'email') {
      setAccount(null);
      setFormerStudentId(null);
    }
  };

  /** Finds the student's account. Only students who signed up to the app can be added. */
  const search = async () => {
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrors((current) => ({
        ...current,
        email: 'יש להזין כתובת אימייל תקינה',
      }));
      return;
    }
    setSearching(true);
    try {
      const found = await findStudentAccount(email);
      if (!found) {
        setErrors((current) => ({
          ...current,
          email:
            'לא נמצא תלמיד רשום עם האימייל הזה. בקשו מהתלמיד להירשם לאפליקציה כתלמיד ואז נסו שוב.',
        }));
      } else if (found.alreadyAdded) {
        setErrors((current) => ({
          ...current,
          email: 'התלמיד כבר נמצא ברשימת התלמידים שלך',
        }));
      } else if (found.hasOtherTeacher) {
        setErrors((current) => ({ ...current, email: STUDENT_HAS_OTHER_TEACHER }));
      } else if (found.removedStudentId) {
        // Their history is kept on the former list: bring them back rather than add again.
        setFormerStudentId(found.removedStudentId);
        setErrors((current) => ({
          ...current,
          email: `${found.firstName} ${found.lastName} נמצא/ת ברשימת התלמידים לשעבר שלך. אפשר להחזיר אותו/ה מעמוד התלמיד.`,
        }));
      } else {
        Keyboard.dismiss();
        setAccount(found);
        // A minor's lessons are usually paid by a parent.
        if (found.isMinor) setForm((current) => ({ ...current, payer: 'parent' }));
      }
    } catch (error) {
      const message =
        error instanceof StudentSaveError ? error.message : 'החיפוש נכשל. יש לנסות שוב.';
      setErrors((current) => ({ ...current, email: message }));
    } finally {
      setSearching(false);
    }
  };

  // What the student already entered at sign-up is not asked again.
  const needsIdNumber = !!account && !account.hasIdNumber;
  const needsAddress = !!account && !account.hasAddress;
  const isMinor = !!account && (account.hasBirthDate ? account.isMinor : form.minorAnswer);
  const needsParent = isMinor && !account?.hasParent;

  const validate = (): FormErrors => {
    const result: FormErrors = {};
    const today = new Date();
    if (!account) result.email = 'יש לחפש ולמצוא את התלמיד לפי אימייל';
    if (needsIdNumber && !isValidIsraeliId(form.idNumber)) {
      result.idNumber = form.idNumber.trim() ? 'מספר תעודת הזהות אינו תקין' : 'חובה: נדרש לרישום לטסט';
    }
    if (needsAddress) {
      if (!form.street.trim()) result.street = 'חובה';
      if (!form.houseNumber.trim()) result.houseNumber = 'חובה';
      if (!form.city.trim()) result.city = 'חובה';
    }
    if (needsParent) {
      if (!form.parentName.trim()) result.parentName = 'חובה מתחת לגיל 18';
      if (!isValidPhone(form.parentPhone)) result.parentPhone = 'יש להזין מספר נייד תקין';
      if (!form.parentRelation.trim()) result.parentRelation = 'חובה';
    }
    if (form.hasGreenForm === null) result.hasGreenForm = 'יש לבחור';
    if (form.hasGreenForm) {
      if (!form.greenFormIssuedAt) result.greenFormIssuedAt = 'יש להזין את תאריך ההנפקה';
      else if (form.greenFormIssuedAt > today) result.greenFormIssuedAt = 'התאריך עוד לא הגיע';
    }
    if (form.theoryPassed) {
      if (!form.theoryPassedAt) result.theoryPassedAt = 'יש להזין את תאריך המבחן';
      else if (form.theoryPassedAt > today) result.theoryPassedAt = 'התאריך עוד לא הגיע';
    }
    if (!form.paymentPlan) result.paymentPlan = 'יש לבחור תוכנית תשלום';
    if (form.balanceType !== 'even' && !(Number(form.balanceAmount) > 0)) {
      result.balanceAmount = 'יש להזין סכום';
    }
    return result;
  };

  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (planFull || saving) return;
    const found = validate();
    if (Object.keys(found).length > 0 || !account) {
      setErrors(found);
      return;
    }

    const amount = Number(form.balanceAmount) || 0;
    setSaving(true);
    let student;
    try {
      student = await addStudent({
        profileId: account.profileId,
        idNumber: (needsIdNumber && form.idNumber.replace(/\D/g, '')) || undefined,
        licenseCategory: form.licenseCategory,
        transmission: form.transmission,
        theoryPassed: form.theoryPassed,
        lessonsCompleted: form.lessonsCompleted,
        balance: form.balanceType === 'credit' ? amount : form.balanceType === 'debt' ? -amount : 0,
        firstNote: form.firstNote.trim() || undefined,
        file: {
          greenFormIssuedAt: form.hasGreenForm ? form.greenFormIssuedAt : null,
          eyeTestDone: form.eyeTestDone,
          needsGlasses: form.needsGlasses,
          healthDeclarationDone: form.healthDeclarationDone,
          theoryPassedAt: form.theoryPassed ? form.theoryPassedAt : null,
          priorLicense: form.priorLicense,
          paymentPlan: form.paymentPlan ?? 'per_lesson',
          payer: form.payer,
          preferredPaymentMethod: form.preferredPaymentMethod,
          referralSource: form.referralSource,
        },
        address: needsAddress
          ? {
              label: 'בית',
              street: form.street,
              houseNumber: form.houseNumber,
              city: form.city,
              pickupNotes: form.pickupNotes,
              isDefault: true,
            }
          : undefined,
        parent: needsParent
          ? {
              kind: 'parent',
              name: form.parentName,
              phone: formatPhone(form.parentPhone),
              relation: form.parentRelation,
              isPayer: form.payer === 'parent',
            }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof StudentSaveError ? error.message : 'שמירת התלמיד נכשלה. יש לנסות שוב.';
      if (error instanceof StudentSaveError && error.field) {
        setErrors({ [error.field]: message });
      } else {
        showMessage('שגיאה', message);
      }
      return;
    } finally {
      setSaving(false);
    }

    Keyboard.dismiss();
    setForm(emptyForm());
    setErrors({});
    setAccount(null);
    setShowAllCategories(false);
    router.push({ pathname: '/students/[id]', params: { id: student.id } }, { withAnchor: true });
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">הוספת תלמיד</ThemedText>
            {plan && (
              <ThemedText type="small" themeColor="textSecondary">
                מסלול {plan.name}: {students.length} מתוך {plan.maxStudents} תלמידים
              </ThemedText>
            )}
          </View>

          {planFull && plan && (
            <View style={[styles.limitCard, { backgroundColor: theme.danger }]}>
              <ThemedText type="smallBold" style={styles.whiteText}>
                הגעתם למכסת התלמידים במסלול {plan.name}
              </ThemedText>
              <ThemedText type="small" style={styles.whiteText}>
                המסלול כולל עד {plan.maxStudents} תלמידים. כדי להוסיף תלמיד חדש יש לשדרג את המסלול.
              </ThemedText>
              <Pressable
                onPress={() => router.navigate('/profile')}
                style={({ pressed }) => [styles.limitButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" themeColor="danger">
                  לשדרוג המסלול
                </ThemedText>
              </Pressable>
            </View>
          )}

          <FormSection title="חיפוש תלמיד">
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              ניתן להוסיף רק תלמיד שכבר נרשם לאפליקציה כתלמיד. הזינו את האימייל שאיתו נרשם.
            </ThemedText>
            <Input
              label="אימייל התלמיד"
              value={form.email}
              onChange={(value) => change('email', value)}
              placeholder="student@example.com"
              keyboardType="email-address"
              onSubmit={search}
              error={errors.email}
            />
            {!account && (
              <Pressable
                disabled={searching || planFull}
                onPress={search}
                style={({ pressed }) => [
                  styles.searchButton,
                  {
                    backgroundColor:
                      searching || planFull ? theme.backgroundSelected : theme.accent,
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={styles.whiteText}>
                  {searching ? 'מחפש…' : 'חיפוש'}
                </ThemedText>
              </Pressable>
            )}
            {account && <FoundAccount account={account} />}
            {formerStudentId && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/students/[id]', params: { id: formerStudentId } }, { withAnchor: true })
                }
                style={({ pressed }) => [styles.searchButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.whiteText}>
                  לעמוד התלמיד
                </ThemedText>
              </Pressable>
            )}
          </FormSection>

          {account && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                שדות עם * הם חובה. פרטים שהתלמיד/ה כבר מילא/ה בהרשמה לא נשאלים שוב.
              </ThemedText>

              <FormSection title="פרטים אישיים">
                {needsIdNumber ? (
                  <Input
                    label="תעודת זהות *"
                    value={form.idNumber}
                    onChange={(value) => change('idNumber', value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="9 ספרות, נדרש לרישום לטסט"
                    keyboardType="number-pad"
                    error={errors.idNumber}
                  />
                ) : (
                  <Given label="תעודת זהות" />
                )}
                {account.hasBirthDate ? (
                  <Given label={account.isMinor ? 'תאריך לידה (מתחת לגיל 18)' : 'תאריך לידה'} />
                ) : (
                  <ToggleRow
                    label="התלמיד/ה מתחת לגיל 18"
                    hint="התלמיד/ה לא הזין/ה תאריך לידה. אפשר להוסיף אותו בפרופיל שלו/ה."
                    value={form.minorAnswer}
                    onChange={(value) => change('minorAnswer', value)}
                  />
                )}
              </FormSection>

              <FormSection title="כתובת איסוף">
                {needsAddress ? (
                  <>
                    <View style={styles.inline}>
                      <View style={styles.wide}>
                        <TextField
                          label="רחוב *"
                          value={form.street}
                          onChange={(value) => change('street', value)}
                          error={errors.street}
                        />
                      </View>
                      <View style={styles.flex}>
                        <TextField
                          label="מספר *"
                          value={form.houseNumber}
                          onChange={(value) => change('houseNumber', value)}
                          keyboardType="numbers-and-punctuation"
                          error={errors.houseNumber}
                        />
                      </View>
                    </View>
                    <TextField
                      label="עיר *"
                      value={form.city}
                      onChange={(value) => change('city', value)}
                      error={errors.city}
                    />
                    <TextField
                      label="הערות לאיסוף"
                      value={form.pickupNotes}
                      onChange={(value) => change('pickupNotes', value)}
                      placeholder="למשל: ליד השער האחורי"
                    />
                  </>
                ) : (
                  <Given label="כתובת איסוף" />
                )}
              </FormSection>

              {isMinor && (
                <FormSection title="הורה (חובה מתחת לגיל 18)">
                  {needsParent ? (
                    <>
                      <TextField
                        label="שם ההורה *"
                        value={form.parentName}
                        onChange={(value) => change('parentName', value)}
                        error={errors.parentName}
                      />
                      <View style={styles.inline}>
                        <View style={styles.wide}>
                          <TextField
                            label="טלפון *"
                            value={form.parentPhone}
                            onChange={(value) => change('parentPhone', value)}
                            placeholder="050-1234567"
                            keyboardType="phone-pad"
                            error={errors.parentPhone}
                          />
                        </View>
                        <View style={styles.flex}>
                          <TextField
                            label="קרבה *"
                            value={form.parentRelation}
                            onChange={(value) => change('parentRelation', value)}
                            placeholder="אמא / אבא"
                            error={errors.parentRelation}
                          />
                        </View>
                      </View>
                    </>
                  ) : (
                    <Given label="פרטי הורה" />
                  )}
                </FormSection>
              )}

              <FormSection title="רישיון">
                <Label>דרגת רישיון</Label>
                <View style={styles.chips}>
                  {categories.map((category) => (
                    <Chip
                      key={category}
                      label={category}
                      selected={form.licenseCategory === category}
                      onPress={() => change('licenseCategory', category)}
                    />
                  ))}
                  {teacherCategories.length < ALL_CATEGORIES.length && (
                    <Chip
                      label={showAllCategories ? 'פחות' : 'עוד דרגות'}
                      selected={false}
                      onPress={() => setShowAllCategories((current) => !current)}
                    />
                  )}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  {LICENSE_CATEGORIES[form.licenseCategory]}
                </ThemedText>

                <Label>תיבת הילוכים</Label>
                <View style={styles.chips}>
                  {(Object.keys(TRANSMISSION_LABELS) as Transmission[]).map((transmission) => (
                    <Chip
                      key={transmission}
                      label={TRANSMISSION_LABELS[transmission]}
                      selected={form.transmission === transmission}
                      onPress={() => change('transmission', transmission)}
                    />
                  ))}
                </View>

                <Label>רישיון קודם</Label>
                <ChoiceChips
                  options={optionsOf(PRIOR_LICENSE_LABELS)}
                  value={form.priorLicense}
                  onChange={(value) => value && change('priorLicense', value)}
                />
              </FormSection>

              <FormSection title="טופס ירוק ובריאות">
                <Label>יש טופס ירוק? *</Label>
                <ChoiceChips
                  options={[
                    { value: 'yes', label: 'יש' },
                    { value: 'no', label: 'עדיין אין' },
                  ]}
                  value={form.hasGreenForm === null ? null : form.hasGreenForm ? 'yes' : 'no'}
                  onChange={(value) => change('hasGreenForm', value === 'yes')}
                />
                {errors.hasGreenForm && <FieldHint danger>{errors.hasGreenForm}</FieldHint>}
                {form.hasGreenForm && (
                  <DateField
                    label="תאריך הנפקה *"
                    value={form.greenFormIssuedAt}
                    onChange={(value) => change('greenFormIssuedAt', value)}
                    hint={`בתוקף ${user?.validity.greenFormValidYears ?? 5} שנים מההנפקה`}
                    error={errors.greenFormIssuedAt}
                  />
                )}
                <ToggleRow
                  label="בדיקת ראייה בוצעה"
                  value={form.eyeTestDone}
                  onChange={(value) => change('eyeTestDone', value)}
                />
                <ToggleRow
                  label="חייב/ת משקפיים או עדשות"
                  value={form.needsGlasses}
                  onChange={(value) => change('needsGlasses', value)}
                />
                <ToggleRow
                  label="הצהרת בריאות אושרה"
                  hint="כן/לא בלבד. לא שומרים פירוט רפואי."
                  value={form.healthDeclarationDone}
                  onChange={(value) => change('healthDeclarationDone', value)}
                />
              </FormSection>

              <FormSection title="תאוריה">
                <Label>מבחן תאוריה</Label>
                <View style={styles.chips}>
                  <Chip
                    label="עבר/ה"
                    selected={form.theoryPassed}
                    onPress={() => change('theoryPassed', true)}
                  />
                  <Chip
                    label="טרם עבר/ה"
                    selected={!form.theoryPassed}
                    onPress={() => change('theoryPassed', false)}
                  />
                </View>
                {form.theoryPassed && (
                  <DateField
                    label="תאריך המבחן *"
                    value={form.theoryPassedAt}
                    onChange={(value) => change('theoryPassedAt', value)}
                    hint={`בתוקף ${user?.validity.theoryValidYears ?? 5} שנים`}
                    error={errors.theoryPassedAt}
                  />
                )}
              </FormSection>

              <FormSection title="תשלום">
                <Label>תוכנית תשלום *</Label>
                <ChoiceChips
                  options={optionsOf(PAYMENT_PLAN_LABELS)}
                  value={form.paymentPlan}
                  onChange={(value) => change('paymentPlan', value)}
                />
                {errors.paymentPlan && <FieldHint danger>{errors.paymentPlan}</FieldHint>}
                <Label>מי משלם</Label>
                <ChoiceChips
                  options={optionsOf(PAYER_LABELS)}
                  value={form.payer}
                  onChange={(value) => value && change('payer', value)}
                />
                <Label>אמצעי תשלום מועדף</Label>
                <ChoiceChips
                  options={optionsOf(PAYMENT_METHOD_LABELS)}
                  value={form.preferredPaymentMethod}
                  onChange={(value) => change('preferredPaymentMethod', value)}
                  allowNone
                />
              </FormSection>

              <FormSection title="התחלה">
                <Label>שיעורים קודמים (למשל ממורה אחר)</Label>
                <View style={styles.stepper}>
                  <StepButton
                    label="−"
                    disabled={form.lessonsCompleted === 0}
                    onPress={() =>
                      change('lessonsCompleted', Math.max(0, form.lessonsCompleted - 1))
                    }
                  />
                  <ThemedText type="smallBold" style={styles.stepValue}>
                    {form.lessonsCompleted}
                  </ThemedText>
                  <StepButton
                    label="+"
                    onPress={() => change('lessonsCompleted', form.lessonsCompleted + 1)}
                  />
                </View>

                <Label>מצב תשלום</Label>
                <View style={styles.chips}>
                  {(Object.keys(BALANCE_LABELS) as BalanceType[]).map((type) => (
                    <Chip
                      key={type}
                      label={BALANCE_LABELS[type]}
                      selected={form.balanceType === type}
                      onPress={() => change('balanceType', type)}
                    />
                  ))}
                </View>
                {form.balanceType !== 'even' && (
                  <Input
                    label={form.balanceType === 'credit' ? 'סכום ששולם מראש (₪)' : 'סכום החוב (₪)'}
                    value={form.balanceAmount}
                    onChange={(value) => change('balanceAmount', value.replace(/\D/g, ''))}
                    placeholder={user ? String(user.lessonPrice) : undefined}
                    keyboardType="number-pad"
                    error={errors.balanceAmount}
                  />
                )}
                {form.balanceType !== 'even' && user && Number(form.balanceAmount) > 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                    {formatShekels(Number(form.balanceAmount))} ≈{' '}
                    {(Number(form.balanceAmount) / user.lessonPrice).toFixed(1)} שיעורים לפי{' '}
                    {formatShekels(user.lessonPrice)} לשיעור
                  </ThemedText>
                )}

                <Label>איך הגיע/ה אליך</Label>
                <ChoiceChips
                  options={optionsOf(REFERRAL_LABELS)}
                  value={form.referralSource}
                  onChange={(value) => change('referralSource', value)}
                  allowNone
                />

                <Input
                  label="הערות (לא חובה)"
                  value={form.firstNote}
                  onChange={(value) => change('firstNote', value)}
                  placeholder="ניסיון קודם, זמינות, דברים שחשוב לזכור..."
                  multiline
                />
              </FormSection>

              {errorCount > 0 && (
                <ThemedText type="small" themeColor="danger" style={styles.centered}>
                  יש לתקן את השדות המסומנים
                </ThemedText>
              )}

              <Pressable
                disabled={planFull || saving}
                onPress={submit}
                style={({ pressed }) => [
                  styles.submit,
                  {
                    backgroundColor: planFull || saving ? theme.backgroundSelected : theme.accent,
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={styles.whiteText}>
                  {saving ? 'שומר…' : 'הוספת תלמיד'}
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

/** The student found by email. Name and phone come from their own account. */
function FoundAccount({ account }: { account: StudentAccount }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.found,
        { backgroundColor: theme.background, borderColor: theme.slotAvailable },
      ]}>
      <SymbolView
        name={{
          ios: 'checkmark.seal.fill',
          android: 'verified',
          web: 'verified',
        }}
        size={22}
        tintColor={theme.slotAvailable}
      />
      <View style={styles.flex}>
        <ThemedText type="smallBold">
          {account.firstName} {account.lastName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {account.phone || 'ללא טלפון'} · רשום/ה במערכת
        </ThemedText>
      </View>
    </View>
  );
}

/** A required detail the student already entered at sign-up. */
function Given({ label }: { label: string }) {
  return (
    <View style={styles.given}>
      <ThemedText type="small" themeColor="slotAvailable">
        ✓
      </ThemedText>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        · הוזן על ידי התלמיד/ה
      </ThemedText>
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <ThemedText type="small">{children}</ThemedText>;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
  error,
  style,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  error?: string;
  style?: object;
  onSubmit?: () => void;
}) {
  const theme = useTheme();
  const isEmail = keyboardType === 'email-address';
  return (
    <View style={[styles.field, style]}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize={isEmail ? 'none' : undefined}
        autoComplete={isEmail ? 'off' : undefined}
        returnKeyType={onSubmit ? 'search' : undefined}
        onSubmitEditing={onSubmit}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: error ? theme.danger : 'transparent',
          },
        ]}
      />
      {error && (
        <ThemedText type="small" themeColor="danger" style={styles.hint}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.background },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="small" style={selected && styles.whiteText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function StepButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: theme.background },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor="accent" style={styles.stepLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.half,
  },
  centered: {
    textAlign: 'center',
  },
  whiteText: {
    color: '#ffffff',
  },
  limitCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  limitButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  inline: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  wide: {
    flex: 2,
  },
  given: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    fontSize: 14,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 20,
    lineHeight: 24,
  },
  stepValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 18,
  },
  searchButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Spacing.three,
  },
  submit: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
