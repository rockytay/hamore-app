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
import {
  getPaymentStatus,
  LICENSE_CATEGORIES,
  TRANSMISSION_LABELS,
  useAddLessonNote,
  useStudent,
  type Student,
} from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';

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
        <View style={styles.header}>
          <ThemedText type="subtitle">{student.name}</ThemedText>
          <Pressable onPress={() => Linking.openURL(`tel:${student.phone.replace(/-/g, '')}`)}>
            <ThemedText themeColor="accent">{student.phone}</ThemedText>
          </Pressable>
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
        </Section>
      </ScrollView>
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
        onPress={() => {
          addLessonNote(studentId, trimmed);
          setText('');
          Keyboard.dismiss();
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
  addButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  addButtonText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
