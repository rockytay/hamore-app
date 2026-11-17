/**
 * Password rules for new passwords (sign-up, and any future "change password" screen).
 * The same minimum length and letters+digits rule should be set in the Supabase dashboard
 * (Authentication → Email → password requirements), so it can't be bypassed.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Passwords people pick most often. Rejected even when they pass the other rules. */
const COMMON_PASSWORDS = new Set([
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwerty12',
  'abc12345',
  'abcd1234',
  'a1234567',
  'aa123456',
  'asd12345',
  'q1w2e3r4',
  '1q2w3e4r',
  '1qaz2wsx',
  'iloveyou1',
  'welcome1',
  'admin123',
  'letmein1',
  'shalom123',
  'israel123',
]);

export type PasswordContext = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

export type PasswordCheck = { label: string; met: boolean };

/** The rules as a checklist, to show under the field while typing. */
export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: `לפחות ${MIN_PASSWORD_LENGTH} תווים`, met: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'אות באנגלית', met: /[a-z]/i.test(password) },
    { label: 'ספרה', met: /\d/.test(password) },
  ];
}

/** Returns why the password is not allowed, in Hebrew, or null if it is fine. */
export function validatePassword(password: string, context: PasswordContext = {}): string | null {
  if (/\s/.test(password)) return 'הסיסמה לא יכולה להכיל רווחים.';
  if (password.length > 72) return 'הסיסמה ארוכה מדי (עד 72 תווים).';
  if (getPasswordChecks(password).some((check) => !check.met)) {
    return `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים, ובהם אות באנגלית וספרה.`;
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'זו סיסמה נפוצה מדי. יש לבחור סיסמה אחרת.';
  if (/^(.)\1+$/.test(password) || isSequence(lower)) return 'הסיסמה צפויה מדי. יש לבחור סיסמה אחרת.';

  // The person's own details are the first thing someone would try.
  const emailName = context.email?.split('@')[0]?.toLowerCase() ?? '';
  const phoneDigits = context.phone?.replace(/\D/g, '') ?? '';
  const personal = [emailName, context.firstName?.toLowerCase() ?? '', context.lastName?.toLowerCase() ?? '']
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  if (personal.some((part) => lower.includes(part))) {
    return 'הסיסמה לא יכולה לכלול את השם או את האימייל שלך.';
  }
  if (phoneDigits.length >= 7 && password.includes(phoneDigits.slice(-7))) {
    return 'הסיסמה לא יכולה לכלול את מספר הטלפון שלך.';
  }
  return null;
}

/** Runs like "12345678" or "abcdefgh", forwards or backwards. */
function isSequence(text: string) {
  if (text.length < 4) return false;
  const steps = new Set<number>();
  for (let i = 1; i < text.length; i++) steps.add(text.charCodeAt(i) - text.charCodeAt(i - 1));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}
