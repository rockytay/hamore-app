import Constants from 'expo-constants';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatShekels } from '@/components/payment-badge';
import { SubscriptionCard } from '@/components/subscription-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getEventStart, isLesson, useCalendarEvents } from '@/hooks/use-calendar-events';
import {
  LESSON_DURATIONS,
  useCurrentUser,
  useCurrentUserActions,
  type CurrentUser,
  type TeacherSettings,
} from '@/hooks/use-current-user';
import {
  LICENSE_CATEGORIES,
  TRANSMISSION_LABELS,
  useStudents,
  type LicenseCategory,
  type Transmission,
} from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/utils/dialogs';

type SymbolName = SymbolViewProps['name'];

/** Editable copy of the profile; the price is kept as text while typing. */
type Draft = Omit<CurrentUser, 'lessonPrice' | 'settings' | 'subscription'> & { lessonPrice: string };

function toDraft({ settings, subscription, lessonPrice, ...user }: CurrentUser): Draft {
  return { ...user, lessonPrice: String(lessonPrice) };
}

/** Returns an error message in Hebrew, or null if the draft can be saved. */
function validateDraft(draft: Draft) {
  if (!draft.firstName.trim() || !draft.lastName.trim()) return 'יש למלא שם פרטי ושם משפחה.';
  if (draft.phone.replace(/\D/g, '').length < 9) return 'מספר הטלפון אינו תקין.';
  if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
    return 'כתובת האימייל אינה תקינה.';
  }
  if (draft.teachingCategories.length === 0) return 'יש לבחור לפחות דרגת הוראה אחת.';
  if (!(Number(draft.lessonPrice) > 0)) return 'יש להזין מחיר לשיעור.';
  return null;
}

export default function ProfileScreen() {
  const user = useCurrentUser();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {user && <Profile user={user} />}
      </SafeAreaView>
    </ThemedView>
  );
}

function Profile({ user }: { user: CurrentUser }) {
  const { updateUser, signOut } = useCurrentUserActions();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  const shown = draft ?? toDraft(user);

  const change = (changes: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const startEditing = () => {
    setError(null);
    setDraft(toDraft(user));
  };

  const save = () => {
    if (!draft) return;
    const message = validateDraft(draft);
    if (message) {
      setError(message);
      return;
    }
    updateUser({
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim(),
      lessonPrice: Number(draft.lessonPrice),
    });
    setDraft(null);
    setError(null);
  };

  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  const toggleCategory = (category: LicenseCategory) =>
    change({
      teachingCategories: shown.teachingCategories.includes(category)
        ? shown.teachingCategories.filter((c) => c !== category)
        : [...shown.teachingCategories, category],
    });

  const setSetting = (key: keyof TeacherSettings, value: boolean) =>
    updateUser({ settings: { ...user.settings, [key]: value } });

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}>
      <ProfileHeader user={user} editing={editing} onEdit={startEditing} />

      {!editing && <TeacherStats />}

      {!editing && (
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            מנוי
          </ThemedText>
          <SubscriptionCard user={user} />
        </View>
      )}

      <Section title="פרטים אישיים">
        <Field label="שם פרטי" value={shown.firstName} editing={editing} onChange={(firstName) => change({ firstName })} />
        <Field label="שם משפחה" value={shown.lastName} editing={editing} onChange={(lastName) => change({ lastName })} />
        <Field label="טלפון" value={shown.phone} editing={editing} keyboardType="phone-pad" onChange={(phone) => change({ phone })} />
        <Field label="אימייל" value={shown.email} editing={editing} keyboardType="email-address" onChange={(email) => change({ email })} />
        <Field label="עיר" value={shown.city} editing={editing} onChange={(city) => change({ city })} last />
      </Section>

      <Section title="פרטים מקצועיים">
        <Field
          label="מספר רישיון נהיגה"
          value={shown.driverLicenseNumber}
          editing={editing}
          keyboardType="number-pad"
          onChange={(text) => change({ driverLicenseNumber: text.replace(/\D/g, '') })}
        />
        <Field
          label="מספר היתר הוראה"
          value={shown.teacherLicenseNumber}
          editing={editing}
          keyboardType="number-pad"
          onChange={(text) => change({ teacherLicenseNumber: text.replace(/\D/g, '') })}
        />
        <ChoiceField
          label="דרגות הוראה"
          summary={shown.teachingCategories.join(', ')}
          editing={editing}
          options={Object.keys(LICENSE_CATEGORIES) as LicenseCategory[]}
          isSelected={(category) => shown.teachingCategories.includes(category)}
          onSelect={toggleCategory}
        />
        <Field label="רכב לימוד" value={shown.carModel} editing={editing} onChange={(carModel) => change({ carModel })} />
        <ChoiceField
          label="תיבת הילוכים"
          summary={TRANSMISSION_LABELS[shown.transmission]}
          editing={editing}
          options={Object.keys(TRANSMISSION_LABELS) as Transmission[]}
          getLabel={(transmission) => TRANSMISSION_LABELS[transmission]}
          isSelected={(transmission) => shown.transmission === transmission}
          onSelect={(transmission) => change({ transmission })}
        />
        <Field
          label="מחיר לשיעור (₪)"
          value={editing ? shown.lessonPrice : formatShekels(user.lessonPrice)}
          editing={editing}
          keyboardType="number-pad"
          onChange={(lessonPrice) => change({ lessonPrice: lessonPrice.replace(/\D/g, '') })}
        />
        <ChoiceField
          label="משך שיעור"
          summary={`${shown.lessonDurationMin} דקות`}
          hint="משך ברירת המחדל לשיעור חדש ביומן"
          editing={editing}
          options={LESSON_DURATIONS}
          getLabel={(minutes) => `${minutes} דק׳`}
          isSelected={(minutes) => shown.lessonDurationMin === minutes}
          onSelect={(lessonDurationMin) => change({ lessonDurationMin })}
          last
        />
      </Section>

      {editing ? (
        <View style={styles.editActions}>
          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.centered}>
              {error}
            </ThemedText>
          )}
          <Button label="שמירת שינויים" onPress={save} />
          <Button label="ביטול" variant="secondary" onPress={cancel} />
        </View>
      ) : (
        <>
          <Section title="הגדרות">
            <SwitchRow
              label="תזכורת על חוב בקביעת שיעור"
              hint="אזהרה לפני קביעת שיעור לתלמיד שטרם שילם"
              value={user.settings.debtWarnings}
              onChange={(value) => setSetting('debtWarnings', value)}
            />
            <SwitchRow
              label="תזכורת לפני שיעור"
              hint="התראה למכשיר שעה לפני כל שיעור (בקרוב)"
              value={user.settings.lessonReminders}
              onChange={(value) => setSetting('lessonReminders', value)}
              last
            />
          </Section>

          <Section title="חשבון">
            <LinkRow
              icon={{ ios: 'questionmark.circle', android: 'help', web: 'help' }}
              label="עזרה ותמיכה"
              onPress={() => showMessage('עזרה ותמיכה', 'מרכז העזרה יהיה זמין בקרוב.')}
            />
            <LinkRow
              icon={{ ios: 'lock.shield', android: 'shield', web: 'shield' }}
              label="תנאי שימוש ופרטיות"
              onPress={() => showMessage('תנאי שימוש ופרטיות', 'המסמכים יפורסמו בקרוב.')}
            />
            <LinkRow
              icon={{
                ios: 'rectangle.portrait.and.arrow.right',
                android: 'logout',
                web: 'logout',
              }}
              label="התנתקות"
              danger
              onPress={() =>
                confirmAction('התנתקות', 'האם להתנתק מהחשבון?', 'התנתקות', signOut)
              }
              last
            />
          </Section>

          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            המורה · גרסה {Constants.expoConfig?.version ?? '1.0.0'}
          </ThemedText>
        </>
      )}
    </ScrollView>
  );
}

function ProfileHeader({
  user,
  editing,
  onEdit,
}: {
  user: CurrentUser;
  editing: boolean;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;

  return (
    <View style={styles.profileHeader}>
      <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
        <ThemedText type="subtitle" style={styles.avatarText}>
          {initials}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={styles.centered}>
        {user.firstName} {user.lastName}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        מורה לנהיגה{user.city ? ` · ${user.city}` : ''}
      </ThemedText>
      {!editing && (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [
            styles.editButton,
            { borderColor: theme.accent },
            pressed && styles.pressed,
          ]}>
          <SymbolView
            name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
            size={14}
            tintColor={theme.accent}
          />
          <ThemedText type="smallBold" themeColor="accent">
            עריכת פרטים
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/** A quick look at the teacher's activity, from the students and calendar. */
function TeacherStats() {
  const students = useStudents();
  const { events } = useCalendarEvents();
  const now = new Date();
  const upcomingLessons = events.filter(
    (event) => isLesson(event) && event.status === 'booked' && getEventStart(event) >= now
  ).length;
  const totalDebt = students.reduce((sum, student) => sum + Math.min(student.balance, 0), 0);

  return (
    <View style={styles.stats}>
      <Stat label="תלמידים" value={String(students.length)} />
      <Stat label="שיעורים קרובים" value={String(upcomingLessons)} />
      <Stat label="חובות פתוחים" value={formatShekels(totalDebt)} danger={totalDebt < 0} />
    </View>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold" themeColor={danger ? 'danger' : 'text'} style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

/** A row inside a section card, with a divider unless it is the last one. */
function Row({ children, last, style }: { children: ReactNode; last?: boolean; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.backgroundSelected },
        style,
      ]}>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  keyboardType,
  last,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  last?: boolean;
}) {
  const theme = useTheme();

  if (editing) {
    return (
      <Row last={last} style={styles.editRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={label}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
      </Row>
    );
  }

  return (
    <Row last={last}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value || '—'}
      </ThemedText>
    </Row>
  );
}

function ChoiceField<T extends string | number>({
  label,
  summary,
  hint,
  editing,
  options,
  getLabel = String,
  isSelected,
  onSelect,
  last,
}: {
  label: string;
  summary: string;
  hint?: string;
  editing: boolean;
  options: T[];
  getLabel?: (option: T) => string;
  isSelected: (option: T) => boolean;
  onSelect: (option: T) => void;
  last?: boolean;
}) {
  const theme = useTheme();

  if (!editing) {
    return (
      <Row last={last}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="small" style={styles.rowValue}>
          {summary || '—'}
        </ThemedText>
      </Row>
    );
  }

  return (
    <Row last={last} style={styles.editRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = isSelected(option);
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: selected ? theme.accent : theme.background },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="small" style={selected && styles.chipTextSelected}>
                {getLabel(option)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {hint}
        </ThemedText>
      )}
    </Row>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Row last={last}>
      <View style={styles.rowText}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {hint}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
      />
    </Row>
  );
}

function LinkRow({
  icon,
  label,
  danger,
  onPress,
  last,
}: {
  icon: SymbolName;
  label: string;
  danger?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Row last={last}>
        <SymbolView name={icon} size={18} tintColor={color} />
        <ThemedText type="small" style={[styles.rowText, { color }]}>
          {label}
        </ThemedText>
        {!danger && (
          <SymbolView
            name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
            size={14}
            tintColor={theme.textSecondary}
          />
        )}
      </Row>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.accent : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={primary && styles.buttonTextPrimary}>
        {label}
      </ThemedText>
    </Pressable>
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
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatarText: {
    color: '#ffffff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderWidth: 1,
    borderRadius: Spacing.four,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 24,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  editRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowValue: {
    flexShrink: 1,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  editActions: {
    gap: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.three,
    alignSelf: 'stretch',
  },
  buttonTextPrimary: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
