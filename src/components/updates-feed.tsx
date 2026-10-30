import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import type { Update } from '@/hooks/use-updates';
import { useTheme } from '@/hooks/use-theme';

type UpdateDisplay = {
  title: string;
  body: string;
  icon: SymbolViewProps['name'];
  color: ThemeColor;
};

function formatDays(days: number) {
  if (days === 1) return 'יום אחד';
  if (days === 2) return 'יומיים';
  return `${days} ימים`;
}

function formatLessonTime(date: Date) {
  return date.toLocaleString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'עכשיו';
  if (minutes === 1) return 'לפני דקה';
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'לפני שעה';
  if (hours === 2) return 'לפני שעתיים';
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
  return `לפני ${formatDays(days)}`;
}

function getUpdateDisplay(update: Update): UpdateDisplay {
  switch (update.kind) {
    case 'new-student':
      return {
        title: 'תלמיד חדש',
        body: `${update.studentName} נוסף/ה לרשימת התלמידים`,
        icon: { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' },
        color: 'accent',
      };
    case 'lesson-confirmed':
      return {
        title: 'שיעור אושר',
        body: `${update.studentName} אישר/ה את מועד השיעור: ${formatLessonTime(update.lessonTime)}`,
        icon: { ios: 'calendar.badge.checkmark', android: 'event_available', web: 'event_available' },
        color: 'accent',
      };
    case 'payment-received':
      return {
        title: 'התקבל תשלום',
        body: `${update.studentName} שילם/ה ₪${update.amount} עבור השיעור`,
        icon: { ios: 'creditcard.fill', android: 'payments', web: 'payments' },
        color: 'accent',
      };
    case 'payment-overdue':
      return {
        title: 'תשלום באיחור',
        body: `${update.studentName} מאחר/ת בתשלום כבר ${formatDays(update.daysLate)}`,
        icon: {
          ios: 'exclamationmark.triangle.fill',
          android: 'warning',
          web: 'warning',
        },
        color: 'danger',
      };
  }
}

function UpdateRow({ update }: { update: Update }) {
  const theme = useTheme();
  const { title, body, icon, color } = getUpdateDisplay(update);

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedView type="backgroundSelected" style={styles.iconBadge}>
        <SymbolView name={icon} size={18} tintColor={theme[color]} />
      </ThemedView>
      <View style={styles.rowText}>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatTimeAgo(update.createdAt)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {body}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

export function UpdatesFeed({ updates }: { updates: Update[] }) {
  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">עדכונים והתראות</ThemedText>
      <FlatList
        data={updates}
        keyExtractor={(update) => update.id}
        renderItem={({ item }) => <UpdateRow update={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              אין עדכונים חדשים
            </ThemedText>
          </ThemedView>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
