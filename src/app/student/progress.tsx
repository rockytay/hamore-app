import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyText, Section, StudentScreen, studentStyles } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStudentPortal } from '@/hooks/use-student-portal';
import { LICENSE_CATEGORIES, TRANSMISSION_LABELS } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/utils/dates';

export default function StudentProgressScreen() {
  return (
    <StudentScreen title="התקדמות">
      <Progress />
    </StudentScreen>
  );
}

function Progress() {
  const { record, notes } = useStudentPortal();
  if (!record) return null;

  return (
    <>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          רישיון דרגה {record.licenseCategory} · {TRANSMISSION_LABELS[record.transmission]}
        </ThemedText>
        <ThemedText type="smallBold">{LICENSE_CATEGORIES[record.licenseCategory]}</ThemedText>
      </Card>

      <Section title="הדרך לרישיון">
        <Card style={styles.steps}>
          <Step done title="הצטרפות למורה" detail={`מ־${formatDate(record.joinedAt)}`} />
          <Step
            done={record.theoryPassed}
            title="מבחן תאוריה"
            detail={record.theoryPassed ? 'עברת' : 'עדיין לא עברת. בלי תאוריה אי אפשר לגשת לטסט.'}
          />
          <Step
            done={record.lessonsCompleted > 0}
            title="שיעורי נהיגה"
            detail={
              record.lessonsCompleted === 0
                ? 'עדיין לא בוצעו שיעורים'
                : record.lessonsCompleted === 1
                  ? 'בוצע שיעור אחד'
                  : `בוצעו ${record.lessonsCompleted} שיעורים`
            }
          />
          <Step done={false} title="טסט" detail="המורה יחליט איתך מתי את/ה מוכן/ה לטסט" last />
        </Card>
      </Section>

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

function Step({ done, title, detail, last }: { done: boolean; title: string; detail: string; last?: boolean }) {
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
      <View style={[studentStyles.flex, !last && styles.stepBody]}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
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
  stepBody: {
    paddingBottom: Spacing.three,
  },
});
