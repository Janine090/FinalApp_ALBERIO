import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type FadeInProps = PropsWithChildren<{
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}>;

export default function FadeIn({
  children,
  delay = 0,
  distance = 14,
  style,
}: FadeInProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [delay, progress]);

  const animatedStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [distance, 0],
        }),
      },
    ],
  } as const;

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
