import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  DateField,
  FieldHint,
  FieldLabel,
  formStyles,
  InfoRow,
  LinkButton,
  optionsOf,
  TextField,
  ToggleRow,
} from '@/components/form-ui';
import { formatShekels } from '@/components/payment-badge';
import { Button, Card, EmptyText, Section } from '@/components/student-ui';
import { TeacherFileScreen } from '@/components/teacher-file-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  formatMinutes,
  getAppealDeadline,
  parseMinutes,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  type StudentTest,
  type TestResult,
} from '@/hooks/student-file';
import { useStudentFileActions, type Student } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/utils/dialogs';
import { formatDate, formatTime } from '@/utils/dates';

export default function StudentTestsScreen() {
  return <TeacherFileScreen>{(student) => <Tests student={student} />}</TeacherFileScreen>;
}

const RESULT_COLORS = {
  scheduled: 'slotBooked',
  passed: 'slotAvailable',
  failed: 'danger',
  cancelled: 'backgroundSelected',
} as const satisfies Record<TestResult, string>;

function Tests({ student }: { student: Student }) {
  const { deleteTest } = useStudentFileActions();
  // null: closed; 'new': adding; an id: editing that test.
  const [editing, setEditing] = useState<string | null>(null);
  const readOnly = !!student.removal;
  const editingTest = student.tests.find((test) => test.id === editing);

  const nextPracticalAttempt =
    student.tests.filter((test) => test.kind === 'practical' && test.result !== 'cancelled').length + 1;

  return (
    <Section
      title="טסטים פנימיים ומעשיים"
      action={!readOnly && editing === null ? <LinkButton label="+ טסט חדש" onPress={() => setEditing('new')} /> : null}>
      {editing !== null && (
        <TestForm
          key={editing}
          studentId={student.id}
          test={editingTest}
          nextPracticalAttempt={nextPracticalAttempt}
          onDone={() => setEditing(null)}
        />
      )}
      {student.tests.length === 0 && editing === null && <EmptyText>עדיין לא נקבעו מבחנים.</EmptyText>}
      {student.tests.map((test) =>
        test.id === editing ? null : (
          <TestCard
            key={test.id}
            test={test}
            onEdit={readOnly || editing !== null ? undefined : () => setEditing(test.id)}
            onDelete={
              readOnly || editing !== null
                ? undefined
                : () =>
                    confirmAction('מחיקת טסט', 'למחוק את הטסט מהתיק?', 'מחיקה', async () => {
                      const error = await deleteTest(student.id, test.id);
                      if (error) showMessage('שגיאה', error);
                    })
            }
          />
        )
      )}
    </Section>
  );
}

function TestCard({ test, onEdit, onDelete }: { test: StudentTest; onEdit?: () => void; onDelete?: () => void }) {
  const theme = useTheme();
  const appealUntil = test.kind === 'practical' && test.result === 'failed' ? getAppealDeadline(test.scheduledAt) : null;
  return (
    <Card>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.flex}>
          {TEST_KIND_LABELS[test.kind]}
          {test.kind === 'practical' ? ` · ניסיון ${test.attempt}` : ''}
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: theme[RESULT_COLORS[test.result]] }]}>
          <ThemedText type="small" style={test.result === 'cancelled' ? undefined : styles.white}>
            {TEST_RESULT_LABELS[test.result]}
          </ThemedText>
        </View>
      </View>
      <InfoRow label="מועד" value={`${formatDate(test.scheduledAt)} · ${formatTime(test.scheduledAt)}`} />
      {test.location ? <InfoRow label="מקום" value={test.location} /> : null}
      {test.kind === 'practical' && (
        <InfoRow
          label="אגרת טסט"
          value={test.feePaid ? `שולמה${test.feeReference ? ` · ${test.feeReference}` : ''}` : 'לא שולמה'}
          danger={!test.feePaid && test.result === 'scheduled'}
        />
      )}
      {test.vehicleFee !== null && <InfoRow label="העמדת רכב" value={formatShekels(test.vehicleFee)} />}
      {test.failureReasons ? <InfoRow label="סיבות הכישלון" value={test.failureReasons} /> : null}
      {appealUntil && <InfoRow label="ערעור עד" value={formatDate(appealUntil)} />}
      {test.notes ? (
        <ThemedText type="small" themeColor="textSecondary">
          {test.notes}
        </ThemedText>
      ) : null}
      {(onEdit || onDelete) && (
        <View style={styles.actions}>
          {onEdit && <LinkButton label="עריכה" onPress={onEdit} />}
          {onDelete && <LinkButton label="מחיקה" danger onPress={onDelete} />}
        </View>
      )}
    </Card>
  );
}

function TestForm({
  studentId,
  test,
  nextPracticalAttempt,
  onDone,
}: {
  studentId: string;
  test?: StudentTest;
  nextPracticalAttempt: number;
  onDone: () => void;
}) {
  const { saveTest } = useStudentFileActions();
  const [draft, setDraft] = useState<Omit<StudentTest, 'id'>>(
    test ?? {
      kind: 'practical',
      scheduledAt: new Date(),
      location: '',
      attempt: nextPracticalAttempt,
      result: 'scheduled',
      feePaid: false,
      feeReference: '',
      vehicleFee: null,
      failureReasons: '',
      notes: '',
    }
  );
  const [day, setDay] = useState<Date | null>(test ? test.scheduledAt : null);
  const [time, setTime] = useState(
    test ? formatMinutes(test.scheduledAt.getHours() * 60 + test.scheduledAt.getMinutes()) : '08:00'
  );
  const [vehicleFee, setVehicleFee] = useState(draft.vehicleFee?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (changes: Partial<Omit<StudentTest, 'id'>>) => setDraft((current) => ({ ...current, ...changes }));

  const save = async () => {
    const minutes = parseMinutes(time);
    if (!day) return setError('יש להזין תאריך.');
    if (minutes === null) return setError('שעה בפורמט 08:30.');
    const scheduledAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
    setError(null);
    setBusy(true);
    const failed = await saveTest(
      studentId,
      {
        ...draft,
        scheduledAt,
        attempt: draft.kind === 'practical' ? draft.attempt : 1,
        vehicleFee: vehicleFee === '' ? null : Number(vehicleFee),
        failureReasons: draft.result === 'failed' ? draft.failureReasons : '',
      },
      test?.id
    );
    setBusy(false);
    if (failed) return showMessage('שגיאה', failed);
    onDone();
  };

  return (
    <Card style={styles.form}>
      <ChoiceChips options={optionsOf(TEST_KIND_LABELS)} value={draft.kind} onChange={(kind) => kind && change({ kind })} />
      <View style={formStyles.row}>
        <View style={[formStyles.rowItem, styles.wide]}>
          <DateField label="תאריך" value={day} onChange={setDay} />
        </View>
        <View style={formStyles.rowItem}>
          <TextField label="שעה" value={time} onChange={setTime} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <TextField
        label="מקום / מגרש"
        value={draft.location}
        onChange={(location) => change({ location })}
        placeholder="למשל: מגרש טסטים חולון"
      />
      {draft.kind === 'practical' && (
        <>
          <FieldLabel>מספר ניסיון</FieldLabel>
          <ChoiceChips
            options={[1, 2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))}
            value={draft.attempt}
            onChange={(attempt) => attempt && change({ attempt })}
          />
          <ToggleRow label="אגרת הטסט שולמה" value={draft.feePaid} onChange={(feePaid) => change({ feePaid })} />
          {draft.feePaid && (
            <TextField
              label="אסמכתא"
              value={draft.feeReference}
              onChange={(feeReference) => change({ feeReference })}
              placeholder="מספר קבלה"
            />
          )}
        </>
      )}
      <TextField
        label="תשלום העמדת רכב (₪, לא חובה)"
        value={vehicleFee}
        onChange={(text) => setVehicleFee(text.replace(/\D/g, ''))}
        keyboardType="number-pad"
      />
      <FieldLabel>תוצאה</FieldLabel>
      <ChoiceChips
        options={optionsOf(TEST_RESULT_LABELS)}
        value={draft.result}
        onChange={(result) => result && change({ result })}
      />
      {draft.result === 'failed' && (
        <TextField
          label="סיבות הכישלון (מהטופס)"
          value={draft.failureReasons}
          onChange={(failureReasons) => change({ failureReasons })}
          multiline
        />
      )}
      <TextField label="הערות" value={draft.notes} onChange={(notes) => change({ notes })} multiline />
      {error && <FieldHint danger>{error}</FieldHint>}
      <View style={formStyles.row}>
        <View style={formStyles.rowItem}>
          <Button label="שמירה" onPress={save} busy={busy} />
        </View>
        <View style={formStyles.rowItem}>
          <Button label="ביטול" variant="secondary" onPress={onDone} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  wide: {
    flex: 2,
  },
  form: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  white: {
    color: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
});
