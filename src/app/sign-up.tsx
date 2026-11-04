import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AuthScreen,
  authFormStyles,
  FormError,
  FormField,
  FormFooterLink,
  PrimaryButton,
  RoleToggle,
} from '@/components/auth-form';
import { useAuth, type Role, type SignUpInput } from '@/hooks/use-auth';
import { formatPhone, isValidPhone } from '@/hooks/use-students';

const MIN_PASSWORD_LENGTH = 6;

type Draft = Omit<SignUpInput, 'role'> & { confirmPassword: string };

const EMPTY_DRAFT: Draft = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
};

/** Returns an error message in Hebrew, or null if the account can be created. */
function validate(draft: Draft) {
  if (!draft.firstName.trim() || !draft.lastName.trim()) return 'יש למלא שם פרטי ושם משפחה.';
  if (!isValidPhone(draft.phone)) return 'יש להזין מספר נייד תקין (05X-XXXXXXX).';
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'כתובת האימייל אינה תקינה.';
  if (draft.password.length < MIN_PASSWORD_LENGTH) {
    return `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.`;
  }
  if (draft.password !== draft.confirmPassword) return 'הסיסמאות אינן תואמות.';
  return null;
}

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>(params.role === 'student' ? 'student' : 'teacher');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const change = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  const submit = () => {
    const message = validate(draft);
    if (message) {
      setError(message);
      return;
    }
    // On success the root layout switches to the teacher or student side.
    setError(
      signUp({
        role,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        phone: formatPhone(draft.phone),
        email: draft.email.trim(),
        password: draft.password,
      })
    );
  };

  const goToSignIn = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  return (
    <AuthScreen
      title="יצירת חשבון"
      subtitle={
        role === 'teacher'
          ? 'נהלו תלמידים, שיעורים ותשלומים במקום אחד'
          : 'עקבו אחרי השיעורים וההתקדמות שלכם'
      }>
      <View style={authFormStyles.form}>
        <RoleToggle value={role} onChange={setRole} />
        <View style={authFormStyles.row}>
          <View style={authFormStyles.rowItem}>
            <FormField
              label="שם פרטי"
              value={draft.firstName}
              onChangeText={(firstName) => change({ firstName })}
              autoComplete="given-name"
              textContentType="givenName"
            />
          </View>
          <View style={authFormStyles.rowItem}>
            <FormField
              label="שם משפחה"
              value={draft.lastName}
              onChangeText={(lastName) => change({ lastName })}
              autoComplete="family-name"
              textContentType="familyName"
            />
          </View>
        </View>
        <FormField
          label="טלפון נייד"
          value={draft.phone}
          onChangeText={(phone) => change({ phone })}
          placeholder="050-1234567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <FormField
          label="אימייל"
          value={draft.email}
          onChangeText={(email) => change({ email })}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <FormField
          label="סיסמה"
          value={draft.password}
          onChangeText={(password) => change({ password })}
          placeholder={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <FormField
          label="אימות סיסמה"
          value={draft.confirmPassword}
          onChangeText={(confirmPassword) => change({ confirmPassword })}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <FormError message={error} />
        <PrimaryButton
          label={role === 'teacher' ? 'הרשמה כמורה' : 'הרשמה כתלמיד/ה'}
          onPress={submit}
        />
      </View>

      <FormFooterLink text="כבר יש לכם חשבון?" linkText="התחברות" onPress={goToSignIn} />
    </AuthScreen>
  );
}
