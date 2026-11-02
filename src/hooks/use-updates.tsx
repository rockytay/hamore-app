import { createContext, useContext, useState, type PropsWithChildren } from 'react';

type UpdateBase = {
  id: string;
  createdAt: Date;
  studentName: string;
};

export type Update =
  | (UpdateBase & { kind: 'new-student' })
  /** The teacher scheduled a lesson and it is waiting for the student's approval. */
  | (UpdateBase & { kind: 'lesson-requested'; lessonTime: Date })
  | (UpdateBase & {
      kind: 'lesson-confirmed';
      lessonTime: Date;
      /** Who gave the final approval: the student (for a lesson the teacher set) or the teacher. */
      approvedBy: 'student' | 'teacher';
    })
  | (UpdateBase & { kind: 'payment-received'; amount: number })
  | (UpdateBase & { kind: 'payment-overdue'; daysLate: number });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An update to add; its id and time are filled in automatically. */
export type NewUpdate = DistributiveOmit<Update, 'id' | 'createdAt'>;

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
      approvedBy: 'student',
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
      approvedBy: 'student',
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

type UpdatesContextValue = {
  updates: Update[];
  addUpdate: (update: NewUpdate) => void;
};

const UpdatesContext = createContext<UpdatesContextValue | null>(null);

/**
 * Holds the teacher's updates and notifications for the whole app.
 * The app is not connected to a backend yet, so updates are kept in memory only.
 */
export function UpdatesProvider({ children }: PropsWithChildren) {
  const [updates, setUpdates] = useState<Update[]>(() =>
    SHOW_SAMPLE_UPDATES ? getSampleUpdates() : []
  );

  const addUpdate = (update: NewUpdate) => {
    const created = {
      ...update,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
    } as Update;
    setUpdates((current) => [created, ...current]);
  };

  return <UpdatesContext value={{ updates, addUpdate }}>{children}</UpdatesContext>;
}

function useUpdatesContext() {
  const context = useContext(UpdatesContext);
  if (!context) throw new Error('useUpdates must be used inside UpdatesProvider');
  return context;
}

/** Updates and notifications for the teacher, newest first. */
export function useUpdates(): Update[] {
  return useUpdatesContext().updates;
}

/** Add a new update to the top of the home screen feed. */
export function useAddUpdate() {
  return useUpdatesContext().addUpdate;
}
