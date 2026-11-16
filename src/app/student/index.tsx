import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatShekels } from '@/components/payment-badge';
import {
  Button,
  Card,
  IconTile,
  LessonCard,
  NoTeacherYet,
  Section,
  StudentScreen,
  studentStyles,
} from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useSession } from '@/hooks/use-auth';
import { useStudentLessons, useStudentPortal, type Reminder } from '@/hooks/use-student-portal';
import { useTheme } from '@/hooks/use-theme';

const REMINDER_STYLE: Record<Reminder['tone'], { color: ThemeColor; icon: SymbolViewProps['name'] }> = {
  action: { color: 'accent', icon: { ios: 'checkmark.circle.fill', android: 'task_alt', web: 'task_alt' } },
  warning: { color: 'slotPending', icon: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' } },
  info: { color: 'slotBooked', icon: { ios: 'lightbulb.fill', android: 'lightbulb', web: 'lightbulb' } },
};

export default function StudentHomeScreen() {
  const session = useSession();
  const firstName = session?.role === 'student' ? session.profile.firstName : '';
  const { linked } = useStudentPortal();

  return (
    <StudentScreen title={firstName ? `שלום ${firstName}` : 'שלום'} requiresTeacher={false}>
      {linked ? <Home /> : <NoTeacherYet />}
    </StudentScreen>
  );
}

function Home() {
  const { record, teacher, reminders } = useStudentPortal();
  const { booked } = useStudentLessons();
  const nextLesson = booked[0];

  return (
    <>
      {teacher && (
        <ThemedText themeColor="textSecondary">
          המורה שלך: {teacher.firstName} {teacher.lastName}
        </ThemedText>
      )}

      <Section title="השיעור הבא">
        {nextLesson ? (
          <LessonCard lesson={nextLesson} />
        ) : (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              אין שיעור קרוב שנקבע.
            </ThemedText>
          </Card>
        )}
        <Button label="בקשת שיעור" onPress={() => router.push('/student/lessons/request')} />
      </Section>

      {reminders.length > 0 && (
        <Section title="תזכורות">
          {reminders.map((reminder) => (
            <ReminderCard key={reminder.id} reminder={reminder} />
          ))}
        </Section>
      )}

      {record && (
        <View style={studentStyles.row}>
          <Stat label="שיעורים שבוצעו" value={String(record.lessonsCompleted)} />
          <Stat
            label={record.balance < 0 ? 'יתרה לתשלום' : 'יתרת זכות'}
            value={formatShekels(record.balance)}
            danger={record.balance < 0}
          />
        </View>
      )}
    </>
  );
}

function ReminderCard({ reminder }: { reminder: Reminder }) {
  const { color, icon } = REMINDER_STYLE[reminder.tone];
  const link = reminder.link;
  return (
    <Pressable
      disabled={!link}
      onPress={() => link && router.navigate(link)}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.reminder}>
        <IconTile name={icon} color={color} />
        <View style={studentStyles.flex}>
          <ThemedText type="smallBold">{reminder.title}</ThemedText>
          {reminder.body && (
            <ThemedText type="small" themeColor="textSecondary">
              {reminder.body}
            </ThemedText>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  const theme = useTheme();
  return (
    <Card style={styles.stat}>
      <ThemedText type="smallBold" style={[styles.statValue, danger && { color: theme.danger }]}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  reminder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    lineHeight: 26,
  },
  pressed: {
    opacity: 0.7,
  },
});
