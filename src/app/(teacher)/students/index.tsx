import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaymentBadge } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { TRANSMISSION_LABELS, useStudents, type Student } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';

/** Matches a name, or a phone number with or without dashes. */
function matchesSearch(student: Student, query: string) {
  const q = query.trim();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    student.name.includes(q) ||
    (digits.length > 0 && student.phone.replace(/\D/g, '').includes(digits))
  );
}

export default function StudentsScreen() {
  const theme = useTheme();
  const students = useStudents();
  const [query, setQuery] = useState('');
  const results = students.filter((student) => matchesSearch(student, query));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">רשימת תלמידים</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {students.length} תלמידים
          </ThemedText>
        </View>

        {students.length > 0 && (
          <ThemedView type="backgroundElement" style={styles.search}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              size={18}
              tintColor={theme.textSecondary}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חיפוש לפי שם או טלפון"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.text }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={12}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                  size={18}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            )}
          </ThemedView>
        )}

        <FlatList
          data={results}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(student) => student.id}
          renderItem={({ item }) => <StudentRow student={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="small" themeColor="textSecondary">
                {students.length === 0
                  ? 'אין עדיין תלמידים. הוסיפו תלמיד דרך כפתור ה־+.'
                  : `לא נמצאו תלמידים עבור "${query.trim()}"`}
              </ThemedText>
            </ThemedView>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function StudentRow({ student }: { student: Student }) {
  return (
    <Link href={{ pathname: '/students/[id]', params: { id: student.id } }} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="smallBold">{student.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              דרגה {student.licenseCategory} · {TRANSMISSION_LABELS[student.transmission]} ·{' '}
              {student.lessonsCompleted} שיעורים
            </ThemedText>
          </View>
          <PaymentBadge balance={student.balance} />
        </ThemedView>
      </Pressable>
    </Link>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.half,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },
});
