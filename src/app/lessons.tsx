import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventEditor, type EditorType } from '@/components/event-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatShortDate, SlotLegend, snapMinute, WeekCalendar } from '@/components/week-calendar';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  DAY_END_MIN,
  isLesson,
  useCalendarEvents,
  type CalendarEvent,
} from '@/hooks/use-calendar-events';

const DEFAULT_DURATION_MIN = 60;

function getWeekDays(weekOffset: number) {
  const sunday = new Date();
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - sunday.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);
    return day;
  });
}

function isPast(day: Date, minute: number) {
  const time = new Date(day);
  time.setHours(0, minute, 0, 0);
  return time < new Date();
}

type EditorState = {
  /** Changes every time the editor opens, so it starts from fresh state. */
  openId: number;
  day: Date;
  event?: CalendarEvent;
  type: EditorType;
  startMin: number;
  endMin: number;
  /** Where an availability block was tapped, to schedule a lesson there. */
  tapMin?: number;
};

export default function LessonsScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const { events, saveEvent, removeEvent, approve, studentApprove } = useCalendarEvents();

  const days = getWeekDays(weekOffset);

  const openNew = (day: Date, startMin: number, type: EditorType) => {
    setEditor({
      openId: Date.now(),
      day,
      type,
      startMin,
      endMin: Math.min(startMin + DEFAULT_DURATION_MIN, DAY_END_MIN),
    });
  };

  const handleEmptyPress = (day: Date, minute: number) => {
    const startMin = snapMinute(minute);
    if (!isPast(day, startMin)) openNew(day, startMin, 'available');
  };

  const handleEventPress = (day: Date, event: CalendarEvent, minute: number) => {
    if (isPast(day, event.endMin)) return;
    setEditor({
      openId: Date.now(),
      day,
      event,
      type: isLesson(event) ? 'lesson' : 'available',
      startMin: event.startMin,
      endMin: event.endMin,
      tapMin: snapMinute(minute),
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">קביעת שיעורים</ThemedText>

        <View style={styles.weekNav}>
          <NavButton label="שבוע קודם" onPress={() => setWeekOffset(weekOffset - 1)} />
          <Pressable onPress={() => setWeekOffset(0)} disabled={weekOffset === 0}>
            <ThemedText type="smallBold">
              {formatShortDate(days[0])} – {formatShortDate(days[6])}
            </ThemedText>
            {weekOffset !== 0 && (
              <ThemedText type="small" themeColor="accent" style={styles.centered}>
                חזרה להיום
              </ThemedText>
            )}
          </Pressable>
          <NavButton label="שבוע הבא" onPress={() => setWeekOffset(weekOffset + 1)} />
        </View>

        <SlotLegend />
        <ThemedText type="small" themeColor="textSecondary">
          הקישו על מקום ריק ביומן כדי להוסיף זמן פנוי או שיעור, או על בלוק כדי לערוך אותו.
        </ThemedText>

        <WeekCalendar
          days={days}
          events={events}
          selectedId={editor?.event?.id ?? null}
          onEmptyPress={handleEmptyPress}
          onEventPress={handleEventPress}
        />
      </SafeAreaView>

      {editor && (
        <EventEditor
          key={editor.openId}
          day={editor.day}
          event={editor.event}
          initialType={editor.type}
          initialStartMin={editor.startMin}
          initialEndMin={editor.endMin}
          onClose={() => setEditor(null)}
          onSave={saveEvent}
          onDelete={removeEvent}
          onApprove={approve}
          onStudentApprove={studentApprove}
          onScheduleInside={
            editor.event?.status === 'available' && editor.tapMin !== undefined
              ? () => openNew(editor.day, editor.tapMin!, 'lesson')
              : undefined
          }
        />
      )}
    </ThemedView>
  );
}

function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.navButton}>
        <ThemedText type="small">{label}</ThemedText>
      </ThemedView>
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
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  weekNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
