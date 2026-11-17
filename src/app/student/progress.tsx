import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { InfoRow } from '@/components/form-ui';
import { Card, EmptyText, ProgressBar, Section, StudentScreen, studentStyles } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  addYears,
  DEFAULT_VALIDITY,
  formatAge,
  getAppealDeadline,
  getEligibility,
  getStage,
  MIN_LESSONS_B,
  SPECIAL_LESSON_LABELS,
  STAGE_LABELS,
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  type DrivingTask,
  type SpecialLessonKind,
  type StudentTest,
} from '@/hooks/student-file';
import { useDrivingTasks } from '@/hooks/use-driving-tasks';
import { useStudentLessons, useStudentPortal } from '@/hooks/use-student-portal';
import { LICENSE_CATEGORIES, TRANSMISSION_LABELS } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatTime } from '@/utils/dates';

export default function StudentProgressScreen() {
  return (
    <StudentScreen title="התקדמות">
      <Progress />
    </StudentScreen>
  );
}

function Progress() {
  const { record, notes, tests, personal, teacher } = useStudentPortal();
  if (!record) return null;
  const { file } = record;
  const validity = teacher?.validity ?? DEFAULT_VALIDITY;
  const stage = getStage(file, tests);
  const internal = tests.filter((t) => t.kind === 'internal');
  const practical = tests.filter((t) => t.kind === 'practical');
  const upcomingPractical = practical.find((t) => t.result === 'scheduled' && t.scheduledAt > new Date());
  const isB = record.licenseCategory === 'B';
  const eligibility = getEligibility(personal?.birthDate ?? null, record.licenseCategory);

  return (
    <>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          רישיון דרגה {record.licenseCategory} · {TRANSMISSION_LABELS[record.transmission]}
          {personal?.birthDate ? ` · גיל ${formatAge(personal.birthDate)}` : ''}
        </ThemedText>
        <ThemedText type="smallBold">{LICENSE_CATEGORIES[record.licenseCategory]}</ThemedText>
        <ThemedText type="small" themeColor="accent">
          {STAGE_LABELS[stage]}
        </ThemedText>
      </Card>

      <Section title="הדרך לרישיון">
        <Card style={styles.steps}>
          <Step
            done={!!file.greenFormIssuedAt}
            title="טופס ירוק"
            detail={
              file.greenFormIssuedAt
                ? `הונפק ב־${formatDate(file.greenFormIssuedAt)} · בתוקף עד ${formatDate(addYears(file.greenFormIssuedAt, validity.greenFormValidYears))}`
                : [
                    file.eyeTestDone ? 'בדיקת ראייה ✓' : 'צריך בדיקת ראייה',
                    file.healthDeclarationDone ? 'הצהרת בריאות ✓' : 'צריך הצהרת בריאות',
                  ].join(' · ')
            }
          />
          <Step
            done={file.theoryPassed}
            title="מבחן תאוריה"
            detail={
              file.theoryPassed
                ? file.theoryPassedAt
                  ? `עברת ב־${formatDate(file.theoryPassedAt)} · בתוקף עד ${formatDate(addYears(file.theoryPassedAt, validity.theoryValidYears))}`
                  : 'עברת'
                : 'עדיין לא עברת. בלי תאוריה אי אפשר לגשת לטסט.'
            }
          />
          <Step
            done={isB ? record.lessonsCompleted >= MIN_LESSONS_B : record.lessonsCompleted > 0}
            title="שיעורי נהיגה"
            detail={
              isB
                ? `${record.lessonsCompleted} מתוך מינימום ${MIN_LESSONS_B} שיעורים`
                : `בוצעו ${record.lessonsCompleted} שיעורים`
            }>
            {isB && <ProgressBar value={record.lessonsCompleted / MIN_LESSONS_B} />}
          </Step>
          <Step
            done={internal.some((t) => t.result === 'passed')}
            title="טסט פנימי"
            detail={describeLatest(internal) ?? 'המורה יקבע איתך כשתהיה/י מוכן/ה'}
          />
          <Step
            done={practical.some((t) => t.result === 'passed')}
            title="טסט מעשי"
            detail={
              upcomingPractical
                ? `נקבע ל־${formatDate(upcomingPractical.scheduledAt)} בשעה ${formatTime(upcomingPractical.scheduledAt)}`
                : (describeLatest(practical) ?? 'עוד לא נקבע')
            }
            last
          />
        </Card>
        {file.needsGlasses && <EmptyText>שימו לב: יש לנהוג עם משקפיים או עדשות מגע.</EmptyText>}
      </Section>

      {eligibility.length > 0 && eligibility.some((rule) => !rule.reached) && (
        <Section title="זכאות לפי גיל">
          <Card>
            {eligibility.map((rule) => (
              <InfoRow
                key={rule.label}
                label={rule.label}
                value={rule.reached ? '✓ אפשר' : `מ־${formatDate(rule.from)}`}
              />
            ))}
          </Card>
        </Section>
      )}

      {tests.length > 0 && (
        <Section title="מבחנים">
          {tests.map((test) => (
            <TestCard key={test.id} test={test} />
          ))}
        </Section>
      )}

      <TasksSection />
      <SpecialLessons />

      <Section title="הערות מהמורה">
        {notes.length === 0 ? (
          <EmptyText>המורה עדיין לא שיתף הערות. הערות שהמורה ישתף יופיעו כאן.</EmptyText>
        ) : (
          notes.map((note) => (
            <Card key={note.id}>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(note.date)}
              </ThemedText>
              <ThemedText type="small">{note.text}</ThemedText>
            </Card>
          ))
        )}
      </Section>
    </>
  );
}

/** e.g. "נכשל/ה ב־12.11.2026 (ניסיון 1)" for the most recent test of a kind. */
function describeLatest(tests: StudentTest[]) {
  const latest = tests[0];
  if (!latest) return null;
  const attempt = latest.kind === 'practical' ? ` (ניסיון ${latest.attempt})` : '';
  if (latest.result === 'scheduled') {
    return latest.scheduledAt > new Date() ? `נקבע ל־${formatDate(latest.scheduledAt)}` : 'ממתין לתוצאה';
  }
  return `${TEST_RESULT_LABELS[latest.result]} ב־${formatDate(latest.scheduledAt)}${attempt}`;
}

const RESULT_COLORS: Record<StudentTest['result'], ThemeColor> = {
  scheduled: 'slotBooked',
  passed: 'slotAvailable',
  failed: 'danger',
  cancelled: 'backgroundSelected',
};

function TestCard({ test }: { test: StudentTest }) {
  const theme = useTheme();
  const upcoming = test.result === 'scheduled' && test.scheduledAt > new Date();
  const appealUntil = test.kind === 'practical' && test.result === 'failed' ? getAppealDeadline(test.scheduledAt) : null;
  return (
    <Card style={styles.test}>
      <View style={[styles.stripe, { backgroundColor: theme[RESULT_COLORS[test.result]] }]} />
      <View style={styles.testBody}>
        <ThemedText type="smallBold">
          {TEST_KIND_LABELS[test.kind]} · {TEST_RESULT_LABELS[test.result]}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(test.scheduledAt)} · {formatTime(test.scheduledAt)}
          {test.location ? ` · ${test.location}` : ''}
        </ThemedText>
        {upcoming && test.kind === 'practical' && (
          <ThemedText type="small">להביא: תעודת זהות ואישור תשלום אגרה{test.feePaid ? '' : ' (האגרה עוד לא שולמה)'}</ThemedText>
        )}
        {test.failureReasons ? (
          <ThemedText type="small" themeColor="textSecondary">
            {test.failureReasons}
          </ThemedText>
        ) : null}
        {appealUntil && appealUntil >= new Date() && (
          <ThemedText type="small" themeColor="accent">
            אפשר לערער עד {formatDate(appealUntil)}
          </ThemedText>
        )}
      </View>
    </Card>
  );
}

/** Progress on the official driving tasks, by stage. Tap a stage to see its tasks. */
function TasksSection() {
  const { tasks } = useDrivingTasks();
  const { taskProgress } = useStudentPortal();
  const [open, setOpen] = useState<number | null>(null);
  if (!tasks || tasks.length === 0) return null;

  const stages = new Map<number, DrivingTask[]>();
  for (const task of tasks) stages.set(task.stage, [...(stages.get(task.stage) ?? []), task]);

  return (
    <Section title="כרטיס משימות">
      {[...stages.entries()].map(([stage, stageTasks]) => {
        const mastered = stageTasks.filter((task) => taskProgress[task.id] === 'mastered').length;
        return (
          <Pressable key={stage} onPress={() => setOpen(open === stage ? null : stage)}>
            <Card style={styles.stage}>
              <View style={studentStyles.row}>
                <ThemedText type="smallBold" style={studentStyles.flex}>
                  {TASK_STAGE_LABELS[stage] ?? `שלב ${stage}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {mastered}/{stageTasks.length}
                </ThemedText>
              </View>
              <ProgressBar value={mastered / stageTasks.length} />
              {open === stage &&
                stageTasks.map((task) => (
                  <View key={task.id} style={studentStyles.row}>
                    <ThemedText type="small" style={studentStyles.flex}>
                      {task.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {TASK_STATUS_LABELS[taskProgress[task.id] ?? 'not_started']}
                    </ThemedText>
                  </View>
                ))}
            </Card>
          </Pressable>
        );
      })}
    </Section>
  );
}

function SpecialLessons() {
  const { past } = useStudentLessons();
  const kinds = Object.keys(SPECIAL_LESSON_LABELS) as SpecialLessonKind[];
  return (
    <Section title="שיעורים מיוחדים">
      <View style={studentStyles.row}>
        {kinds.map((kind) => {
          const count = past.filter((lesson) => lesson.specialKind === kind).length;
          return (
            <Card key={kind} style={styles.special}>
              <ThemedText type="smallBold">{count > 0 ? '✓' : '—'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={studentStyles.centered}>
                {SPECIAL_LESSON_LABELS[kind]}
              </ThemedText>
            </Card>
          );
        })}
      </View>
    </Section>
  );
}

function Step({
  done,
  title,
  detail,
  last,
  children,
}: {
  done: boolean;
  title: string;
  detail: string;
  last?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={styles.marker}>
        <SymbolView
          name={
            done
              ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
              : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
          }
          size={22}
          tintColor={done ? theme.slotAvailable : theme.textSecondary}
        />
        {!last && <View style={[styles.line, { backgroundColor: theme.backgroundSelected }]} />}
      </View>
      <View style={[studentStyles.flex, styles.stepContent, !last && styles.stepBody]}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: 0,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  marker: {
    alignItems: 'center',
    width: 22,
  },
  line: {
    flex: 1,
    width: 2,
    marginVertical: Spacing.one,
  },
  stepContent: {
    gap: Spacing.one,
  },
  stepBody: {
    paddingBottom: Spacing.three,
  },
  test: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: 0,
    overflow: 'hidden',
  },
  stripe: {
    width: 5,
  },
  testBody: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingEnd: Spacing.three,
  },
  stage: {
    gap: Spacing.two,
  },
  special: {
    flex: 1,
    alignItems: 'center',
  },
});
