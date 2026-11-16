import { useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatShekels } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useSession } from '@/hooks/use-auth';
import { useStudentPortal, type StudentLesson } from '@/hooks/use-student-portal';
import { useTheme } from '@/hooks/use-theme';
import { formatLessonTime } from '@/utils/dates';

/**
 * A student tab: title, pull to refresh, and quiet reloading whenever the tab is opened,
 * so changes the teacher made show up. Shows the loading, error and "no teacher yet"
 * states, so each screen only renders its own content.
 */
export function StudentScreen({
  title,
  children,
  requiresTeacher = true,
}: {
  title: string;
  children: ReactNode;
  /** Most tabs have nothing to show until a teacher adds the student. */
  requiresTeacher?: boolean;
}) {
  const { loading, error, linked, reload } = useStudentPortal();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload(true);
    }, [reload])
  );

  const refresh = async () => {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  };

  let content = children;
  if (loading) {
    content = <ActivityIndicator style={styles.spinner} />;
  } else if (error) {
    content = (
      <View style={styles.message}>
        <ThemedText type="small" themeColor="danger" style={styles.centered}>
          {error}
        </ThemedText>
        <Button label="ניסיון חוזר" variant="secondary" onPress={() => reload()} />
      </View>
    );
  } else if (requiresTeacher && !linked) {
    content = <NoTeacherYet />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {content}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Until a teacher adds the student by email, there is nothing to show. */
export function NoTeacherYet() {
  const theme = useTheme();
  const session = useSession();
  const email = session?.role === 'student' ? session.profile.email : '';
  return (
    <Card style={styles.noTeacher}>
      <SymbolView
        name={{ ios: 'person.badge.clock', android: 'pending', web: 'pending' }}
        size={40}
        tintColor={theme.accent}
      />
      <ThemedText type="smallBold" style={styles.centered}>
        עדיין לא נוספת לרשימה של מורה
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        תנו למורה שלכם את כתובת האימייל שאיתה נרשמתם. אחרי שהמורה יוסיף אתכם, השיעורים,
        התשלומים וההתקדמות שלכם יופיעו כאן.
      </ThemedText>
      {email ? (
        <ThemedView type="background" style={styles.emailPill}>
          <ThemedText type="smallBold">{email}</ThemedText>
        </ThemedView>
      ) : null}
    </Card>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
        {action}
      </View>
      {children}
    </View>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const inactive = busy || disabled;
  const background =
    variant === 'primary' ? theme.accent : variant === 'danger' ? theme.danger : theme.background;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: inactive ? theme.backgroundSelected : background },
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? theme.text : '#ffffff'} />
      ) : (
        <ThemedText
          type="smallBold"
          style={variant !== 'secondary' && !inactive ? styles.whiteText : undefined}
          themeColor={variant === 'secondary' ? 'text' : undefined}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const STATUS_LABELS = {
  awaitingMe: { label: 'מחכה לאישור שלך', color: 'slotPending' },
  awaitingTeacher: { label: 'מחכה לאישור המורה', color: 'slotPending' },
  booked: { label: 'נקבע', color: 'slotBooked' },
  past: { label: 'בוצע', color: 'slotAvailable' },
} satisfies Record<string, { label: string; color: ThemeColor }>;

export function getLessonState(lesson: StudentLesson, now = new Date()): keyof typeof STATUS_LABELS {
  if (lesson.status === 'pending') return lesson.awaiting === 'student' ? 'awaitingMe' : 'awaitingTeacher';
  return lesson.end <= now ? 'past' : 'booked';
}

/** A lesson with its time, type, price and status. Actions (approve, withdraw) go in children. */
export function LessonCard({ lesson, children }: { lesson: StudentLesson; children?: ReactNode }) {
  const theme = useTheme();
  const state = getLessonState(lesson);
  const { label, color } = STATUS_LABELS[state];
  return (
    <Card style={styles.lesson}>
      <View style={[styles.lessonStripe, { backgroundColor: theme[color] }]} />
      <View style={styles.lessonBody}>
        <View style={styles.lessonHeader}>
          <ThemedText type="smallBold" style={styles.flex}>
            {formatLessonTime(lesson.start, lesson.end)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatShekels(lesson.price)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {lesson.lessonTypeName} · {label}
        </ThemedText>
        {children}
      </View>
    </Card>
  );
}

export function IconTile({ name, color }: { name: SymbolViewProps['name']; color: ThemeColor }) {
  const theme = useTheme();
  return (
    <View style={[styles.iconTile, { backgroundColor: theme[color] }]}>
      <SymbolView name={name} size={18} tintColor="#ffffff" />
    </View>
  );
}

export const studentStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  action: {
    flex: 1,
  },
});

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
  spinner: {
    marginTop: Spacing.five,
  },
  message: {
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  noTeacher: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  emailPill: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  whiteText: {
    color: '#ffffff',
  },
  lesson: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: 0,
    overflow: 'hidden',
  },
  lessonStripe: {
    width: 5,
  },
  lessonBody: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingEnd: Spacing.three,
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
