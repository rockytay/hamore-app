import { router } from 'expo-router';
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

import { formatShekels } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getPlan, useCurrentUser } from '@/hooks/use-current-user';
import {
  formatPhone,
  isValidIsraeliId,
  isValidPhone,
  LICENSE_CATEGORIES,
  normalizePhone,
  StudentSaveError,
  TRANSMISSION_LABELS,
  useAddStudent,
  useStudents,
  type LicenseCategory,
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
  firstName: string;
  lastName: string;
  phone: string;
  idNumber: string;
  licenseCategory: LicenseCategory;
  transmission: Transmission;
  theoryPassed: boolean;
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
    firstName: '',
    lastName: '',
    phone: '',
    idNumber: '',
    licenseCategory: teacherCategories[0],
    transmission: user?.transmission ?? 'automatic',
    theoryPassed: false,
    lessonsCompleted: 0,
    balanceType: 'even',
    balanceAmount: '',
    firstNote: '',
  });

  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showAllCategories, setShowAllCategories] = useState(false);

  const plan = user ? getPlan(user.subscription.planId) : null;
  const planFull = plan !== null && students.length >= plan.maxStudents;
  const categories = showAllCategories ? ALL_CATEGORIES : teacherCategories;

  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): FormErrors => {
    const result: FormErrors = {};
    if (!form.firstName.trim()) result.firstName = 'יש להזין שם פרטי';
    if (!form.lastName.trim()) result.lastName = 'יש להזין שם משפחה';
    if (!isValidPhone(form.phone)) {
      result.phone = 'יש להזין מספר נייד תקין (10 ספרות, מתחיל ב־05)';
    } else if (students.some((s) => normalizePhone(s.phone) === normalizePhone(form.phone))) {
      result.phone = 'כבר קיים תלמיד עם מספר הטלפון הזה';
    }
    if (form.idNumber.trim() && !isValidIsraeliId(form.idNumber)) {
      result.idNumber = 'מספר תעודת הזהות אינו תקין';
    }
    if (form.balanceType !== 'even' && !(Number(form.balanceAmount) > 0)) {
      result.balanceAmount = 'יש להזין סכום';
    }
    return result;
  };

  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (planFull || saving) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const amount = Number(form.balanceAmount) || 0;
    setSaving(true);
    let student;
    try {
      student = await addStudent({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: formatPhone(form.phone),
      idNumber: form.idNumber.replace(/\D/g, '') || undefined,
      licenseCategory: form.licenseCategory,
      transmission: form.transmission,
      theoryPassed: form.theoryPassed,
      lessonsCompleted: form.lessonsCompleted,
      balance: form.balanceType === 'credit' ? amount : form.balanceType === 'debt' ? -amount : 0,
      firstNote: form.firstNote.trim() || undefined,
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

          <FormSection title="פרטי התלמיד">
            <View style={styles.inline}>
              <Input
                label="שם פרטי"
                value={form.firstName}
                onChange={(value) => change('firstName', value)}
                error={errors.firstName}
                style={styles.flex}
              />
              <Input
                label="שם משפחה"
                value={form.lastName}
                onChange={(value) => change('lastName', value)}
                error={errors.lastName}
                style={styles.flex}
              />
            </View>
            <Input
              label="טלפון נייד"
              value={form.phone}
              onChange={(value) => change('phone', value)}
              placeholder="050-1234567"
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <Input
              label="תעודת זהות (לא חובה)"
              value={form.idNumber}
              onChange={(value) => change('idNumber', value.replace(/\D/g, '').slice(0, 9))}
              placeholder="9 ספרות"
              keyboardType="number-pad"
              error={errors.idNumber}
            />
          </FormSection>

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
          </FormSection>

          <FormSection title="התחלה">
            <Label>שיעורים קודמים (למשל ממורה אחר)</Label>
            <View style={styles.stepper}>
              <StepButton
                label="−"
                disabled={form.lessonsCompleted === 0}
                onPress={() => change('lessonsCompleted', Math.max(0, form.lessonsCompleted - 1))}
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
              { backgroundColor: planFull || saving ? theme.backgroundSelected : theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.whiteText}>
              {saving ? 'שומר…' : 'הוספת תלמיד'}
            </ThemedText>
          </Pressable>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  error?: string;
  style?: object;
}) {
  const theme = useTheme();
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
