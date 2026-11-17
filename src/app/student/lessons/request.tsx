import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatShekels } from '@/components/payment-badge';
import { Button, Card, EmptyText, NoTeacherYet, Section } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { LessonType } from '@/hooks/use-calendar-events';
import { getStudentLessonPrice, useStudentPortal, type OpenDay } from '@/hooks/use-student-portal';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatTime } from '@/utils/dates';
import { showMessage } from '@/utils/dialogs';

/** The student picks a lesson type and a free time in the teacher's open time. */
export default function RequestLessonScreen() {
  const { linked, lessonTypes } = useStudentPortal();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {!linked ? (
          <NoTeacherYet />
        ) : lessonTypes.length === 0 ? (
          <EmptyText>המורה עדיין לא הגדיר סוגי שיעורים.</EmptyText>
        ) : (
          <RequestForm lessonTypes={lessonTypes} />
        )}
      </ScrollView>
    </ThemedView>
  );
}

type OpenDaysState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; days: OpenDay[] };

function RequestForm({ lessonTypes }: { lessonTypes: LessonType[] }) {
  const { teacher, prices, loadOpenDays, requestLesson } = useStudentPortal();
  const [type, setType] = useState<LessonType>(lessonTypes[0]);
  const [openDays, setOpenDays] = useState<OpenDaysState>({ status: 'loading' });
  const [dayIndex, setDayIndex] = useState(0);
  const [start, setStart] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Free times depend on the lesson's length, so they are found again for each type.
  useEffect(() => {
    let cancelled = false;
    loadOpenDays(type).then((result) => {
      if (cancelled) return;
      setDayIndex(0);
      setStart(null);
      setOpenDays(typeof result === 'string' ? { status: 'error', message: result } : { status: 'ready', days: result });
    });
    return () => {
      cancelled = true;
    };
  }, [type, loadOpenDays, attempt]);

  const chooseType = (next: LessonType) => {
    if (next.id === type.id) return;
    setOpenDays({ status: 'loading' });
    setType(next);
  };

  const retry = () => {
    setOpenDays({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  const send = async () => {
    if (!start) return;
    setSending(true);
    const error = await requestLesson(type.id, start);
    setSending(false);
    if (error) {
      showMessage('הבקשה לא נשלחה', error);
      retry();
      return;
    }
    showMessage('הבקשה נשלחה', 'המורה יקבל את הבקשה ויאשר אותה. אפשר לראות את מצב הבקשה בלשונית השיעורים.');
    router.back();
  };

  const price = getStudentLessonPrice(type, teacher, prices);
  const days = openDays.status === 'ready' ? openDays.days : [];
  const day = days[dayIndex];

  return (
    <>
      <Section title="סוג השיעור">
        <View style={styles.chips}>
          {lessonTypes.map((option) => (
            <Chip
              key={option.id}
              label={`${option.name} · ${option.durationMin} דק׳`}
              selected={option.id === type.id}
              onPress={() => chooseType(option)}
            />
          ))}
        </View>
      </Section>

      <Section title="יום">
        {openDays.status === 'loading' ? (
          <ActivityIndicator />
        ) : openDays.status === 'error' ? (
          <Card>
            <ThemedText type="small" themeColor="danger">
              {openDays.message}
            </ThemedText>
            <Button label="ניסיון חוזר" variant="secondary" onPress={retry} />
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              אין זמנים פנויים בשבועיים הקרובים לשיעור באורך הזה. כדאי לנסות סוג שיעור קצר יותר, או לפנות
              למורה.
            </ThemedText>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayChips}>
            {days.map((option, index) => (
              <Chip
                key={option.day.toISOString()}
                label={formatDay(option.day)}
                selected={index === dayIndex}
                onPress={() => {
                  setDayIndex(index);
                  setStart(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Section>

      {day && (
        <Section title="שעה">
          <View style={styles.chips}>
            {day.starts.map((option) => (
              <Chip
                key={option.toISOString()}
                label={formatTime(option)}
                selected={start?.getTime() === option.getTime()}
                onPress={() => setStart(option)}
              />
            ))}
          </View>
        </Section>
      )}

      {start && (
        <Card style={styles.summary}>
          <ThemedText type="smallBold">
            {type.name} · {formatDay(start)} · {formatTime(start)}–
            {formatTime(new Date(start.getTime() + type.durationMin * 60_000))}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            מחיר: {formatShekels(price)} · השיעור ייקבע אחרי שהמורה יאשר
          </ThemedText>
        </Card>
      )}

      <Button label="שליחת בקשה למורה" busy={sending} disabled={!start} onPress={send} />
    </>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
        {label}
      </ThemedText>
    </Pressable>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  dayChips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  summary: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
