import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { formatShekels, PAYMENT_COLORS, PAYMENT_TITLES } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getEventStart, useCalendarEvents } from '@/hooks/use-calendar-events';
import { getPlan, useCurrentUser } from '@/hooks/use-current-user';
import {
  getPaymentStatus,
  LICENSE_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  REMOVAL_REASON_LABELS,
  TRANSMISSION_LABELS,
  useAddLessonNote,
  useAddPayment,
  useRemoveStudent,
  useRestoreStudent,
  useStudent,
  useStudents,
  type PaymentMethod,
  type RemovalReason,
  type Student,
} from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/utils/dialogs';

const PAYMENT_DESCRIPTIONS = {
  credit: 'שולם מראש עבור שיעורים עתידיים',
  even: 'כל השיעורים שולמו',
  debt: 'נותר לשלם על שיעורים קודמים',
};

function formatDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export default function StudentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const student = useStudent(id);

  if (!student) {
    return (
      <ThemedView style={styles.notFound}>
        <Stack.Screen options={{ title: 'תלמיד לא נמצא' }} />
        <ThemedText themeColor="textSecondary">התלמיד לא נמצא.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: student.name }} />
      {/* "automatic" keeps content below the iOS navigation header instead of under it */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {student.removal && <FormerStudentBanner student={student} />}

        <View style={styles.header}>
          <ThemedText type="subtitle">{student.name}</ThemedText>
          <Pressable onPress={() => Linking.openURL(`tel:${student.phone.replace(/-/g, '')}`)}>
            <ThemedText themeColor="accent">{student.phone}</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {student.theoryPassed ? 'עבר/ה תאוריה' : 'טרם עבר/ה תאוריה'}
            {student.idNumber ? ` · ת״ז ${student.idNumber}` : ''}
          </ThemedText>
        </View>

        <View style={styles.stats}>
          <Stat label="שיעורים שבוצעו" value={String(student.lessonsCompleted)} />
          <Stat
            label="דרגת רישיון"
            value={student.licenseCategory}
            detail={LICENSE_CATEGORIES[student.licenseCategory]}
          />
          <Stat label="תיבת הילוכים" value={TRANSMISSION_LABELS[student.transmission]} />
        </View>

        <Section title="הערות מהשיעורים">
          <NoteComposer studentId={student.id} />
          {student.lessonNotes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              אין עדיין הערות.
            </ThemedText>
          ) : (
            student.lessonNotes.map((note) => (
              <ThemedView key={note.id} type="backgroundElement" style={styles.note}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(note.date)}
                </ThemedText>
                <ThemedText type="small">{note.text}</ThemedText>
              </ThemedView>
            ))
          )}
        </Section>

        <Section title="מצב תשלומים">
          <PaymentCard student={student} />
          <PaymentComposer studentId={student.id} />
          {student.payments.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              עדיין לא נרשמו תשלומים.
            </ThemedText>
          ) : (
            student.payments.map((payment) => (
              <ThemedView key={payment.id} type="backgroundElement" style={styles.paymentRow}>
                <ThemedText type="smallBold">{formatShekels(payment.amount)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.paymentRowDetail}>
                  {PAYMENT_METHOD_LABELS[payment.method]} · {formatDate(payment.paidAt)}
                  {payment.note ? ` · ${payment.note}` : ''}
                </ThemedText>
              </ThemedView>
            ))
          )}
        </Section>

        {!student.removal && <RemoveStudentSection student={student} />}
      </ScrollView>
    </ThemedView>
  );
}

/** Shown on a student the teacher removed: why and when, and a way to bring them back. */
function FormerStudentBanner({ student }: { student: Student }) {
  const theme = useTheme();
  const user = useCurrentUser();
  const activeCount = useStudents().length;
  const restoreStudent = useRestoreStudent();
  const [busy, setBusy] = useState(false);
  const removal = student.removal!;
  const passed = removal.reason === 'passed_test';

  const restore = async () => {
    const plan = user ? getPlan(user.subscription.planId) : null;
    if (plan && activeCount >= plan.maxStudents) {
      showMessage(
        'הגעתם למכסת התלמידים',
        `המסלול ${plan.name} כולל עד ${plan.maxStudents} תלמידים. כדי להחזיר את ${student.name} יש לשדרג את המסלול או להסיר תלמיד אחר.`
      );
      return;
    }
    setBusy(true);
    const error = await restoreStudent(student.id);
    setBusy(false);
    if (error) showMessage('שגיאה', error);
  };

  return (
    <View
      style={[styles.banner, { backgroundColor: passed ? theme.slotAvailable : theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={passed && styles.whiteText}>
        {passed ? 'עבר/ה טסט 🎉' : `תלמיד/ה לשעבר · ${REMOVAL_REASON_LABELS[removal.reason]}`}
      </ThemedText>
      <ThemedText type="small" style={passed ? styles.whiteText : undefined} themeColor="textSecondary">
        הוסר/ה מהרשימה ב־{formatDate(removal.removedAt)}
        {removal.note ? ` · ${removal.note}` : ''}
      </ThemedText>
      <Pressable
        disabled={busy}
        onPress={restore}
        style={({ pressed }) => [
          styles.bannerButton,
          { backgroundColor: theme.background },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" themeColor="accent">
          {busy ? 'מחזיר…' : 'החזרה לרשימת התלמידים'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const REMOVAL_REASONS = Object.keys(REMOVAL_REASON_LABELS) as RemovalReason[];

/**
 * Removes the student from the teacher's list. Nothing is deleted: lessons, payments
 * and notes stay, and the student can be brought back from the former students list.
 */
function RemoveStudentSection({ student }: { student: Student }) {
  const theme = useTheme();
  const removeStudent = useRemoveStudent();
  const { events, reload: reloadCalendar } = useCalendarEvents();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RemovalReason>('passed_test');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const upcomingLessons = events.filter(
    (event) =>
      event.status !== 'available' && event.studentId === student.id && getEventStart(event) > now
  ).length;

  const remove = () => {
    const lessonsLine =
      upcomingLessons > 0
        ? upcomingLessons === 1
          ? 'השיעור העתידי שנקבע עם התלמיד יבוטל.'
          : `${upcomingLessons} השיעורים העתידיים שנקבעו עם התלמיד יבוטלו.`
        : '';
    confirmAction(
      `הסרת ${student.name}`,
      [lessonsLine, 'השיעורים, התשלומים וההערות הקודמים נשמרים, ואפשר להחזיר את התלמיד בכל עת.']
        .filter(Boolean)
        .join('\n'),
      'הסרה',
      async () => {
        setBusy(true);
        const error = await removeStudent(student.id, reason, reason === 'other' ? note : '');
        setBusy(false);
        if (error) {
          showMessage('שגיאה', error);
          return;
        }
        setOpen(false);
        await reloadCalendar();
      }
    );
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.removeButton, { borderColor: theme.danger }, pressed && styles.pressed]}>
        <ThemedText type="smallBold" themeColor="danger">
          הסרה מרשימת התלמידים
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.composer}>
      <ThemedText type="smallBold">למה מסירים את {student.name}?</ThemedText>
      <View style={styles.methods}>
        {REMOVAL_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: r === reason }}>
            <ThemedView
              type={r === reason ? 'background' : 'backgroundSelected'}
              style={[styles.method, r === reason && { borderColor: theme.accent }]}>
              <ThemedText type={r === reason ? 'smallBold' : 'small'}>{REMOVAL_REASON_LABELS[r]}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
      {reason === 'other' && (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="סיבה (לא חובה)"
          placeholderTextColor={theme.textSecondary}
          style={[styles.amountInput, { color: theme.text, backgroundColor: theme.background }]}
        />
      )}
      {student.balance < 0 && (
        <ThemedText type="small" themeColor="danger">
          שימו לב: ל{student.name} נשאר חוב של {formatShekels(student.balance)}. החוב יישאר רשום גם אחרי ההסרה.
        </ThemedText>
      )}
      <Pressable
        disabled={busy}
        onPress={remove}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: busy ? theme.backgroundSelected : theme.danger },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={styles.addButtonText}>
          {busy ? 'מסיר…' : 'הסרה מהרשימה'}
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor="textSecondary">
          ביטול
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function NoteComposer({ studentId }: { studentId: string }) {
  const theme = useTheme();
  const addLessonNote = useAddLessonNote();
  const [text, setText] = useState('');
  const trimmed = text.trim();

  return (
    <ThemedView type="backgroundElement" style={styles.composer}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="מה עבד טוב בשיעור ומה לשפר בשיעור הבא?"
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />
      <Pressable
        disabled={!trimmed}
        onPress={async () => {
          setText('');
          Keyboard.dismiss();
          const error = await addLessonNote(studentId, trimmed);
          if (error) {
            setText(trimmed);
            showMessage('שגיאה', error);
          }
        }}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: trimmed ? theme.accent : theme.backgroundSelected },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={styles.addButtonText}>
          הוספת הערה
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

function PaymentComposer({ studentId }: { studentId: string }) {
  const theme = useTheme();
  const addPayment = useAddPayment();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const valid = Number.isInteger(value) && value > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    Keyboard.dismiss();
    const error = await addPayment(studentId, { amount: value, method });
    setBusy(false);
    if (error) {
      showMessage('שגיאה', error);
      return;
    }
    setAmount('');
  };

  return (
    <ThemedView type="backgroundElement" style={styles.composer}>
      <ThemedText type="smallBold">רישום תשלום</ThemedText>
      <TextInput
        value={amount}
        onChangeText={(text) => setAmount(text.replace(/\D/g, ''))}
        placeholder="סכום בשקלים"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        style={[styles.amountInput, { color: theme.text, backgroundColor: theme.background }]}
      />
      <View style={styles.methods}>
        {METHODS.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMethod(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected: m === method }}>
            <ThemedView
              type={m === method ? 'background' : 'backgroundSelected'}
              style={[styles.method, m === method && { borderColor: theme.accent }]}>
              <ThemedText type={m === method ? 'smallBold' : 'small'}>{PAYMENT_METHOD_LABELS[m]}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
      <Pressable
        disabled={!valid || busy}
        onPress={submit}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: valid && !busy ? theme.accent : theme.backgroundSelected },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={styles.addButtonText}>
          {busy ? 'שומר…' : valid ? `רישום תשלום של ${formatShekels(value)}` : 'רישום תשלום'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.statDetail}>
          {detail}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

function PaymentCard({ student }: { student: Student }) {
  const theme = useTheme();
  const status = getPaymentStatus(student.balance);

  return (
    <View style={[styles.paymentCard, { backgroundColor: theme[PAYMENT_COLORS[status]] }]}>
      <ThemedText type="smallBold" style={styles.paymentText}>
        {PAYMENT_TITLES[status]}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.paymentText}>
        {formatShekels(student.balance)}
      </ThemedText>
      <ThemedText type="small" style={styles.paymentText}>
        {PAYMENT_DESCRIPTIONS[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: Spacing.one,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 24,
  },
  statDetail: {
    fontSize: 11,
    lineHeight: 14,
  },
  section: {
    gap: Spacing.two,
  },
  note: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  paymentCard: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  paymentText: {
    color: '#ffffff',
  },
  composer: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  input: {
    minHeight: 72,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  amountInput: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  methods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  method: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  paymentRowDetail: {
    flex: 1,
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  addButtonText: {
    color: '#ffffff',
  },
  banner: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  bannerButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  whiteText: {
    color: '#ffffff',
  },
  removeButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
