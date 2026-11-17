import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ChoiceChips, FieldHint, FieldLabel, TextField } from '@/components/form-ui';
import { Button, Card, Section } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth, type DeletionFeedback } from '@/hooks/use-auth';
import { useStudents } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/utils/dialogs';

type StudentReason = 'passed_test' | 'other';

const STUDENT_REASONS: { value: StudentReason; label: string }[] = [
  { value: 'passed_test', label: 'עברתי את הטסט המעשי 🎉' },
  { value: 'other', label: 'סיבה אחרת' },
];

const SATISFIED_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'כן, הייתי מרוצה' },
  { value: 'no', label: 'לא ממש' },
];

/**
 * Deletes the signed-in account, teacher or student. Asks why first; the answers are kept
 * (without the user's name or contact details) for the Hamore team to review.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const { session, deleteAccount } = useAuth();
  const studentCount = useStudents().length;
  const [reason, setReason] = useState<StudentReason | null>(null);
  const [satisfied, setSatisfied] = useState<'yes' | 'no' | null>(null);
  const [details, setDetails] = useState('');
  const [improvements, setImprovements] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;
  const isTeacher = session.role === 'teacher';

  /** The feedback, or an error in Hebrew if a required answer is missing. */
  const buildFeedback = (): DeletionFeedback | string => {
    if (isTeacher) {
      if (!satisfied) return 'יש לענות אם היית מרוצה מהאפליקציה.';
      if (satisfied === 'no' && !details.trim()) return 'נשמח לדעת מה לא עבד. יש לתאר בכמה מילים.';
      return { role: 'teacher', satisfied: satisfied === 'yes', details, improvements };
    }
    if (!reason) return 'יש לבחור סיבה.';
    if (reason === 'other' && !details.trim()) return 'יש לתאר את הסיבה.';
    return { role: 'student', reason, details: reason === 'other' ? details : '', improvements };
  };

  const submit = () => {
    const feedback = buildFeedback();
    if (typeof feedback === 'string') return setError(feedback);
    if (!password) return setError('יש להזין סיסמה לאישור.');
    setError(null);
    confirmAction(
      'מחיקת החשבון',
      'החשבון יימחק לצמיתות ולא ניתן יהיה לשחזר אותו.',
      'מחיקה לצמיתות',
      async () => {
        setBusy(true);
        const failed = await deleteAccount(password, feedback);
        setBusy(false);
        if (failed) {
          setError(failed);
          return;
        }
        // Signed out now: the root layout shows the sign-in screen.
        showMessage('החשבון נמחק', 'תודה שהשתמשת במורה. המשוב שלך נשמר ויעזור לנו להשתפר.');
      }
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <View style={[styles.warning, { borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">
            מחיקה לצמיתות
          </ThemedText>
          <ThemedText type="small">
            {isTeacher
              ? `החשבון יימחק יחד עם כל הנתונים שלך: ${studentCount > 0 ? `${studentCount} תלמידים, ` : ''}שיעורים, תשלומים, הערות וזמנים פנויים. התלמידים ישמרו את החשבון שלהם, אבל לא יהיו משויכים אליך יותר.`
              : 'החשבון והפרטים האישיים שלך יימחקו. השיעורים העתידיים שנקבעו יבוטלו. המורה ישמור את היסטוריית השיעורים והתשלומים שלך.'}
          </ThemedText>
        </View>

        {isTeacher ? (
          <Section title="לפני שנפרדים">
            <Card style={styles.form}>
              <FieldLabel>האם היית מרוצה מהחוויה באפליקציה?</FieldLabel>
              <ChoiceChips options={SATISFIED_OPTIONS} value={satisfied} onChange={setSatisfied} />
              {satisfied === 'no' && (
                <TextField
                  label="מה לא עבד או הפריע לך?"
                  value={details}
                  onChange={setDetails}
                  placeholder="ספר/י לנו מה היה קשה, חסר או לא נוח"
                  multiline
                />
              )}
              {satisfied !== null && (
                <TextField
                  label={satisfied === 'no' ? 'מה היה צריך לשפר? (לא חובה)' : 'יש משהו שהיינו יכולים לשפר? (לא חובה)'}
                  value={improvements}
                  onChange={setImprovements}
                  multiline
                />
              )}
            </Card>
          </Section>
        ) : (
          <Section title="למה את/ה מוחק/ת את החשבון?">
            <Card style={styles.form}>
              <ChoiceChips options={STUDENT_REASONS} value={reason} onChange={setReason} />
              {reason === 'other' && (
                <TextField
                  label="מה הסיבה?"
                  value={details}
                  onChange={setDetails}
                  placeholder="נשמח לדעת כדי להשתפר"
                  multiline
                />
              )}
              {reason !== null && (
                <TextField
                  label="יש משהו שהיינו יכולים לשפר? (לא חובה)"
                  value={improvements}
                  onChange={setImprovements}
                  multiline
                />
              )}
            </Card>
          </Section>
        )}

        <Section title="אישור">
          <Card style={styles.form}>
            <FieldLabel>הסיסמה שלך</FieldLabel>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="לאישור המחיקה"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
            />
            <FieldHint>המשוב נשמר בלי שם, טלפון או אימייל.</FieldHint>
          </Card>
        </Section>

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.centered}>
            {error}
          </ThemedText>
        )}
        <Button label="מחיקת החשבון" variant="danger" onPress={submit} busy={busy} />
        <Button label="ביטול" variant="secondary" onPress={() => router.back()} disabled={busy} />
      </ScrollView>
    </ThemedView>
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
    gap: Spacing.four,
  },
  warning: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
  },
  form: {
    gap: Spacing.two,
  },
  input: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 14,
  },
  centered: {
    textAlign: 'center',
  },
});
