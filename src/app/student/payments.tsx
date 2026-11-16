import { StyleSheet, View } from 'react-native';

import { formatShekels, PAYMENT_COLORS, PAYMENT_TITLES } from '@/components/payment-badge';
import { Card, EmptyText, Section, StudentScreen, studentStyles } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStudentPortal } from '@/hooks/use-student-portal';
import { getPaymentStatus, PAYMENT_METHOD_LABELS } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/utils/dates';

const BALANCE_DESCRIPTIONS = {
  credit: 'שילמת מראש על שיעורים הבאים',
  even: 'כל השיעורים שולמו',
  debt: 'נשאר לשלם על שיעורים שבוצעו. התשלום מתבצע ישירות מול המורה.',
};

export default function StudentPaymentsScreen() {
  return (
    <StudentScreen title="תשלומים">
      <Payments />
    </StudentScreen>
  );
}

function Payments() {
  const theme = useTheme();
  const { record, payments } = useStudentPortal();
  if (!record) return null;
  const status = getPaymentStatus(record.balance);

  return (
    <>
      <View style={[styles.balance, { backgroundColor: theme[PAYMENT_COLORS[status]] }]}>
        <ThemedText type="smallBold" style={styles.white}>
          {PAYMENT_TITLES[status]}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.white}>
          {formatShekels(record.balance)}
        </ThemedText>
        <ThemedText type="small" style={[styles.white, studentStyles.centered]}>
          {BALANCE_DESCRIPTIONS[status]}
        </ThemedText>
      </View>

      <View style={studentStyles.row}>
        <Card style={styles.total}>
          <ThemedText type="smallBold">{formatShekels(record.totalPaid)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            שולם עד היום
          </ThemedText>
        </Card>
        <Card style={styles.total}>
          <ThemedText type="smallBold">{formatShekels(record.totalCharged)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            עלות שיעורים שבוצעו
          </ThemedText>
        </Card>
      </View>

      <Section title="היסטוריית תשלומים">
        {payments.length === 0 ? (
          <EmptyText>עדיין לא נרשמו תשלומים.</EmptyText>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id} style={styles.payment}>
              <ThemedText type="smallBold">{formatShekels(payment.amount)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={studentStyles.flex}>
                {PAYMENT_METHOD_LABELS[payment.method]} · {formatDate(payment.paidAt)}
                {payment.note ? ` · ${payment.note}` : ''}
              </ThemedText>
            </Card>
          ))
        )}
        <EmptyText>תשלומים נרשמים על ידי המורה. אם תשלום חסר, יש לפנות למורה.</EmptyText>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  balance: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  white: {
    color: '#ffffff',
  },
  total: {
    flex: 1,
    alignItems: 'center',
  },
  payment: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
