import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  EmptyText,
  LessonCard,
  Section,
  StudentScreen,
  studentStyles,
} from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { useStudentLessons, useStudentPortal, type StudentLesson } from '@/hooks/use-student-portal';
import { confirmAction, showMessage } from '@/utils/dialogs';

/** How many past lessons to list; the total is on the progress tab. */
const PAST_SHOWN = 10;

export default function StudentLessonsScreen() {
  return (
    <StudentScreen title="שיעורים">
      <Lessons />
    </StudentScreen>
  );
}

function Lessons() {
  const { awaitingMe, awaitingTeacher, booked, past } = useStudentLessons();

  return (
    <>
      <Button label="בקשת שיעור חדש" onPress={() => router.push('/student/lessons/request')} />

      {awaitingMe.length > 0 && (
        <Section title="מחכים לאישור שלך">
          {awaitingMe.map((lesson) => (
            <AwaitingMeCard key={lesson.id} lesson={lesson} />
          ))}
        </Section>
      )}

      {awaitingTeacher.length > 0 && (
        <Section title="הבקשות שלך">
          {awaitingTeacher.map((lesson) => (
            <RequestCard key={lesson.id} lesson={lesson} />
          ))}
        </Section>
      )}

      <Section title="שיעורים קרובים">
        {booked.length === 0 ? (
          <EmptyText>אין שיעורים קרובים. אפשר לבקש שיעור בזמן הפנוי של המורה.</EmptyText>
        ) : (
          booked.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
        )}
        {booked.length > 0 && <EmptyText>לביטול או שינוי של שיעור שנקבע יש לפנות למורה.</EmptyText>}
      </Section>

      <Section title="שיעורים קודמים">
        {past.length === 0 ? (
          <EmptyText>עדיין אין שיעורים שבוצעו.</EmptyText>
        ) : (
          past.slice(0, PAST_SHOWN).map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
        )}
      </Section>
    </>
  );
}

/** A lesson the teacher scheduled: the student approves or declines it. */
function AwaitingMeCard({ lesson }: { lesson: StudentLesson }) {
  const { respondToLesson } = useStudentPortal();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    const error = await respondToLesson(lesson.id, accept);
    setBusy(null);
    if (error) showMessage('שגיאה', error);
  };

  return (
    <LessonCard lesson={lesson}>
      <View style={studentStyles.actions}>
        <View style={studentStyles.action}>
          <Button label="אישור" busy={busy === 'accept'} disabled={busy !== null} onPress={() => respond(true)} />
        </View>
        <View style={studentStyles.action}>
          <Button
            label="דחייה"
            variant="secondary"
            busy={busy === 'decline'}
            disabled={busy !== null}
            onPress={() =>
              confirmAction('דחיית השיעור', 'השיעור יבוטל והמורה יראה שדחית אותו.', 'דחייה', () => respond(false))
            }
          />
        </View>
      </View>
    </LessonCard>
  );
}

/** A lesson the student asked for: waiting for the teacher, and can be withdrawn. */
function RequestCard({ lesson }: { lesson: StudentLesson }) {
  const { cancelRequest } = useStudentPortal();
  const [busy, setBusy] = useState(false);

  const withdraw = () =>
    confirmAction('ביטול הבקשה', 'הבקשה לשיעור תבוטל.', 'ביטול הבקשה', async () => {
      setBusy(true);
      const error = await cancelRequest(lesson.id);
      setBusy(false);
      if (error) showMessage('שגיאה', error);
    });

  return (
    <LessonCard lesson={lesson}>
      <ThemedText type="small" themeColor="textSecondary">
        המורה יאשר את הבקשה או יציע זמן אחר.
      </ThemedText>
      <View style={studentStyles.actions}>
        <View style={studentStyles.action}>
          <Button label="ביטול הבקשה" variant="secondary" busy={busy} onPress={withdraw} />
        </View>
      </View>
    </LessonCard>
  );
}
