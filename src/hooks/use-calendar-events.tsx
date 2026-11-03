import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { useAddUpdate } from '@/hooks/use-updates';

/**
 * What a calendar block represents. Times with no block are unset (shown gray).
 * - available: the teacher opened this time, students can request lessons in it
 * - pending: a lesson that the teacher or the student still needs to approve
 * - booked: a lesson both the teacher and the student confirmed
 */
export type EventStatus =
  | { status: 'available' }
  | { status: 'pending'; studentName: string; awaiting: 'teacher' | 'student' }
  | { status: 'booked'; studentName: string };

export type EventStatusName = EventStatus['status'];

/** A block in the calendar; times are minutes since midnight. */
export type CalendarEvent = EventStatus & {
  id: string;
  dateKey: string;
  startMin: number;
  endMin: number;
};

/** The hours shown in the calendar, and the step that times snap to. */
export const DAY_START_MIN = 7 * 60;
export const DAY_END_MIN = 22 * 60;
export const TIME_STEP_MIN = 15;

/** Show example blocks in the calendar. Set to false to start from an empty week. */
const SHOW_SAMPLE_EVENTS = true;

export function getDateKey(day: Date) {
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

export function createEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isLesson(event: CalendarEvent) {
  return event.status !== 'available';
}

function findConflict(events: CalendarEvent[], event: CalendarEvent) {
  return events.find(
    (other) =>
      other.id !== event.id &&
      other.dateKey === event.dateKey &&
      isLesson(other) === isLesson(event) &&
      other.startMin < event.endMin &&
      event.startMin < other.endMin
  );
}

function getSampleEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const add = (days: number, start: string, end: string, status: EventStatus) => {
    const day = new Date();
    day.setDate(day.getDate() + days);
    const toMin = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    events.push({
      ...status,
      id: createEventId(),
      dateKey: getDateKey(day),
      startMin: toMin(start),
      endMin: toMin(end),
    });
  };

  add(1, '09:00', '12:30', { status: 'available' });
  add(1, '16:00', '19:00', { status: 'available' });
  add(1, '17:00', '17:45', { status: 'booked', studentName: 'יוסי לוי' });
  add(2, '14:00', '18:00', { status: 'available' });
  add(2, '16:30', '17:15', { status: 'pending', studentName: 'דנה כהן', awaiting: 'teacher' });
  add(3, '09:30', '12:00', { status: 'available' });
  add(3, '10:00', '10:45', { status: 'booked', studentName: 'מיכל אברהם' });
  add(4, '15:00', '18:30', { status: 'available' });
  add(4, '15:15', '16:00', { status: 'pending', studentName: 'שירה גולן', awaiting: 'student' });

  return events;
}

export function getEventStart(event: CalendarEvent) {
  const [year, month, day] = event.dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 0, event.startMin);
}

function useCalendarEventsState() {
  const addUpdate = useAddUpdate();
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    SHOW_SAMPLE_EVENTS ? getSampleEvents() : []
  );

  /** A pending lesson becomes confirmed, and the home screen gets a notification. */
  const confirm = (id: string, approvedBy: 'student' | 'teacher') => {
    const event = events.find((e) => e.id === id);
    if (event?.status !== 'pending') return;

    setEvents((current) =>
      current.map((e) =>
        e.id === id
          ? {
              id: e.id,
              dateKey: e.dateKey,
              startMin: e.startMin,
              endMin: e.endMin,
              status: 'booked',
              studentName: event.studentName,
            }
          : e
      )
    );
    addUpdate({
      kind: 'lesson-confirmed',
      studentName: event.studentName,
      lessonTime: getEventStart(event),
      approvedBy,
    });
  };

  return {
    events,
    /** Add or update a block. Returns an error message in Hebrew, or null on success. */
    saveEvent: (event: CalendarEvent): string | null => {
      if (event.endMin <= event.startMin) {
        return 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
      }
      if (findConflict(events, event)) {
        return isLesson(event) ? 'יש כבר שיעור בזמן הזה' : 'הזמן הזה חופף לזמן פנוי אחר';
      }
      const isNewLesson = !events.some((e) => e.id === event.id) && event.status === 'pending';
      setEvents((current) => [...current.filter((e) => e.id !== event.id), event]);
      if (isNewLesson && event.awaiting === 'student') {
        addUpdate({
          kind: 'lesson-requested',
          studentName: event.studentName,
          lessonTime: getEventStart(event),
        });
      }
      return null;
    },
    removeEvent: (id: string) => setEvents((current) => current.filter((e) => e.id !== id)),
    /** The teacher approves a lesson request from a student. */
    approve: (id: string) => confirm(id, 'teacher'),
    /**
     * The student approves a lesson the teacher scheduled. There is no student app yet,
     * so this is only triggered from a development-only button in the editor.
     */
    studentApprove: (id: string) => confirm(id, 'student'),
  };
}

const CalendarEventsContext = createContext<ReturnType<typeof useCalendarEventsState> | null>(
  null
);

/**
 * Holds the teacher's calendar for the whole app. Must be inside UpdatesProvider.
 * The app is not connected to a backend yet, so changes are kept in memory only.
 */
export function CalendarEventsProvider({ children }: PropsWithChildren) {
  const value = useCalendarEventsState();
  return <CalendarEventsContext value={value}>{children}</CalendarEventsContext>;
}

/** The teacher's calendar blocks and the actions on them. */
export function useCalendarEvents() {
  const context = useContext(CalendarEventsContext);
  if (!context) throw new Error('useCalendarEvents must be used inside CalendarEventsProvider');
  return context;
}
