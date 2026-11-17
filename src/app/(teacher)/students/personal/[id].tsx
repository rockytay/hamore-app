import { Linking } from 'react-native';

import { InfoRow } from '@/components/form-ui';
import { PersonalDetailsEditor } from '@/components/personal-details-editor';
import { Card, EmptyText, Section } from '@/components/student-ui';
import { TeacherFileScreen } from '@/components/teacher-file-screen';
import {
  formatAge,
  getEligibility,
  LANGUAGE_LABELS,
  REMINDER_CHANNEL_LABELS,
} from '@/hooks/student-file';
import { useStudentFileActions, type Student } from '@/hooks/use-students';
import { formatDate } from '@/utils/dates';

export default function StudentPersonalScreen() {
  return <TeacherFileScreen>{(student) => <Personal student={student} />}</TeacherFileScreen>;
}

function Personal({ student }: { student: Student }) {
  const { reloadStudent } = useStudentFileActions();
  const personal = student.personal;

  if (!personal) {
    return <EmptyText>החשבון של התלמיד/ה נמחק. נשארו רק פרטי התיק.</EmptyText>;
  }

  const eligibility = getEligibility(personal.birthDate, student.licenseCategory);

  return (
    <>
      <Section title="פרטים אישיים">
        <Card>
          <InfoRow label="טלפון" value={student.phone} onPress={() => Linking.openURL(`tel:${student.phone.replace(/\D/g, '')}`)} />
          <InfoRow
            label="אימייל"
            value={personal.email}
            onPress={personal.email ? () => Linking.openURL(`mailto:${personal.email}`) : undefined}
          />
          <InfoRow
            label="תאריך לידה"
            value={personal.birthDate ? `${formatDate(personal.birthDate)} (גיל ${formatAge(personal.birthDate)})` : ''}
          />
          <InfoRow label="שפה מועדפת" value={LANGUAGE_LABELS[personal.language]} />
          <InfoRow
            label="תזכורות"
            value={`${REMINDER_CHANNEL_LABELS[personal.reminderChannel]} · ${personal.reminderHoursBefore} שעות לפני`}
          />
        </Card>
        <EmptyText>את הפרטים האלה התלמיד/ה מעדכן/ת בעצמו/ה באפליקציה.</EmptyText>
      </Section>

      {eligibility.length > 0 && (
        <Section title="זכאות לפי גיל (רישיון B)">
          <Card>
            {eligibility.map((rule) => (
              <InfoRow
                key={rule.label}
                label={rule.label}
                value={rule.reached ? '✓ זכאי/ת' : `מ־${formatDate(rule.from)}`}
                danger={!rule.reached}
              />
            ))}
          </Card>
        </Section>
      )}

      <PersonalDetailsEditor
        personal={personal}
        onChanged={() => reloadStudent(student.id)}
        readOnly={!!student.removal}
        audience="teacher"
      />
    </>
  );
}
