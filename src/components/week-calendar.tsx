import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  getDateKey,
  isLesson,
  TIME_STEP_MIN,
  type CalendarEvent,
  type EventStatusName,
} from '@/hooks/use-calendar-events';
import { useTheme } from '@/hooks/use-theme';

const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HOUR_HEIGHT = 48;
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;
const TOTAL_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * MINUTE_HEIGHT;
const HOURS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN / 60 + i
);

export const EVENT_COLORS: Record<EventStatusName | 'unset', ThemeColor> = {
  unset: 'backgroundSelected',
  available: 'slotAvailable',
  pending: 'slotPending',
  booked: 'slotBooked',
};

export const EVENT_LABELS: Record<EventStatusName | 'unset', string> = {
  unset: 'לא הוגדר',
  available: 'זמין לשיעורים',
  pending: 'ממתין לאישור',
  booked: 'שיעור מאושר',
};

export function formatTime(minutes: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function formatShortDate(date: Date) {
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

/** Round down to the time step and keep the time inside the calendar's hours. */
export function snapMinute(minutes: number) {
  const snapped = Math.floor(minutes / TIME_STEP_MIN) * TIME_STEP_MIN;
  return Math.min(Math.max(snapped, DAY_START_MIN), DAY_END_MIN - TIME_STEP_MIN);
}

function getLocationY(event: GestureResponderEvent) {
  // Native press events have locationY; on web the DOM event has offsetY instead.
  const nativeEvent = event.nativeEvent as unknown as { locationY?: number; offsetY?: number };
  return nativeEvent.locationY ?? nativeEvent.offsetY ?? 0;
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function SlotLegend() {
  const theme = useTheme();

  return (
    <View style={styles.legend}>
      {(Object.keys(EVENT_COLORS) as (keyof typeof EVENT_COLORS)[]).map((status) => (
        <View key={status} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: theme[EVENT_COLORS[status]] }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {EVENT_LABELS[status]}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

type WeekCalendarProps = {
  /** The seven days of the week, starting on Sunday. */
  days: Date[];
  events: CalendarEvent[];
  selectedId: string | null;
  /** An empty spot was tapped; minute is the tapped time (not snapped). */
  onEmptyPress: (day: Date, minute: number) => void;
  /** A block was tapped; minute is the tapped time inside the block (not snapped). */
  onEventPress: (day: Date, event: CalendarEvent, minute: number) => void;
};

export function WeekCalendar({
  days,
  events,
  selectedId,
  onEmptyPress,
  onEventPress,
}: WeekCalendarProps) {
  const theme = useTheme();
  const todayKey = getDateKey(new Date());
  const nowMin = minutesNow();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.hourColumn} />
        {days.map((day) => {
          const isToday = getDateKey(day) === todayKey;
          return (
            <View key={day.toDateString()} style={styles.dayHeader}>
              <ThemedText type="smallBold" themeColor={isToday ? 'accent' : 'text'}>
                {DAY_LETTERS[day.getDay()]}
              </ThemedText>
              <ThemedText type="small" themeColor={isToday ? 'accent' : 'textSecondary'}>
                {formatShortDate(day)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.gridRow}>
          <View style={[styles.hourColumn, { height: TOTAL_HEIGHT }]}>
            {HOURS.map((hour) => (
              <ThemedText
                key={hour}
                type="small"
                themeColor="textSecondary"
                style={[styles.hourLabel, { top: (hour * 60 - DAY_START_MIN) * MINUTE_HEIGHT - 10 }]}>
                {formatTime(hour * 60)}
              </ThemedText>
            ))}
          </View>

          {days.map((day) => {
            const dateKey = getDateKey(day);
            const isToday = dateKey === todayKey;
            const isPastDay = !isToday && day < new Date();
            const dayEvents = events
              .filter((event) => event.dateKey === dateKey)
              // Availability is drawn first so lessons appear on top of it.
              .sort((a, b) => Number(isLesson(a)) - Number(isLesson(b)));
            const pastHeight = isPastDay
              ? TOTAL_HEIGHT
              : isToday
                ? Math.min(Math.max(nowMin - DAY_START_MIN, 0) * MINUTE_HEIGHT, TOTAL_HEIGHT)
                : 0;

            return (
              <Pressable
                key={dateKey}
                onPress={(e) => onEmptyPress(day, DAY_START_MIN + getLocationY(e) / MINUTE_HEIGHT)}
                style={[styles.dayColumn, { backgroundColor: theme.backgroundSelected }]}>
                {HOURS.slice(1, -1).map((hour) => (
                  <View
                    key={hour}
                    style={[
                      styles.hourLine,
                      {
                        top: (hour * 60 - DAY_START_MIN) * MINUTE_HEIGHT,
                        backgroundColor: theme.background,
                      },
                    ]}
                  />
                ))}

                {dayEvents.map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    selected={event.id === selectedId}
                    onPress={(e) =>
                      onEventPress(day, event, event.startMin + getLocationY(e) / MINUTE_HEIGHT)
                    }
                  />
                ))}

                {pastHeight > 0 && (
                  <View
                    style={[
                      styles.pastOverlay,
                      { height: pastHeight, backgroundColor: theme.background },
                    ]}
                  />
                )}
                {isToday && nowMin > DAY_START_MIN && nowMin < DAY_END_MIN && (
                  <View
                    style={[
                      styles.nowLine,
                      {
                        top: (nowMin - DAY_START_MIN) * MINUTE_HEIGHT,
                        backgroundColor: theme.danger,
                      },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

type EventBlockProps = {
  event: CalendarEvent;
  selected: boolean;
  onPress: (e: GestureResponderEvent) => void;
};

function EventBlock({ event, selected, onPress }: EventBlockProps) {
  const theme = useTheme();
  const height = (event.endMin - event.startMin) * MINUTE_HEIGHT;
  const lesson = isLesson(event);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.block,
        lesson ? styles.lessonBlock : styles.availableBlock,
        {
          top: (event.startMin - DAY_START_MIN) * MINUTE_HEIGHT,
          height,
          backgroundColor: theme[EVENT_COLORS[event.status]],
          borderColor: selected ? theme.text : lesson ? theme.background : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      <View style={styles.blockContent}>
        {height >= 16 && (
          <ThemedText style={styles.blockText}>{formatTime(event.startMin)}</ThemedText>
        )}
        {event.status !== 'available' && height >= 30 && (
          <ThemedText numberOfLines={1} style={styles.blockText}>
            {event.studentName.split(' ')[0]}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  scrollContent: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  hourColumn: {
    width: 40,
  },
  hourLabel: {
    position: 'absolute',
    fontSize: 11,
    lineHeight: 20,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
  },
  dayColumn: {
    flex: 1,
    height: TOTAL_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    pointerEvents: 'none',
  },
  block: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  availableBlock: {
    left: 0,
    right: 0,
  },
  lessonBlock: {
    left: 3,
    right: 3,
  },
  blockContent: {
    paddingHorizontal: 2,
    pointerEvents: 'none',
  },
  blockText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 600,
  },
  pastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0.55,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    pointerEvents: 'none',
  },
  pressed: {
    opacity: 0.7,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
});
