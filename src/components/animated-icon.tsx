import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 600;
const LOGO = require('@/assets/images/hamore-logo.png');

/** Light blue from the Hamore logo; also the native splash background in app.json. */
const LOGO_BACKGROUND = '#5CD3F2';

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
  });

  const image = <Image style={styles.splashImage} source={LOGO} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0.6 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 0.6 }],
    opacity: 0,
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
});

export function AnimatedIcon() {
  return (
    <Animated.View entering={logoKeyframe.duration(DURATION)} style={styles.iconContainer}>
      <Image style={styles.icon} source={LOGO} />
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
  splashImage: {
    width: 120,
    height: 120,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: LOGO_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
