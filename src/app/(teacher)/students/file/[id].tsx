import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  DateField,
  FieldHint,
  FieldLabel,
  formStyles,
  optionsOf,
  TextField,
  ToggleRow,
} from '@/components/form-ui';
import { Button, Card, Section } from '@/components/student-ui';
import { TeacherFileScreen } from '@/components/teacher-file-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  addYears,
  PAYER_LABELS,
  PAYMENT_PLAN_LABELS,
  PRIOR_LICENSE_LABELS,
  REFERRAL_LABELS,
  STUDENT_STATUS_LABELS,
  type StudentFile,
} from '@/hooks/student-file';
import { getLessonTypePrice, useLessonTypes } from '@/hooks/use-calendar-events';
import { useCurrentUser } from '@/hooks/use-current-user';
import { PAYMENT_METHOD_LABELS, useStudentFileActions, type Student } from '@/hooks/use-students';
import { showMessage } from '@/utils/dialogs';
import { formatDate } from '@/utils/dates';

export default function StudentFileScreen() {
  return <TeacherFileScreen>{(student) => <FileForm key={student.id} student={student} />}</TeacherFileScreen>;
}

const READINESS_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({ value, label: '★'.repeat(value) }));

function FileForm({ student }: { student: Student }) {
  const teacher = useCurrentUser();
  const lessonTypes = useLessonTypes();
  const { updateFile, setStudentPrice } = useStudentFileActions();
  const readOnly = !!student.removal;

  const [draft, setDraft] = useState<StudentFile>(student.file);
  const [hasGreenForm, setHasGreenForm] = useState(student.file.greenFormIssuedAt !== null);
  const [cancelHours, setCancelHours] = useState(String(student.file.cancellationNoticeHours));
  // Lesson type id → typed price ('' = the usual price).
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(lessonTypes.map((type) => [type.id, student.prices[type.id]?.toString() ?? '']))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (changes: Partial<StudentFile>) => setDraft((current) => ({ ...current, ...changes }));
  const validity = teacher?.validity;

  const save = async () => {
    if (hasGreenForm && !draft.greenFormIssuedAt) return setError('יש להזין את תאריך הנפקת הטופס הירוק.');
    const hours = Number(cancelHours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) return setError('שעות לביטול: מספר בין 0 ל־168.');
    const today = new Date();
    if ((draft.greenFormIssuedAt && draft.greenFormIssuedAt > today) || (draft.theoryPassedAt && draft.theoryPassedAt > today)) {
      return setError('תאריך לא יכול להיות בעתיד.');
    }
    setError(null);
    setBusy(true);

    const file: StudentFile = {
      ...draft,
      greenFormIssuedAt: hasGreenForm ? draft.greenFormIssuedAt : null,
      theoryPassedAt: draft.theoryPassed ? draft.theoryPassedAt : null,
      cancellationNoticeHours: hours,
    };
    const errors = [await updateFile(student.id, file)];
    for (const type of lessonTypes) {
      const typed = prices[type.id]?.trim() ?? '';
      const next = typed === '' ? null : Number(typed);
      const current = student.prices[type.id] ?? null;
      if (next !== current && (next === null || Number.isInteger(next))) {
        errors.push(await setStudentPrice(student.id, type.id, next));
      }
    }
    setBusy(false);

    const failed = errors.find(Boolean);
    if (failed) {
      showMessage('שגיאה', failed);
      return;
    }
    if (router.canGoBack()) router.back();
  };

  const expiryHint = (date: Date | null, years: number | undefined) =>
    date && years ? `בתוקף עד ${formatDate(addYears(date, years))}` : undefined;

  return (
    <>
      <Section title="סטטוס">
        <Card style={formStyles.row}>
          <View style={[formStyles.rowItem, styles.tight]}>
            <ChoiceChips
              options={optionsOf(STUDENT_STATUS_LABELS)}
              value={draft.status}
              onChange={(status) => status && change({ status })}
            />
            <FieldHint>
              {draft.status === 'frozen'
                ? 'בהקפאה: התלמיד/ה לא יכול/ה לבקש שיעורים חדשים.'
                : 'הוצאת רישיון או עזיבה: דרך "הסרה מרשימת התלמידים" בעמוד התלמיד.'}
            </FieldHint>
          </View>
        </Card>
        <Card style={styles.tight}>
          <FieldLabel>מוכנות לטסט (רק את/ה רואה)</FieldLabel>
          <ChoiceChips
            options={READINESS_OPTIONS}
            value={draft.testReadiness}
            onChange={(testReadiness) => change({ testReadiness })}
            allowNone
          />
        </Card>
      </Section>

      <Section title="תיק משרד התחבורה">
        <Card style={styles.form}>
          <ToggleRow label="יש טופס ירוק" value={hasGreenForm} onChange={setHasGreenForm} disabled={readOnly} />
          {hasGreenForm && (
            <DateField
              label="תאריך הנפקה"
              value={draft.greenFormIssuedAt}
              onChange={(greenFormIssuedAt) => change({ greenFormIssuedAt })}
              hint={expiryHint(draft.greenFormIssuedAt, validity?.greenFormValidYears)}
            />
          )}
          <ToggleRow
            label="בדיקת ראייה בוצעה"
            value={draft.eyeTestDone}
            onChange={(eyeTestDone) => change({ eyeTestDone })}
            disabled={readOnly}
          />
          <ToggleRow
            label="חייב/ת משקפיים או עדשות"
            hint="מגבלה ברישיון"
            value={draft.needsGlasses}
            onChange={(needsGlasses) => change({ needsGlasses })}
            disabled={readOnly}
          />
          <ToggleRow
            label="הצהרת בריאות אושרה"
            hint="כן/לא בלבד. לא שומרים פרטים רפואיים."
            value={draft.healthDeclarationDone}
            onChange={(healthDeclarationDone) => change({ healthDeclarationDone })}
            disabled={readOnly}
          />
          <ToggleRow
            label="עבר/ה מבחן תאוריה"
            hint={draft.theoryPassed ? undefined : 'התלמיד/ה מקבל/ת תזכורת באפליקציה'}
            value={draft.theoryPassed}
            onChange={(theoryPassed) => change({ theoryPassed })}
            disabled={readOnly}
          />
          {draft.theoryPassed && (
            <DateField
              label="תאריך מבחן התאוריה"
              value={draft.theoryPassedAt}
              onChange={(theoryPassedAt) => change({ theoryPassedAt })}
              hint={expiryHint(draft.theoryPassedAt, validity?.theoryValidYears)}
            />
          )}
          <FieldLabel>רישיון קודם</FieldLabel>
          <ChoiceChips
            options={optionsOf(PRIOR_LICENSE_LABELS)}
            value={draft.priorLicense}
            onChange={(priorLicense) => priorLicense && change({ priorLicense })}
          />
        </Card>
      </Section>

      <Section title="כספים">
        <Card style={styles.form}>
          <FieldLabel>תוכנית תשלום</FieldLabel>
          <ChoiceChips
            options={optionsOf(PAYMENT_PLAN_LABELS)}
            value={draft.paymentPlan}
            onChange={(paymentPlan) => paymentPlan && change({ paymentPlan })}
          />
          <TextField
            value={draft.paymentPlanNote}
            onChange={(paymentPlanNote) => change({ paymentPlanNote })}
            placeholder="פרטים, למשל: חבילה של 10 שיעורים ב־1,400 ₪"
          />
          <FieldLabel>מי משלם</FieldLabel>
          <ChoiceChips
            options={optionsOf(PAYER_LABELS)}
            value={draft.payer}
            onChange={(payer) => payer && change({ payer })}
          />
          <FieldLabel>אמצעי תשלום מועדף</FieldLabel>
          <ChoiceChips
            options={optionsOf(PAYMENT_METHOD_LABELS)}
            value={draft.preferredPaymentMethod}
            onChange={(preferredPaymentMethod) => change({ preferredPaymentMethod })}
            allowNone
          />
        </Card>
        <Card style={styles.form}>
          <FieldLabel>מחיר מיוחד לתלמיד/ה (₪)</FieldLabel>
          <FieldHint>ריק = המחיר הרגיל. חל על שיעורים חדשים בלבד.</FieldHint>
          {lessonTypes.map((type) => (
            <View key={type.id} style={[formStyles.row, styles.centered]}>
              <ThemedText type="small" style={formStyles.rowItem}>
                {type.name}
              </ThemedText>
              <View style={formStyles.rowItem}>
                <TextField
                  value={prices[type.id] ?? ''}
                  onChange={(text) => setPrices((current) => ({ ...current, [type.id]: text.replace(/\D/g, '') }))}
                  placeholder={String(getLessonTypePrice(type, teacher))}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="ביטולים">
        <Card>
          <TextField
            label="ביטול ללא חיוב עד (שעות לפני השיעור)"
            value={cancelHours}
            onChange={(text) => setCancelHours(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
          />
        </Card>
      </Section>

      <Section title="מנהלי">
        <Card style={styles.tight}>
          <FieldLabel>איך הגיע/ה</FieldLabel>
          <ChoiceChips
            options={optionsOf(REFERRAL_LABELS)}
            value={draft.referralSource}
            onChange={(referralSource) => change({ referralSource })}
            allowNone
          />
          <FieldHint>הצטרף/ה ב־{formatDate(student.createdAt)}</FieldHint>
        </Card>
      </Section>

      {error && <FieldHint danger>{error}</FieldHint>}
      {!readOnly && <Button label="שמירת התיק" onPress={save} busy={busy} />}
    </>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  tight: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: 'center',
  },
});
