import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UpdatesFeed } from '@/components/updates-feed';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useUpdates } from '@/hooks/use-updates';

export default function HomeScreen() {
  const user = useCurrentUser();
  const updates = useUpdates();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="subtitle" style={styles.centered}>
            המורה
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            {user ? `שלום ${user.name}` : 'שלום'}
          </ThemedText>
        </ThemedView>

        <UpdatesFeed updates={updates} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    alignItems: 'center',
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
});
