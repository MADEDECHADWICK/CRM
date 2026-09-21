// apps/mobile/src/components/charts/StageBarChart.tsx
//
// A column chart of opportunities per pipeline stage, drawn with
// victory-native + RN Skia. Bars get a rounded cap, an animated entrance,
// and a colored legend below (the legend doubles as the axis reference).

import { tokens } from "@crm/core";
import { Bar, CartesianChart } from "victory-native";
import { StyleSheet, Text, View } from "react-native";

export type StageBarDatum = {
  key: string;
  label: string;
  count: number;
  color: string;
};

type StageBarChartProps = {
  data: StageBarDatum[];
};

export function StageBarChart({ data }: StageBarChartProps) {
  const visible = data.filter((item) => item.count > 0);

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No deals in the pipeline yet.</Text>
      </View>
    );
  }

  const maxCount = Math.max(...visible.map((item) => item.count));

  return (
    <View>
      <View style={styles.plot}>
        <CartesianChart
          data={visible.map((item) => ({
            label: item.label,
            count: item.count,
          }))}
          xKey="label"
          yKeys={["count"]}
          domain={{ y: [0, Math.max(1, maxCount * 1.3)] }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.count}
              chartBounds={chartBounds}
              color={tokens.color.brand}
              roundedCorners={{ topLeft: 6, topRight: 6 }}
              innerPadding={0.26}
              animate={{ type: "timing", duration: 650 }}
            />
          )}
        </CartesianChart>
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
    height: 200,
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