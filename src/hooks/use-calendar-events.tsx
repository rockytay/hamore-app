import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/hooks/use-auth';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useStudents } from '@/hooks/use-students';
import { useAddUpdate } from '@/hooks/use-updates';
import { supabase } from '@/lib/supabase';

/** A kind of lesson the teacher offers, e.g. regular, double or test. */
export type LessonType = {
  id: string;
  name: string;
  durationMin: number;
  /** In shekels. Null means it is worked out from the teacher's lesson price. */
  price: number | null;
};

/** What a lesson block is about. */
export type LessonDetails = {
  studentId: string;
  studentName: string;
  lessonTypeId: string;
  lessonTypeName: string;
  /** In shekels, fixed when the lesson was created. Unknown until saved. */
  price?: number;
};

/**
 * What a calendar block represents. Times with no block are unset (shown gray).
 * - available: the teacher opened this time, students can request lessons in it
 * - pending: a lesson that the teacher or the student still needs to approve
 * - booked: a lesson both the teacher and the student confirmed
 */
export type EventStatus =
  | { status: 'available' }
  | ({ status: 'pending'; awaiting: 'teacher' | 'student' } & LessonDetails)
  | ({ status: 'booked' } & LessonDetails);

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

/** Ids starting with this were made in the app and are not saved yet. */
const NEW_ID_PREFIX = 'new-';

export function getDateKey(day: Date) {
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

export function createEventId() {
  return `${NEW_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isLesson(event: CalendarEvent) {
  return event.status !== 'available';
}

/**
 * The price a lesson of this type will get, the same way the database works it out:
 * the type's own price, or the teacher's lesson price times how many standard lessons fit in it.
 */
export function getLessonTypePrice(type: LessonType, teacher: CurrentUser | null) {
  if (type.price !== null) return type.price;
  if (!teacher || teacher.lessonDurationMin <= 0) return 0;
  return teacher.lessonPrice * Math.max(1, Math.round(type.durationMin / teacher.lessonDurationMin));
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

export function getEventStart(event: CalendarEvent) {
  const [year, month, day] = event.dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 0, event.startMin);
}

function getEventEnd(event: CalendarEvent) {
  const [year, month, day] = event.dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 0, event.endMin);
}

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

type SlotRow = { id: string; starts_at: string; ends_at: string };

type LessonRow = {
  id: string;
  student_id: string;
  lesson_type_id: string;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'booked' | 'cancelled';
  awaiting: 'teacher' | 'student' | null;
  price: number;
};

type LessonTypeRow = { id: string; name: string; duration_min: number; price: number | null };

const SLOT_COLUMNS = 'id, starts_at, ends_at';
const LESSON_COLUMNS = 'id, student_id, lesson_type_id, starts_at, ends_at, status, awaiting, price';

function toTimes(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return { dateKey: getDateKey(start), startMin, endMin: startMin + minutes };
}

function toTimestamps(event: CalendarEvent) {
  return { starts_at: getEventStart(event).toISOString(), ends_at: getEventEnd(event).toISOString() };
}

/** Database errors, in Hebrew. */
function describeError(code: string | undefined, lesson: boolean) {
  if (code === '23P01') return lesson ? 'יש כבר שיעור בזמן הזה' : 'הזמן הזה חופף לזמן פנוי אחר';
  return 'השמירה נכשלה. יש לבדוק את החיבור ולנסות שוב.';
}

async function fetchCalendar() {
  const [slots, lessons, types] = await Promise.all([
    supabase.from('availability_slots').select(SLOT_COLUMNS).returns<SlotRow[]>(),
    supabase.from('lessons').select(LESSON_COLUMNS).neq('status', 'cancelled').returns<LessonRow[]>(),
    supabase
      .from('lesson_types')
      .select('id, name, duration_min, price')
      .eq('is_active', true)
      .order('sort_order')
      .returns<LessonTypeRow[]>(),
  ]);
  if (slots.error || lessons.error || types.error) return null;
  return { slots: slots.data, lessons: lessons.data, types: types.data };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function useCalendarState() {
  const session = useSession();
  const teacherId = session?.role === 'teacher' ? session.userId : null;
  const addUpdate = useAddUpdate();
  const students = useStudents();

  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [typeRows, setTypeRows] = useState<LessonTypeRow[]>([]);
  const [loading, setLoading] = useState(teacherId !== null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchCalendar>>) => {
    setLoading(false);
    if (!result) {
      setError('טעינת היומן נכשלה. יש לבדוק את החיבור ולנסות שוב.');
      return;
    }
    setError(null);
    setSlots(result.slots);
    setLessons(result.lessons);
    setTypeRows(result.types);
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    fetchCalendar().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [teacherId, apply]);

  const reload = useCallback(async () => {
    setLoading(true);
    apply(await fetchCalendar());
  }, [apply]);

  const lessonTypes = useMemo<LessonType[]>(
    () =>
      typeRows.map((row) => ({ id: row.id, name: row.name, durationMin: row.duration_min, price: row.price })),
    [typeRows]
  );

  const events = useMemo<CalendarEvent[]>(() => {
    const studentNames = new Map(students.map((student) => [student.id, student.name]));
    const typeNames = new Map(typeRows.map((type) => [type.id, type.name]));
    return [
      ...slots.map((row): CalendarEvent => ({ id: row.id, status: 'available', ...toTimes(row.starts_at, row.ends_at) })),
      ...lessons.map((row): CalendarEvent => {
        const details: LessonDetails = {
          studentId: row.student_id,
          studentName: studentNames.get(row.student_id) ?? 'תלמיד',
          lessonTypeId: row.lesson_type_id,
          lessonTypeName: typeNames.get(row.lesson_type_id) ?? '',
          price: row.price,
        };
        const times = { id: row.id, ...toTimes(row.starts_at, row.ends_at) };
        return row.status === 'pending' && row.awaiting
          ? { ...times, ...details, status: 'pending', awaiting: row.awaiting }
          : { ...times, ...details, status: 'booked' };
      }),
    ];
  }, [slots, lessons, students, typeRows]);

  const saveAvailability = async (event: CalendarEvent, isNew: boolean) => {
    const times = toTimestamps(event);
    const result = isNew
      ? await supabase.from('availability_slots').insert(times).select(SLOT_COLUMNS).single<SlotRow>()
      : await supabase
          .from('availability_slots')
          .update(times)
          .eq('id', event.id)
          .select(SLOT_COLUMNS)
          .single<SlotRow>();
    if (result.error || !result.data) return describeError(result.error?.code, false);
    const saved = result.data;
    setSlots((current) => [...current.filter((row) => row.id !== event.id), saved]);
    return null;
  };

  const saveLesson = async (event: CalendarEvent, isNew: boolean) => {
    if (event.status === 'available') return null;
    const fields = {
      ...toTimestamps(event),
      status: event.status,
      awaiting: event.status === 'pending' ? event.awaiting : null,
    };
    const result = isNew
      ? await supabase
          .from('lessons')
          .insert({ ...fields, student_id: event.studentId, lesson_type_id: event.lessonTypeId })
          .select(LESSON_COLUMNS)
          .single<LessonRow>()
      : await supabase.from('lessons').update(fields).eq('id', event.id).select(LESSON_COLUMNS).single<LessonRow>();
    if (result.error || !result.data) return describeError(result.error?.code, true);
    const saved = result.data;
    setLessons((current) => [...current.filter((row) => row.id !== event.id), saved]);
    return null;
  };

  /** Add or update a block. Returns an error message in Hebrew, or null on success. */
  const saveEvent = async (event: CalendarEvent): Promise<string | null> => {
    if (event.endMin <= event.startMin) return 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
    if (findConflict(events, event)) {
      return isLesson(event) ? 'יש כבר שיעור בזמן הזה' : 'הזמן הזה חופף לזמן פנוי אחר';
    }
    const isNew = event.id.startsWith(NEW_ID_PREFIX);
    const error = isLesson(event) ? await saveLesson(event, isNew) : await saveAvailability(event, isNew);
    if (error) return error;

    if (isNew && event.status === 'pending' && event.awaiting === 'student') {
      addUpdate({ kind: 'lesson-requested', studentName: event.studentName, lessonTime: getEventStart(event) });
    }
    return null;
  };

  /** Deletes open time, or cancels a lesson (kept in the database for history). */
  const removeEvent = async (id: string): Promise<string | null> => {
    const event = events.find((e) => e.id === id);
    if (!event) return null;
    if (event.status === 'available') {
      const { error } = await supabase.from('availability_slots').delete().eq('id', id);
      if (error) return describeError(error.code, false);
      setSlots((current) => current.filter((row) => row.id !== id));
    } else {
      const { error } = await supabase.from('lessons').update({ status: 'cancelled', awaiting: null }).eq('id', id);
      if (error) return describeError(error.code, true);
      setLessons((current) => current.filter((row) => row.id !== id));
    }
    return null;
  };

  /** A pending lesson becomes confirmed, and the home screen gets a notification. */
  const confirm = async (id: string, approvedBy: 'student' | 'teacher'): Promise<string | null> => {
    const event = events.find((e) => e.id === id);
    if (event?.status !== 'pending') return null;
    const { data, error } = await supabase
      .from('lessons')
      .update({ status: 'booked', awaiting: null })
      .eq('id', id)
      .select(LESSON_COLUMNS)
      .single<LessonRow>();
    if (error || !data) return describeError(error?.code, true);
    setLessons((current) => current.map((row) => (row.id === id ? data : row)));
    addUpdate({
      kind: 'lesson-confirmed',
      studentName: event.studentName,
      lessonTime: getEventStart(event),
      approvedBy,
    });
    return null;
  };

  return {
    events,
    lessonTypes,
    loading,
    error,
    reload,
    saveEvent,
    removeEvent,
    /** The teacher approves a lesson request from a student. */
    approve: (id: string) => confirm(id, 'teacher'),
    /**
     * The student approves a lesson the teacher scheduled. There is no student app yet,
     * so this is only triggered from a development-only button in the editor.
     */
    studentApprove: (id: string) => confirm(id, 'student'),
  };
}

const CalendarEventsContext = createContext<ReturnType<typeof useCalendarState> | null>(null);

/**
 * Holds the signed-in teacher's calendar (open time and lessons) and lesson types.
 * Must be inside StudentsProvider and UpdatesProvider, and keyed by account.
 */
export function CalendarEventsProvider({ children }: PropsWithChildren) {
  const value = useCalendarState();
  return <CalendarEventsContext value={value}>{children}</CalendarEventsContext>;
}

/** The teacher's calendar blocks and the actions on them. */
export function useCalendarEvents() {
  const context = useContext(CalendarEventsContext);
  if (!context) throw new Error('useCalendarEvents must be used inside CalendarEventsProvider');
  return context;
}

/** The lesson types the teacher offers, in their display order. */
export function useLessonTypes(): LessonType[] {
  return useCalendarEvents().lessonTypes;
}
