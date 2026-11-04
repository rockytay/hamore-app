import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ROLE_LABELS, type Role } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

const LOGO = require('@/assets/images/hamore-logo.png');

/** Light blue from the Hamore logo, as on the splash screen. */
const LOGO_BACKGROUND = '#5CD3F2';

/** Narrower than the app content so the form stays readable on tablets and web. */
const FORM_MAX_WIDTH = 440;

/** Screen frame for the sign-in and sign-up forms: logo, title and a scrollable form. */
export function AuthScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoTile}>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
            </View>
            <ThemedText type="subtitle" style={styles.centered}>
              {title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centered}>
              {subtitle}
            </ThemedText>
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Choose whether to sign in or sign up as a teacher or a student. */
export function RoleToggle({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.toggle}>
      {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
        const selected = role === value;
        return (
          <Pressable
            key={role}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(role)}
            style={[styles.toggleOption, selected && { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
              {ROLE_LABELS[role]}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

export function FormField({ label, ...inputProps }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        autoCorrect={false}
        placeholderTextColor={theme.textSecondary}
        {...inputProps}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <ThemedText type="small" themeColor="danger" style={styles.centered}>
      {message}
    </ThemedText>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.accent },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.buttonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A line of text with a tappable link at the end, e.g. "No account? Sign up". */
export function FormFooterLink({
  text,
  linkText,
  onPress,
}: {
  text: string;
  linkText: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.footer}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
      <Pressable accessibilityRole="link" onPress={onPress} hitSlop={Spacing.two}>
        {({ pressed }) => (
          <ThemedText type="smallBold" themeColor="accent" style={pressed && styles.pressed}>
            {linkText}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

export const authFormStyles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: FORM_MAX_WIDTH,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: Spacing.four,
    backgroundColor: LOGO_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  logo: {
    width: 72,
    height: 72,
  },
  centered: {
    textAlign: 'center',
  },
  toggle: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Spacing.three,
  },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two + Spacing.half,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    borderRadius: Spacing.three - Spacing.one,
    fontSize: 16,
    textAlign: 'right',
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  buttonText: {
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
