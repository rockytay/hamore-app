import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatTypedDate, parseTypedDate } from '@/hooks/student-file';
import { useTheme } from '@/hooks/use-theme';

/** Form controls shared by the student file screens (teacher and student). */

export function FieldLabel({ children }: { children: ReactNode }) {
  return <ThemedText type="small">{children}</ThemedText>;
}

export function FieldHint({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <ThemedText type="small" themeColor={danger ? 'danger' : 'textSecondary'} style={styles.hint}>
      {children}
    </ThemedText>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
  error,
  hint,
  autoCapitalize,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  error?: string | null;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences';
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: error ? theme.danger : 'transparent',
          },
        ]}
      />
      {error ? <FieldHint danger>{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </View>
  );
}

/**
 * A date typed as DD/MM/YYYY. Calls onChange with the date once it is complete and real,
 * and with null when the field is cleared.
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label?: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  hint?: string;
  error?: string | null;
}) {
  const [text, setText] = useState(formatTypedDate(value));
  const invalid = text.trim() !== '' && parseTypedDate(text) === null;

  const change = (next: string) => {
    // Digits and separators only; add the slashes while typing.
    let cleaned = next.replace(/[^\d/.-]/g, '');
    if (/^\d{2}$/.test(cleaned) && text.length < cleaned.length) cleaned += '/';
    if (/^\d{1,2}\/\d{2}$/.test(cleaned) && text.length < cleaned.length) cleaned += '/';
    setText(cleaned.slice(0, 10));
    if (cleaned.trim() === '') onChange(null);
    else {
      const date = parseTypedDate(cleaned);
      if (date) onChange(date);
    }
  };

  return (
    <TextField
      label={label}
      value={text}
      onChange={change}
      placeholder="DD/MM/YYYY"
      keyboardType="numbers-and-punctuation"
      error={error ?? (invalid ? 'תאריך לא תקין (DD/MM/YYYY)' : null)}
      hint={hint}
    />
  );
}

/** One choice out of a few, as chips. With allowNone, tapping the selected chip clears it. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  allowNone = false,
  surface = 'background',
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowNone?: boolean;
  /** The color of unselected chips: use backgroundElement on a plain screen background. */
  surface?: 'background' | 'backgroundElement';
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected && allowNone ? null : option.value)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: selected ? theme.accent : theme[surface] },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" style={selected ? styles.white : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Record<value, label> → chip options. */
export function optionsOf<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <ThemedText type="small">{label}</ThemedText>
        {hint && <FieldHint>{hint}</FieldHint>}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
      />
    </View>
  );
}

/** A label and a value on one line, e.g. in a details card. */
export function InfoRow({
  label,
  value,
  onPress,
  danger,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const content = (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor={danger ? 'danger' : onPress ? 'accent' : 'text'}
        style={styles.infoValue}>
        {value || '—'}
      </ThemedText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

/** A small text button, e.g. "עריכה" next to a section title. */
export function LinkButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedText type="smallBold" themeColor={danger ? 'danger' : 'accent'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
});

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  input: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    fontSize: 14,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
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
  white: {
    color: '#ffffff',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: Spacing.half,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.half,
  },
  infoValue: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
