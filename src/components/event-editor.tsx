import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatShekels } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EVENT_COLORS, formatShortDate, formatTime } from '@/components/week-calendar';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import {
  createEventId,
  DAY_END_MIN,
  DAY_START_MIN,
  getDateKey,
  TIME_STEP_MIN,
  type CalendarEvent,
} from '@/hooks/use-calendar-events';
import { useStudents } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export type EditorType = 'available' | 'lesson';

type EventEditorProps = {
  day: Date;
  /** The block being edited, or undefined when adding a new one. */
  event?: CalendarEvent;
  initialType: EditorType;
  initialStartMin: number;
  initialEndMin: number;
  onClose: () => void;
  /** Returns an error message in Hebrew, or null when the block was saved. */
  onSave: (event: CalendarEvent) => string | null;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  /** Development only: act as if the student approved a lesson the teacher scheduled. */
  onStudentApprove: (id: string) => void;
  /** Only for availability blocks: start a new lesson inside this block. */
  onScheduleInside?: () => void;
};

export function EventEditor({
  day,
  event,
  initialType,
  initialStartMin,
  initialEndMin,
  onClose,
  onSave,
  onDelete,
  onApprove,
  onStudentApprove,
  onScheduleInside,
}: EventEditorProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const students = useStudents();
  const [type, setType] = useState<EditorType>(initialType);
  const [startMin, setStartMin] = useState(initialStartMin);
  const [endMin, setEndMin] = useState(initialEndMin);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebtWarning, setShowDebtWarning] = useState(false);

  const student = students.find((s) => s.id === studentId);
  const isNew = !event;
  const awaitingTeacher = event?.status === 'pending' && event.awaiting === 'teacher';
  const timesChanged = !!event && (startMin !== event.startMin || endMin !== event.endMin);

  const save = (next: CalendarEvent) => {
    const result = onSave(next);
    if (result) {
      setError(result);
    } else {
      onClose();
    }
  };

  const handleSave = ({ ignoreDebt = false } = {}) => {
    const times = { dateKey: getDateKey(day), startMin, endMin };
    if (!event) {
      if (type === 'available') {
        save({ ...times, id: createEventId(), status: 'available' });
      } else if (student && student.balance < 0 && !ignoreDebt) {
        setShowDebtWarning(true);
      } else if (student) {
        save({
          ...times,
          id: createEventId(),
          status: 'pending',
          studentName: student.name,
          awaiting: 'student',
        });
      }
    } else if (event.status === 'booked' && timesChanged) {
      // Moving a confirmed lesson needs the student's approval again.
      save({
        ...times,
        id: event.id,
        status: 'pending',
        studentName: event.studentName,
        awaiting: 'student',
      });
    } else {
      save({ ...event, startMin, endMin });
    }
  };

  let title: string;
  let description: string | null = null;
  if (!event) {
    title = 'הוספה ליומן';
  } else if (event.status === 'available') {
    title = 'זמן פנוי לשיעורים';
  } else if (event.status === 'booked') {
    title = 'שיעור מאושר';
    description = `שיעור עם ${event.studentName}`;
  } else if (event.awaiting === 'teacher') {
    title = 'בקשה לשיעור';
    description = `${event.studentName} ביקש/ה לקבוע שיעור בזמן הזה`;
  } else {
    title = 'ממתין לאישור התלמיד';
    description = `השיעור עם ${event.studentName} ממתין לאישור`;
  }

  let actions: ReactNode;
  if (showDebtWarning && student) {
    actions = (
      <View style={styles.debtWarning}>
        <ThemedView type="backgroundElement" style={[styles.debtBox, { borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">
            תזכורת: ל{student.name} יש חוב
          </ThemedText>
          <ThemedText type="small">
            {student.name} עדיין צריך/ה לשלם {formatShekels(student.balance)} על שיעורים קודמים.
            לקבוע את השיעור בכל זאת?
          </ThemedText>
        </ThemedView>
        <View style={styles.actions}>
          <ActionButton
            label="קביעה בכל זאת"
            color="slotPending"
            onPress={() => handleSave({ ignoreDebt: true })}
          />
          <ActionButton
            label="לא לקבוע"
            color="danger"
            onPress={() => setShowDebtWarning(false)}
          />
        </View>
      </View>
    );
  } else if (awaitingTeacher) {
    actions = (
      <>
        <ActionButton
          label="אישור"
          color="slotAvailable"
          onPress={() => {
            onApprove(event.id);
            onClose();
          }}
        />
        <ActionButton
          label="דחייה"
          color="danger"
          onPress={() => {
            onDelete(event.id);
            onClose();
          }}
        />
      </>
    );
  } else if (isNew) {
    const canSave = type === 'available' || !!student;
    actions = (
      <ActionButton
        label={
          type === 'available'
            ? 'שמירת זמן פנוי'
            : student
              ? `שליחה לאישור של ${student.name}`
              : 'בחרו תלמיד'
        }
        color={!canSave ? 'backgroundSelected' : type === 'available' ? 'slotAvailable' : 'slotPending'}
        disabled={!canSave}
        onPress={() => handleSave()}
      />
    );
  } else {
    const deleteLabel =
      event.status === 'available'
        ? 'מחיקה'
        : event.status === 'booked'
          ? 'ביטול השיעור'
          : 'ביטול הבקשה';
    actions = (
      <>
        <ActionButton
          label={event.status === 'booked' && timesChanged ? 'שליחה לאישור מחדש' : 'שמירה'}
          color="accent"
          onPress={() => handleSave()}
        />
        <ActionButton
          label={deleteLabel}
          color="danger"
          onPress={() => {
            onDelete(event.id);
            onClose();
          }}
        />
      </>
    );
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {event && (
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: theme[EVENT_COLORS[event.status]] },
                ]}
              />
            )}
            <ThemedText type="smallBold">{title}</ThemedText>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText type="small" themeColor="textSecondary">
              סגירה
            </ThemedText>
          </Pressable>
        </View>

        {description && <ThemedText type="small">{description}</ThemedText>}
        <ThemedText type="small" themeColor="textSecondary">
          יום {DAY_NAMES[day.getDay()]}, {formatShortDate(day)}
        </ThemedText>

        {isNew && (
          <ThemedView type="backgroundElement" style={styles.typeSwitch}>
            <TypeButton
              label="זמן פנוי"
              active={type === 'available'}
              onPress={() => setType('available')}
            />
            <TypeButton
              label="שיעור לתלמיד"
              active={type === 'lesson'}
              onPress={() => setType('lesson')}
            />
          </ThemedView>
        )}

        {awaitingTeacher ? (
          <ThemedText type="smallBold">
            {formatTime(startMin)}–{formatTime(endMin)}
          </ThemedText>
        ) : (
          <View style={styles.times}>
            <TimeStepper
              label="התחלה"
              value={startMin}
              min={DAY_START_MIN}
              max={endMin - TIME_STEP_MIN}
              onChange={(value) => {
                setStartMin(value);
                setError(null);
              }}
            />
            <TimeStepper
              label="סיום"
              value={endMin}
              min={startMin + TIME_STEP_MIN}
              max={DAY_END_MIN}
              onChange={(value) => {
                setEndMin(value);
                setError(null);
              }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              משך: {endMin - startMin} דקות
            </ThemedText>
          </View>
        )}

        {isNew && type === 'lesson' && (
          <>
            {students.length === 0 ? (
              <ThemedText type="small">אין עדיין תלמידים. הוסיפו תלמיד דרך כפתור ה־+.</ThemedText>
            ) : (
              <>
                <ThemedText type="small">בחרו תלמיד:</ThemedText>
                <ScrollView style={styles.studentList} contentContainerStyle={styles.studentChips}>
                  {students.map((s) => (
                    <StudentChip
                      key={s.id}
                      name={s.name}
                      selected={s.id === studentId}
                      onPress={() => {
                        setStudentId(s.id);
                        setShowDebtWarning(false);
                      }}
                    />
                  ))}
                </ScrollView>
                <ThemedText type="small" themeColor="textSecondary">
                  השיעור ימתין לאישור התלמיד.
                </ThemedText>
              </>
            )}
          </>
        )}

        {event?.status === 'booked' && timesChanged && (
          <ThemedText type="small" themeColor="textSecondary">
            שינוי השעה יישלח לתלמיד לאישור מחדש.
          </ThemedText>
        )}

        {error && (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        )}

        <View style={styles.actions}>{actions}</View>

        {__DEV__ && event?.status === 'pending' && event.awaiting === 'student' && (
          <Pressable
            onPress={() => {
              onStudentApprove(event.id);
              onClose();
            }}
            style={styles.scheduleInside}>
            <ThemedText type="small" themeColor="textSecondary">
              בדיקה: הדמיית אישור של {event.studentName}
            </ThemedText>
          </Pressable>
        )}

        {onScheduleInside && (
          <Pressable onPress={onScheduleInside} style={styles.scheduleInside}>
            <ThemedText type="smallBold" themeColor="accent">
              קביעת שיעור לתלמיד בזמן הזה
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </Modal>
  );
}

function TimeStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <ThemedText type="small" style={styles.stepperLabel}>
        {label}
      </ThemedText>
      <StepButton
        label="−"
        disabled={value - TIME_STEP_MIN < min}
        onPress={() => onChange(value - TIME_STEP_MIN)}
      />
      <ThemedText type="smallBold" style={styles.stepperValue}>
        {formatTime(value)}
      </ThemedText>
      <StepButton
        label="+"
        disabled={value + TIME_STEP_MIN > max}
        onPress={() => onChange(value + TIME_STEP_MIN)}
      />
    </View>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [disabled && styles.disabled, pressed && styles.pressed]}>
      <ThemedView type="backgroundSelected" style={styles.stepButton}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function TypeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.typeButtonWrapper}>
      <ThemedView
        type={active ? 'background' : 'backgroundElement'}
        style={[styles.typeButton, active && styles.typeButtonActive]}>
        <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function StudentChip({
  name,
  selected,
  onPress,
}: {
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress}>
      <ThemedView
        type="backgroundElement"
        style={[styles.chip, selected && { borderColor: theme.slotPending }]}>
        <ThemedText type={selected ? 'smallBold' : 'small'}>{name}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function ActionButton({
  label,
  color,
  disabled,
  onPress,
}: {
  label: string;
  color: ThemeColor;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: theme[color] },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.actionText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  typeSwitch: {
    flexDirection: 'row',
    padding: Spacing.half,
    borderRadius: Spacing.three,
  },
  typeButtonWrapper: {
    flex: 1,
  },
  typeButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three - Spacing.half,
  },
  typeButtonActive: {
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
  },
  times: {
    gap: Spacing.two,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperLabel: {
    width: 48,
  },
  stepperValue: {
    minWidth: 48,
    textAlign: 'center',
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentList: {
    maxHeight: 96,
  },
  studentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  actionText: {
    color: '#ffffff',
  },
  scheduleInside: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  debtWarning: {
    flex: 1,
    gap: Spacing.two,
  },
  debtBox: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
  },
});
