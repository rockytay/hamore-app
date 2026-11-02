import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { getPaymentStatus, type PaymentStatus } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';

export const PAYMENT_COLORS: Record<PaymentStatus, ThemeColor> = {
  credit: 'slotAvailable',
  even: 'slotPending',
  debt: 'danger',
};

export const PAYMENT_TITLES: Record<PaymentStatus, string> = {
  credit: 'יתרת זכות',
  even: 'אין חוב ואין יתרה',
  debt: 'חוב לתשלום',
};

export function formatShekels(amount: number) {
  return `₪${Math.abs(amount).toLocaleString('he-IL')}`;
}

/** A small colored pill with the student's balance, for lists. */
export function PaymentBadge({ balance }: { balance: number }) {
  const theme = useTheme();
  const status = getPaymentStatus(balance);
  const label =
    status === 'credit'
      ? `זכות ${formatShekels(balance)}`
      : status === 'debt'
        ? `חוב ${formatShekels(balance)}`
        : 'מאוזן';

  return (
    <View style={[styles.badge, { backgroundColor: theme[PAYMENT_COLORS[status]] }]}>
      <ThemedText type="smallBold" style={styles.text}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  text: {
    color: '#ffffff',
  },
});
