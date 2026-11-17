import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconTile, Section } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  DEFAULT_VALIDITY,
  formatAge,
  getFileAlerts,
  getStage,
  STAGE_LABELS,
  STAGES,
  STUDENT_STATUS_LABELS,
  type FileAlert,
} from '@/hooks/student-file';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { Student } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';

const ALERT_STYLE: Record<FileAlert['tone'], { color: ThemeColor; icon: SymbolViewProps['name'] }> = {
  action: { color: 'accent', icon: { ios: 'checklist', android: 'checklist', web: 'checklist' } },
  warning: { color: 'slotPending', icon: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' } },
  info: { color: 'slotBooked', icon: { ios: 'info.circle.fill', android: 'info', web: 'info' } },
};

type FileLink = {
  pathname: '/students/file/[id]' | '/students/tests/[id]' | '/students/tasks/[id]' | '/students/personal/[id]';
  title: string;
  detail: string;
  icon: SymbolViewProps['name'];
  color: ThemeColor;
};

/** The top of a student's page: stage, status, alerts and the parts of the file. */
export function StudentFileSummary({ student }: { student: Student }) {
  const theme = useTheme();
  const teacher = useCurrentUser();
  const { file, tests, personal } = student;
  const stage = getStage(file, tests);
  const stageIndex = STAGES.indexOf(stage);

  const alerts = student.removal
    ? []
    : getFileAlerts({
        file,
        tests,
        birthDate: personal?.birthDate ?? null,
        contacts: personal?.contacts ?? [],
        licenseCategory: student.licenseCategory,
        lessonsCompleted: student.lessonsCompleted,
        validity: teacher?.validity ?? DEFAULT_VALIDITY,
        audience: 'teacher',
      });

  const mastered = Object.values(student.taskProgress).filter((status) => status === 'mastered').length;
  const upcomingTest = tests.find((test) => test.result === 'scheduled' && test.scheduledAt > new Date());
  const defaultAddress = personal?.addresses.find((a) => a.isDefault) ?? personal?.addresses[0];

  const links: FileLink[] = [
    {
      pathname: '/students/file/[id]',
      title: 'תיק רישוי ותשלום',
      detail: [
        file.greenFormIssuedAt ? 'טופס ירוק ✓' : 'אין טופס ירוק',
        file.theoryPassed ? 'תאוריה ✓' : 'תאוריה ✗',
      ].join(' · '),
      icon: { ios: 'doc.text.fill', android: 'description', web: 'description' },
      color: 'accent',
    },
    {
      pathname: '/students/tests/[id]',
      title: 'מבחנים',
      detail: upcomingTest
        ? `טסט ב־${upcomingTest.scheduledAt.toLocaleDateString('he-IL')}`
        : tests.length === 0
          ? 'לא נקבעו מבחנים'
          : `${tests.length} מבחנים`,
      icon: { ios: 'flag.checkered', android: 'sports_score', web: 'sports_score' },
      color: 'slotPending',
    },
    {
      pathname: '/students/tasks/[id]',
      title: 'כרטיס משימות',
      detail: `${mastered} משימות בשליטה`,
      icon: { ios: 'list.bullet.clipboard.fill', android: 'fact_check', web: 'fact_check' },
      color: 'slotAvailable',
    },
    {
      pathname: '/students/personal/[id]',
      title: 'פרטים אישיים ואיסוף',
      detail: defaultAddress ? `${defaultAddress.street} ${defaultAddress.houseNumber}, ${defaultAddress.city}` : 'אין כתובת איסוף',
      icon: { ios: 'person.text.rectangle.fill', android: 'badge', web: 'badge' },
      color: 'slotBooked',
    },
  ];

  return (
    <>
      <Card style={styles.stageCard}>
        <View style={styles.stageHeader}>
          <ThemedText type="smallBold" style={styles.flex}>
            {STAGE_LABELS[stage]}
          </ThemedText>
          {file.status === 'frozen' && (
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small">{STUDENT_STATUS_LABELS.frozen}</ThemedText>
            </View>
          )}
          {personal?.birthDate && (
            <ThemedText type="small" themeColor="textSecondary">
              גיל {formatAge(personal.birthDate)}
            </ThemedText>
          )}
        </View>
        <View style={styles.progress}>
          {STAGES.map((s, index) => (
            <View
              key={s}
              style={[
                styles.progressStep,
                { backgroundColor: index <= stageIndex ? theme.slotAvailable : theme.backgroundSelected },
              ]}
            />
          ))}
        </View>
        {file.testReadiness !== null && (
          <ThemedText type="small" themeColor="textSecondary">
            מוכנות לטסט: {'★'.repeat(file.testReadiness)}
            {'☆'.repeat(5 - file.testReadiness)}
          </ThemedText>
        )}
      </Card>

      {alerts.length > 0 && (
        <Section title="דורש תשומת לב">
          {alerts.map((alert) => (
            <Card key={alert.id} style={styles.alert}>
              <IconTile name={ALERT_STYLE[alert.tone].icon} color={ALERT_STYLE[alert.tone].color} />
              <View style={styles.flex}>
                <ThemedText type="smallBold">{alert.title}</ThemedText>
                {alert.body ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {alert.body}
                  </ThemedText>
                ) : null}
              </View>
            </Card>
          ))}
        </Section>
      )}

      <Section title="תיק התלמיד">
        <View style={styles.grid}>
          {links.map((link) => (
            <Pressable
              key={link.pathname}
              onPress={() => router.push({ pathname: link.pathname, params: { id: student.id } })}
              style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}>
              <Card style={styles.linkCard}>
                <IconTile name={link.icon} color={link.color} />
                <ThemedText type="smallBold">{link.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {link.detail}
                </ThemedText>
              </Card>
            </Pressable>
          ))}
        </View>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stageCard: {
    gap: Spacing.two,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  progress: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  progressStep: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  gridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  linkCard: {
    gap: Spacing.one,
    minHeight: 110,
  },
  pressed: {
    opacity: 0.7,
  },
});
