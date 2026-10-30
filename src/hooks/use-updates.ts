type UpdateBase = {
  id: string;
  createdAt: Date;
  studentName: string;
};

export type Update =
  | (UpdateBase & { kind: 'new-student' })
  | (UpdateBase & { kind: 'lesson-confirmed'; lessonTime: Date })
  | (UpdateBase & { kind: 'payment-received'; amount: number })
  | (UpdateBase & { kind: 'payment-overdue'; daysLate: number });

/** Show example updates on the home screen. Set to false to see the empty state. */
const SHOW_SAMPLE_UPDATES = true;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function daysFromNowAt(days: number, hour: number) {
  const date = new Date(Date.now() + days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function getSampleUpdates(): Update[] {
  const now = Date.now();
  return [
    { id: '1', kind: 'new-student', studentName: 'דנה כהן', createdAt: new Date(now - 5 * MINUTE) },
    {
      id: '2',
      kind: 'payment-received',
      studentName: 'נועה מזרחי',
      amount: 150,
      createdAt: new Date(now - 40 * MINUTE),
    },
    {
      id: '3',
      kind: 'lesson-confirmed',
      studentName: 'יוסי לוי',
      lessonTime: daysFromNowAt(1, 17),
      createdAt: new Date(now - 2 * HOUR),
    },
    {
      id: '4',
      kind: 'payment-overdue',
      studentName: 'אבי פרץ',
      daysLate: 3,
      createdAt: new Date(now - 5 * HOUR),
    },
    {
      id: '5',
      kind: 'lesson-confirmed',
      studentName: 'מיכל אברהם',
      lessonTime: daysFromNowAt(3, 10),
      createdAt: new Date(now - DAY),
    },
    {
      id: '6',
      kind: 'payment-received',
      studentName: 'עומר ביטון',
      amount: 200,
      createdAt: new Date(now - DAY - 4 * HOUR),
    },
    { id: '7', kind: 'new-student', studentName: 'שירה גולן', createdAt: new Date(now - 2 * DAY) },
    {
      id: '8',
      kind: 'payment-overdue',
      studentName: 'רון דהן',
      daysLate: 1,
      createdAt: new Date(now - 4 * DAY),
    },
  ];
}

/**
 * Updates and notifications for the teacher, newest first.
 * The app is not connected to a backend yet, so only sample updates exist.
 */
export function useUpdates(): Update[] {
  return SHOW_SAMPLE_UPDATES ? getSampleUpdates() : [];
}
