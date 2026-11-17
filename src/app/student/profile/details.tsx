import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { ChoiceChips, DateField, FieldHint, FieldLabel, optionsOf } from '@/components/form-ui';
import { PersonalDetailsEditor } from '@/components/personal-details-editor';
import { Button, Card, EmptyText, Section } from '@/components/student-ui';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  getAge,
  LANGUAGE_LABELS,
  REMINDER_CHANNEL_LABELS,
  type StudentPersonal,
} from '@/hooks/student-file';
import { updateMyProfile, type ProfileChanges } from '@/hooks/student-personal';
import { useSession } from '@/hooks/use-auth';
import { useStudentPortal } from '@/hooks/use-student-portal';
import { showMessage } from '@/utils/dialogs';

const REMINDER_HOURS = [1, 2, 3, 12, 24, 48];

/** The student edits their own details: birth date, language, reminders, addresses, contacts, availability. */
export default function StudentDetailsScreen() {
  const { personal, loading, reload } = useStudentPortal();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator />
        ) : personal ? (
          <>
            <BasicDetails key={personal.profileId} personal={personal} onSaved={() => reload(true)} />
            <PersonalDetailsEditor personal={personal} onChanged={() => reload(true)} audience="student" />
          </>
        ) : (
          <EmptyText>טעינת הפרטים נכשלה. יש לחזור ולנסות שוב.</EmptyText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function BasicDetails({ personal, onSaved }: { personal: StudentPersonal; onSaved: () => Promise<void> }) {
  const session = useSession();
  const [draft, setDraft] = useState<Required<ProfileChanges>>({
    birthDate: personal.birthDate,
    language: personal.language,
    reminderChannel: personal.reminderChannel,
    reminderHoursBefore: personal.reminderHoursBefore,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (changes: ProfileChanges) => setDraft((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (!session) return;
    if (draft.birthDate && (draft.birthDate > new Date() || getAge(draft.birthDate) > 100)) {
      return setError('תאריך הלידה אינו תקין.');
    }
    setError(null);
    setBusy(true);
    const failed = await updateMyProfile(session.userId, draft);
    if (!failed) await onSaved();
    setBusy(false);
    if (failed) showMessage('שגיאה', failed);
    else showMessage('נשמר', 'הפרטים עודכנו.');
  };

  return (
    <Section title="פרטים אישיים">
      <Card style={styles.form}>
        <DateField
          label="תאריך לידה"
          value={draft.birthDate}
          onChange={(birthDate) => change({ birthDate })}
          hint="קובע ממתי אפשר להתחיל תאוריה, שיעורים וטסט"
        />
        <FieldLabel>שפה מועדפת</FieldLabel>
        <ChoiceChips
          options={optionsOf(LANGUAGE_LABELS)}
          value={draft.language}
          onChange={(language) => language && change({ language })}
        />
        <FieldLabel>איך לקבל תזכורות</FieldLabel>
        <ChoiceChips
          options={optionsOf(REMINDER_CHANNEL_LABELS)}
          value={draft.reminderChannel}
          onChange={(reminderChannel) => reminderChannel && change({ reminderChannel })}
        />
        <FieldLabel>כמה זמן לפני השיעור</FieldLabel>
        <ChoiceChips
          options={REMINDER_HOURS.map((hours) => ({ value: hours, label: hours === 1 ? 'שעה' : `${hours} שעות` }))}
          value={draft.reminderHoursBefore}
          onChange={(reminderHoursBefore) => reminderHoursBefore && change({ reminderHoursBefore })}
        />
        <FieldHint>שליחת התזכורות עצמה תתווסף בהמשך.</FieldHint>
        {error && <FieldHint danger>{error}</FieldHint>}
        <Button label="שמירה" onPress={save} busy={busy} />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  form: {
    gap: Spacing.two,
  },
});
