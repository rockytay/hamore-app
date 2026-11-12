import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthScreen, FormError, PrimaryButton } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

/** Codes already sent to Supabase. A code works once, and effects can run twice in development. */
const usedCodes = new Set<string>();

type Status = 'working' | 'confirmed' | 'error';

/**
 * Where the confirmation email brings the user back: hamoreapp://auth/callback?code=...
 * Supabase has already confirmed the email by now. This screen swaps the one-time code
 * for a session, so the user lands in the app signed in.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_code?: string }>();
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>(params.code ? 'working' : 'error');
  const [message, setMessage] = useState<string | null>(
    params.error_code === 'otp_expired'
      ? 'הקישור פג תוקף. אפשר להתחבר עם האימייל והסיסמה, או להירשם מחדש כדי לקבל קישור חדש.'
      : params.code
        ? null
        : 'הקישור אינו תקין. נסו להתחבר עם האימייל והסיסמה.'
  );

  useEffect(() => {
    const code = params.code;
    if (!code || usedCodes.has(code)) return;
    usedCodes.add(code);
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) return; // The root layout loads the profile; the next effect moves on.
      // The email is confirmed either way. This happens when the link is opened on a
      // different device than the one that signed up, so it has no matching sign-in to finish.
      setStatus('confirmed');
      setMessage('החשבון אושר. אפשר להתחבר עכשיו עם האימייל והסיסמה.');
    });
  }, [params.code]);

  // Signed in: go to the home screen of the teacher or student side.
  useEffect(() => {
    if (session) router.replace(session.role === 'student' ? '/student' : '/');
  }, [session]);

  return (
    <AuthScreen title="אישור החשבון" subtitle="המורה">
      {status === 'working' ? (
        <View style={styles.working}>
          <ActivityIndicator />
          <ThemedText themeColor="textSecondary">מאשרים את החשבון ומחברים אתכם…</ThemedText>
        </View>
      ) : (
        <View style={styles.done}>
          {status === 'confirmed' ? (
            <ThemedText style={styles.centered}>{message}</ThemedText>
          ) : (
            <FormError message={message} />
          )}
          <PrimaryButton label="למסך ההתחברות" onPress={() => router.replace('/sign-in')} />
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  working: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  done: {
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
});
