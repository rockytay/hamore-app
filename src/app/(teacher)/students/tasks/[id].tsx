import { ActivityIndicator, StyleSheet } from 'react-native';

import { ChoiceChips, optionsOf } from '@/components/form-ui';
import { Card, EmptyText, ProgressBar, Section } from '@/components/student-ui';
import { TeacherFileScreen } from '@/components/teacher-file-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  MIN_LESSONS_B,
  SPECIAL_LESSON_LABELS,
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  type DrivingTask,
  type SpecialLessonKind,
  type TaskStatus,
} from '@/hooks/student-file';
import { isLesson, useCalendarEvents } from '@/hooks/use-calendar-events';
import { useDrivingTasks } from '@/hooks/use-driving-tasks';
import { useStudentFileActions, type Student } from '@/hooks/use-students';
import { showMessage } from '@/utils/dialogs';

export default function StudentTasksScreen() {
  return <TeacherFileScreen>{(student) => <Tasks student={student} />}</TeacherFileScreen>;
}

const STATUS_OPTIONS = optionsOf(TASK_STATUS_LABELS);

function Tasks({ student }: { student: Student }) {
  const { tasks, failed } = useDrivingTasks();
  const { setTaskStatus } = useStudentFileActions();
  const { events } = useCalendarEvents();
  const readOnly = !!student.removal;

  const specialCounts = (Object.keys(SPECIAL_LESSON_LABELS) as SpecialLessonKind[]).map((kind) => ({
    kind,
    count: events.filter((e) => isLesson(e) && e.status === 'booked' && e.studentId === student.id && e.specialKind === kind)
      .length,
  }));

  const change = async (taskId: number, status: TaskStatus) => {
    const error = await setTaskStatus(student.id, taskId, status);
    if (error) showMessage('שגיאה', error);
  };

  const stages = new Map<number, DrivingTask[]>();
  for (const task of tasks ?? []) stages.set(task.stage, [...(stages.get(task.stage) ?? []), task]);

  return (
    <>
      <Card style={styles.summary}>
        <ThemedText type="smallBold">
          {student.lessonsCompleted} שיעורים
          {student.licenseCategory === 'B' ? ` מתוך מינימום ${MIN_LESSONS_B}` : ''}
        </ThemedText>
        {student.licenseCategory === 'B' && <ProgressBar value={student.lessonsCompleted / MIN_LESSONS_B} />}
        <ThemedText type="small" themeColor="textSecondary">
          {specialCounts.map(({ kind, count }) => `${SPECIAL_LESSON_LABELS[kind]}: ${count}`).join(' · ')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          שיעור מיוחד מסמנים בעת קביעת השיעור ביומן.
        </ThemedText>
      </Card>

      {tasks === null && !failed && <ActivityIndicator />}
      {failed && <EmptyText>טעינת המשימות נכשלה. יש לנסות שוב מאוחר יותר.</EmptyText>}
      {tasks?.length === 0 && (
        <Card>
          <ThemedText type="smallBold">רשימת המשימות עדיין לא נטענה למערכת</ThemedText>
          <EmptyText>
            52 המשימות של כרטיס התלמיד (4 שלבים) יתווספו ברגע שתתקבל הרשימה הרשמית של משרד התחבורה.
          </EmptyText>
        </Card>
      )}

      {[...stages.entries()].map(([stage, stageTasks]) => {
        const mastered = stageTasks.filter((task) => student.taskProgress[task.id] === 'mastered').length;
        return (
          <Section key={stage} title={`${TASK_STAGE_LABELS[stage] ?? `שלב ${stage}`} · ${mastered}/${stageTasks.length} בשליטה`}>
            {stageTasks.map((task) => (
              <Card key={task.id} style={styles.task}>
                <ThemedText type="small">{task.title}</ThemedText>
                <ChoiceChips
                  options={STATUS_OPTIONS}
                  value={student.taskProgress[task.id] ?? 'not_started'}
                  onChange={(status) => !readOnly && status && change(task.id, status)}
                />
              </Card>
            ))}
          </Section>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: Spacing.two,
  },
  task: {
    gap: Spacing.two,
  },
});
