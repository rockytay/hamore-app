import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/utils/dialogs';

/** The student side of the app. Placeholder until the student features are built. */
export default function StudentHomeScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const firstName = session?.role === 'student' ? session.profile.firstName : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedView type="backgroundElement" style={styles.iconTile}>
            <SymbolView
              name={{ ios: 'hammer.fill', android: 'construction', web: 'construction' }}
              size={48}
              tintColor={theme.accent}
            />
          </ThemedView>
          <ThemedText type="subtitle" style={styles.centered}>
            {firstName ? `שלום ${firstName}` : 'שלום'}
          </ThemedText>
          <ThemedText type="default" style={styles.centered}>
            אזור התלמידים בבנייה
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            בקרוב תוכלו לראות כאן את השיעורים הקרובים, ההערות מהמורה ואת מצב התשלומים שלכם.
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => confirmAction('התנתקות', 'האם להתנתק מהחשבון?', 'התנתקות', signOut)}
          style={({ pressed }) => [
            styles.signOut,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" themeColor="danger">
            התנתקות
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  iconTile: {
    width: 96,
    height: 96,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
