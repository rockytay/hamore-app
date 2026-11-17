import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { InfoRow } from '@/components/form-ui';
import { formatShekels } from '@/components/payment-badge';
import { Button, Card, Section, StudentScreen, studentStyles } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import {
  formatAddress,
  formatAge,
  LANGUAGE_LABELS,
  PAYMENT_PLAN_LABELS,
  REMINDER_CHANNEL_LABELS,
} from '@/hooks/student-file';
import { useAuth } from '@/hooks/use-auth';
import { useStudentPortal } from '@/hooks/use-student-portal';
import { PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS } from '@/hooks/use-students';
import { confirmAction } from '@/utils/dialogs';
import { formatDate } from '@/utils/dates';

export default function StudentProfileScreen() {
  const { session, signOut } = useAuth();
  const { teacher, personal, record } = useStudentPortal();
  const profile = session?.role === 'student' ? session.profile : null;
  const defaultAddress = personal?.addresses.find((a) => a.isDefault) ?? personal?.addresses[0];
  const parent = personal?.contacts.find((c) => c.kind === 'parent');

  return (
    <StudentScreen title="פרופיל" requiresTeacher={false}>
      {profile && (
        <Section title="הפרטים שלי">
          <Card>
            <InfoRow label="שם" value={`${profile.firstName} ${profile.lastName}`} />
            <InfoRow label="טלפון" value={profile.phone} />
            <InfoRow label="אימייל" value={profile.email} />
            {personal && (
              <>
                <InfoRow
                  label="תאריך לידה"
                  value={
                    personal.birthDate
                      ? `${formatDate(personal.birthDate)} (גיל ${formatAge(personal.birthDate)})`
                      : 'לא הוזן'
                  }
                />
                <InfoRow label="שפה" value={LANGUAGE_LABELS[personal.language]} />
                <InfoRow label="כתובת איסוף" value={defaultAddress ? formatAddress(defaultAddress) : 'לא הוזנה'} />
                <InfoRow label="הורה" value={parent ? `${parent.name} · ${parent.phone}` : 'לא הוזן'} />
                <InfoRow
                  label="תזכורות"
                  value={`${REMINDER_CHANNEL_LABELS[personal.reminderChannel]} · ${personal.reminderHoursBefore} שעות לפני`}
                />
              </>
            )}
          </Card>
          <Button
            label="עריכת פרטים, כתובות ואנשי קשר"
            variant="secondary"
            onPress={() => router.push('/student/profile/details')}
          />
        </Section>
      )}

      {teacher && (
        <Section title="המורה שלי">
          <Card>
            <InfoRow label="שם" value={`${teacher.firstName} ${teacher.lastName}`} />
            {teacher.city ? <InfoRow label="עיר" value={teacher.city} /> : null}
            {teacher.carModel ? (
              <InfoRow label="רכב לימוד" value={`${teacher.carModel} · ${TRANSMISSION_LABELS[teacher.transmission]}`} />
            ) : null}
            <InfoRow
              label="טלפון"
              value={teacher.phone}
              onPress={() => Linking.openURL(`tel:${teacher.phone.replace(/\D/g, '')}`)}
            />
          </Card>
        </Section>
      )}

      {record && (
        <Section title="הסדר עם המורה">
          <Card>
            <InfoRow
              label="תוכנית תשלום"
              value={
                PAYMENT_PLAN_LABELS[record.file.paymentPlan] +
                (record.file.paymentPlanNote ? ` · ${record.file.paymentPlanNote}` : '')
              }
            />
            {record.file.preferredPaymentMethod && (
              <InfoRow label="אמצעי תשלום" value={PAYMENT_METHOD_LABELS[record.file.preferredPaymentMethod]} />
            )}
            <InfoRow
              label="ביטול ללא חיוב"
              value={`עד ${record.file.cancellationNoticeHours} שעות לפני השיעור`}
            />
            {teacher && <InfoRow label="מחיר שיעור רגיל" value={formatShekels(teacher.lessonPrice)} />}
          </Card>
        </Section>
      )}

      <Button
        label="התנתקות"
        variant="danger"
        onPress={() => confirmAction('התנתקות', 'האם להתנתק מהחשבון?', 'התנתקות', signOut)}
      />
      <Button label="מחיקת חשבון" variant="secondary" onPress={() => router.push('/delete-account')} />

      <ThemedText type="small" themeColor="textSecondary" style={studentStyles.centered}>
        המורה · גרסה {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </StudentScreen>
  );
}
