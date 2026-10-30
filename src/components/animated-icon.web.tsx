import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';

const DURATION = 300;

export function AnimatedSplashOverlay() {
  return null;
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

export function AnimatedIcon() {
  return (
    <Animated.View entering={logoKeyframe.duration(DURATION)} style={styles.iconContainer}>
      <Image style={styles.icon} source={require('@/assets/images/hamore-logo.png')} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 160,
    height: 160,
  },
  icon: {
    width: 160,
    height: 160,
  },
});
