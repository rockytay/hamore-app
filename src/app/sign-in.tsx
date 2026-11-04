import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AuthScreen,
  authFormStyles,
  FormError,
  FormField,
  FormFooterLink,
  PrimaryButton,
  RoleToggle,
} from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { SAMPLE_PASSWORD, useAuth, type Role } from '@/hooks/use-auth';

/** Sample accounts from use-auth, offered in development builds only. */
const SAMPLE_EMAILS: Record<Role, string> = {
  teacher: 'israel@example.com',
  student: 'dana@example.com',
};

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [role, setRole] = useState<Role>('teacher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!email.trim() || !password) {
      setError('יש להזין אימייל וסיסמה.');
      return;
    }
    // On success the root layout switches to the teacher or student side.
    setError(signIn(role, email, password));
  };

  const changeRole = (next: Role) => {
    setRole(next);
    setError(null);
  };

  const fillSample = () => {
    setEmail(SAMPLE_EMAILS[role]);
    setPassword(SAMPLE_PASSWORD);
    setError(null);
  };

  return (
    <AuthScreen title="המורה" subtitle="ברוכים הבאים! התחברו כדי להמשיך">
      <View style={authFormStyles.form}>
        <RoleToggle value={role} onChange={changeRole} />
        <FormField
          label="אימייל"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <FormField
          label="סיסמה"
          value={password}
          onChangeText={setPassword}
          placeholder="הסיסמה שלך"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <FormError message={error} />
        <PrimaryButton
          label={role === 'teacher' ? 'התחברות כמורה' : 'התחברות כתלמיד/ה'}
          onPress={submit}
        />
      </View>

      <FormFooterLink
        text="אין לכם חשבון?"
        linkText="הרשמה"
        onPress={() => router.push({ pathname: '/sign-up', params: { role } })}
      />

      {__DEV__ && (
        <Pressable onPress={fillSample} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sample}>
            פיתוח: מילוי חשבון לדוגמה ({SAMPLE_EMAILS[role]})
          </ThemedText>
        </Pressable>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sample: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
