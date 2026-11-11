import { useMemo } from 'react';

import {
  getEventEnd,
  getEventStart,
  useCalendarEvents,
  type CalendarEvent,
} from '@/hooks/use-calendar-events';
import { useAllStudents, type RemovalReason, type Student } from '@/hooks/use-students';

type UpdateBase = {
  id: string;
  /** When it happened; the feed is sorted by this, newest first. */
  createdAt: Date;
  studentName: string;
};

export type Update =
  | (UpdateBase & { kind: 'new-student' })
  /** The teacher scheduled a lesson and it is waiting for the student's approval. */
  | (UpdateBase & { kind: 'lesson-requested'; lessonTime: Date })
  /** A student asked for a lesson and it is waiting for the teacher's approval. */
  | (UpdateBase & { kind: 'lesson-request-received'; lessonTime: Date })
  | (UpdateBase & { kind: 'lesson-confirmed'; lessonTime: Date })
  | (UpdateBase & { kind: 'payment-received'; amount: number })
  /** The student owes the teacher money; amount is the debt in shekels. */
  | (UpdateBase & { kind: 'student-debt'; amount: number })
  /** The teacher removed the student from their list, e.g. after passing the test. */
  | (UpdateBase & { kind: 'student-removed'; reason: RemovalReason });

/** Activity older than this is left out of the feed. Open debts are always shown. */
const FEED_DAYS = 30;
const MAX_UPDATES = 50;
const DAY = 24 * 60 * 60_000;

function buildUpdates(students: Student[], events: CalendarEvent[], now: Date): Update[] {
  const since = now.getTime() - FEED_DAYS * DAY;
  const updates: Update[] = [];

  for (const student of students) {
    updates.push({
      id: `student-${student.id}`,
      kind: 'new-student',
      studentName: student.name,
      createdAt: student.createdAt,
    });
    for (const payment of student.payments) {
      updates.push({
        id: `payment-${payment.id}`,
        kind: 'payment-received',
        studentName: student.name,
        amount: payment.amount,
        createdAt: payment.paidAt,
      });
    }
    if (student.removal) {
      updates.push({
        id: `removed-${student.id}`,
        kind: 'student-removed',
        studentName: student.name,
        reason: student.removal.reason,
        createdAt: student.removal.removedAt,
      });
    }
  }

  for (const event of events) {
    if (event.status === 'available' || !event.createdAt || !event.updatedAt) continue;
    const lessonTime = getEventStart(event);
    const base = { studentName: event.studentName, lessonTime };
    if (event.status === 'booked') {
      updates.push({
        ...base,
        id: `confirmed-${event.id}`,
        kind: 'lesson-confirmed',
        createdAt: event.updatedAt,
      });
    } else if (lessonTime > now) {
      // A request for a time that has already passed is no longer worth a notification.
      updates.push({
        ...base,
        id: `pending-${event.id}`,
        kind: event.awaiting === 'student' ? 'lesson-requested' : 'lesson-request-received',
        createdAt: event.createdAt,
      });
    }
  }

  const recent = updates.filter((update) => update.createdAt.getTime() >= since);

  // A debt is still relevant however old it is. Date it from the student's last lesson.
  for (const student of students) {
    if (student.balance >= 0) continue;
    const lastLessonEnd = events
      .filter((e) => e.status === 'booked' && e.studentId === student.id)
      .map((e) => getEventEnd(e))
      .filter((end) => end <= now)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    recent.push({
      id: `debt-${student.id}`,
      kind: 'student-debt',
      studentName: student.name,
      amount: -student.balance,
      createdAt: lastLessonEnd ?? student.createdAt,
    });
  }

  return recent.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, MAX_UPDATES);
}

/**
 * Updates and notifications for the teacher, newest first. Built from the students,
 * lessons and payments loaded from the database, so they follow the data and need
 * no separate storage.
 */
export function useUpdates(): Update[] {
  // Former students too: their history stays, and a debt is still owed after they leave.
  const students = useAllStudents();
  const { events } = useCalendarEvents();
  return useMemo(() => buildUpdates(students, events, new Date()), [students, events]);
}
