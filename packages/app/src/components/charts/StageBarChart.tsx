// packages/app/src/components/charts/StageBarChart.tsx
//
// A column chart of opportunities per pipeline stage.
//
// Drawn with plain React Native views rather than SVG. A bar is a rectangle, so
// SVG buys nothing here — and an Animated.View can grow its height on the
// native driver, whereas an SVG <Rect> height attribute would force the
// animation onto the JS thread. This used to be victory-native + Skia, which
// cannot run in a browser; the appearance and the numbers are unchanged, and
// because this file has no platform-specific branch the phone and the web app
// draw it identically.

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { tokens } from "@crm/core";

export type StageBarDatum = {
  key: string;
  label: string;
  count: number;
  color: string;
};

type StageBarChartProps = {
  data: StageBarDatum[];
};

const PLOT_HEIGHT = 200;

// Bars fill this fraction of their slot. The old chart asked victory-native for
// innerPadding={0.26}, which reads as a bar occupying roughly 60% of the slot.
const BAR_RATIO = 0.62;

const DURATION_MS = 650;

export function StageBarChart({ data }: StageBarChartProps) {
  const grow = useRef(new Animated.Value(0)).current;

  const visible = data.filter((item) => item.count > 0);

  // Declared before the empty-state return so the hook order stays stable when
  // a filter empties the chart mid-session.
  useEffect(() => {
    grow.setValue(0);

    const animation = Animated.timing(grow, {
      toValue: 1,
      duration: DURATION_MS,
      // Height is a layout property, so this cannot run on the native driver.
      useNativeDriver: false,
    });

    animation.start();

    return () => animation.stop();
  }, [grow, data]);

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No deals in the pipeline yet.</Text>
      </View>
    );
  }

  const maxCount = Math.max(...visible.map((item) => item.count));

  // Same headroom the old domain asked for, so the tallest bar does not touch
  // the top of the plot.
  const domainMax = Math.max(1, maxCount * 1.3);
  const slotPercent = 100 / visible.length;

  return (
    <View>
      <View style={styles.plot}>
        {visible.map((item) => {
          const targetHeight = (item.count / domainMax) * PLOT_HEIGHT;

          return (
            <View
              key={item.key}
              style={[styles.slot, { width: `${slotPercent}%` }]}
            >
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: grow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, targetHeight],
                    }),
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        {visible.map((item) => (
          <View key={item.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>
              {item.label} · {item.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    height: PLOT_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
  },

  slot: {
    height: PLOT_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
  },

  bar: {
    width: `${BAR_RATIO * 100}%`,
    minHeight: 2,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: tokens.color.brand,
  },

  empty: {
    paddingVertical: 34,
    alignItems: "center",
  },

  emptyText: {
    ...tokens.type.caption,
    color: tokens.color.inkMuted,
  },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  legendText: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkMuted,
  },
});