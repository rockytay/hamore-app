import Constants from 'expo-constants';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Section, StudentScreen, studentStyles } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useStudentPortal } from '@/hooks/use-student-portal';
import { TRANSMISSION_LABELS } from '@/hooks/use-students';
import { confirmAction } from '@/utils/dialogs';

export default function StudentProfileScreen() {
  const { session, signOut } = useAuth();
  const { teacher } = useStudentPortal();
  const profile = session?.role === 'student' ? session.profile : null;

  return (
    <StudentScreen title="פרופיל" requiresTeacher={false}>
      {profile && (
        <Section title="הפרטים שלי">
          <Card>
            <Row label="שם" value={`${profile.firstName} ${profile.lastName}`} />
            <Row label="טלפון" value={profile.phone} />
            <Row label="אימייל" value={profile.email} last />
          </Card>
        </Section>
      )}

      {teacher && (
        <Section title="המורה שלי">
          <Card>
            <Row label="שם" value={`${teacher.firstName} ${teacher.lastName}`} />
            {teacher.city ? <Row label="עיר" value={teacher.city} /> : null}
            {teacher.carModel ? (
              <Row label="רכב לימוד" value={`${teacher.carModel} · ${TRANSMISSION_LABELS[teacher.transmission]}`} />
            ) : null}
            <Pressable onPress={() => Linking.openURL(`tel:${teacher.phone.replace(/\D/g, '')}`)}>
              <Row label="טלפון" value={teacher.phone} link last />
            </Pressable>
          </Card>
        </Section>
      )}

      <Button
        label="התנתקות"
        variant="danger"
        onPress={() => confirmAction('התנתקות', 'האם להתנתק מהחשבון?', 'התנתקות', signOut)}
      />

      <ThemedText type="small" themeColor="textSecondary" style={studentStyles.centered}>
        המורה · גרסה {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </StudentScreen>
  );
}

function Row({ label, value, link, last }: { label: string; value: string; link?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowSpacing]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor={link ? 'accent' : 'text'} style={styles.value}>
        {value || '—'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowSpacing: {
    paddingBottom: Spacing.two,
  },
  value: {
    flexShrink: 1,
  },
});
