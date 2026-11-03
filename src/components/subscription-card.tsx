import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatShekels } from '@/components/payment-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  getPlan,
  SUBSCRIPTION_PLANS,
  useCurrentUserActions,
  type CurrentUser,
  type SubscriptionPlan,
} from '@/hooks/use-current-user';
import { useStudents } from '@/hooks/use-students';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/utils/dialogs';

/** From this share of the plan's students the teacher is told they are close to the limit. */
const NEAR_LIMIT_RATIO = 0.8;

function formatDate(date: Date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getUsage(studentCount: number, plan: SubscriptionPlan): {
  color: ThemeColor;
  message: string;
} {
  const left = plan.maxStudents - studentCount;
  if (left <= 0) {
    return { color: 'danger', message: 'הגעתם למכסת התלמידים. שדרגו מסלול כדי להוסיף תלמידים.' };
  }
  if (studentCount >= plan.maxStudents * NEAR_LIMIT_RATIO) {
    return { color: 'slotPending', message: `נותרו ${left} מקומות בלבד במסלול.` };
  }
  return { color: 'accent', message: `ניתן להוסיף עוד ${left} תלמידים.` };
}

/** The teacher's monthly plan: what it costs, how many students it allows, and changing it. */
export function SubscriptionCard({ user }: { user: CurrentUser }) {
  const theme = useTheme();
  const studentCount = useStudents().length;
  const { updateUser } = useCurrentUserActions();
  const [choosing, setChoosing] = useState(false);
  const plan = getPlan(user.subscription.planId);
  const usage = getUsage(studentCount, plan);
  const fill = Math.min(studentCount / plan.maxStudents, 1);

  const choosePlan = (next: SubscriptionPlan) => {
    const upgrade = next.monthlyPrice > plan.monthlyPrice;
    confirmAction(
      upgrade ? 'שדרוג מסלול' : 'מעבר מסלול',
      `לעבור למסלול ${next.name} – עד ${next.maxStudents} תלמידים ב־${formatShekels(next.monthlyPrice)} לחודש? המחיר החדש ייגבה בחיוב הבא.`,
      'מעבר למסלול',
      () => {
        updateUser({ subscription: { ...user.subscription, planId: next.id } });
        setChoosing(false);
      },
      { destructive: false }
    );
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.planHeader}>
        <View style={styles.planTitle}>
          <ThemedText type="small" themeColor="textSecondary">
            המסלול שלי
          </ThemedText>
          <ThemedText type="smallBold" style={styles.planName}>
            {plan.name}
          </ThemedText>
        </View>
        <View style={[styles.activeBadge, { backgroundColor: theme.slotAvailable }]}>
          <ThemedText type="smallBold" style={styles.whiteText}>
            פעיל
          </ThemedText>
        </View>
      </View>

      <ThemedText type="subtitle">
        {formatShekels(plan.monthlyPrice)}
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          לחודש · עד {plan.maxStudents} תלמידים
        </ThemedText>
      </ThemedText>

      <View style={styles.usage}>
        <View style={styles.usageLabels}>
          <ThemedText type="small">תלמידים במסלול</ThemedText>
          <ThemedText type="smallBold">
            {studentCount} / {plan.maxStudents}
          </ThemedText>
        </View>
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.trackFill,
              { width: `${fill * 100}%`, backgroundColor: theme[usage.color] },
            ]}
          />
        </View>
        <ThemedText
          type="small"
          themeColor={usage.color === 'accent' ? 'textSecondary' : usage.color === 'danger' ? 'danger' : 'text'}>
          {usage.message}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        החיוב הבא: {formatDate(user.subscription.renewsAt)} · {formatShekels(plan.monthlyPrice)}
      </ThemedText>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setChoosing((current) => !current)}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: choosing ? theme.backgroundSelected : theme.accent },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={!choosing && styles.whiteText}>
            {choosing ? 'סגירה' : 'שינוי מסלול'}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => showMessage('אמצעי תשלום', 'ניהול אמצעי התשלום יהיה זמין בקרוב.')}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.background },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">אמצעי תשלום</ThemedText>
        </Pressable>
      </View>

      {choosing && (
        <View style={styles.plans}>
          {SUBSCRIPTION_PLANS.map((option) => (
            <PlanOption
              key={option.id}
              plan={option}
              current={option.id === plan.id}
              tooSmall={option.maxStudents < studentCount}
              onPress={() => choosePlan(option)}
            />
          ))}
        </View>
      )}
    </ThemedView>
  );
}

function PlanOption({
  plan,
  current,
  tooSmall,
  onPress,
}: {
  plan: SubscriptionPlan;
  current: boolean;
  /** The teacher already has more students than this plan allows. */
  tooSmall: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const disabled = current || tooSmall;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: theme.background,
          borderColor: current ? theme.accent : theme.backgroundSelected,
        },
        tooSmall && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={styles.optionText}>
        <ThemedText type="smallBold">{plan.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {current
            ? 'המסלול הנוכחי'
            : tooSmall
              ? `יש לכם יותר מ־${plan.maxStudents} תלמידים`
              : `עד ${plan.maxStudents} תלמידים`}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor={current ? 'accent' : 'text'}>
        {formatShekels(plan.monthlyPrice)}
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          / חודש
        </ThemedText>
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: {
    gap: Spacing.half,
  },
  planName: {
    fontSize: 18,
    lineHeight: 24,
  },
  activeBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.three,
  },
  whiteText: {
    color: '#ffffff',
  },
  usage: {
    gap: Spacing.one,
  },
  usageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  plans: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Spacing.three,
  },
  optionText: {
    flex: 1,
    gap: Spacing.half,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
