// apps/mobile/src/components/charts/DonutChart.tsx
//
// An interactive donut built on victory-native + RN Skia. Tapping a legend
// row focuses that slice (others dim); the center shows the running total.

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Pie, PolarChart } from "victory-native";

import { tokens } from "@crm/core";

export type DonutDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  data: DonutDatum[];
  centerValue: string;
  centerCaption: string;
  valueFormatter?: (value: number) => string;
};

export function DonutChart({
  data,
  centerValue,
  centerCaption,
  valueFormatter,
}: DonutChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const visible = data.filter((item) => item.value > 0);

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nothing to chart here yet.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.chartWrap}>
        <PolarChart
          data={visible.map((item) => ({ ...item }))}
          labelKey="label"
          valueKey="value"
          colorKey="color"
          containerStyle={styles.chart}
        >
          <Pie.Chart innerRadius="72%">
            {({ slice }) => (
              <Pie.Slice
                opacity={activeKey && slice.label !== activeKey ? 0.3 : 1}
                animate={{ type: "timing", duration: 650 }}
              />
            )}
          </Pie.Chart>
        </PolarChart>

        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerCaption}>{centerCaption}</Text>
          <Text style={styles.centerValue}>{centerValue}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {data.map((item) => {
          const active = activeKey === item.key;
          const share =
            total > 0 ? Math.round((item.value / total) * 100) : 0;

          return (
            <Pressable
              key={item.key}
              onPress={() => setActiveKey(active ? null : item.key)}
              style={({ pressed }) => [
                styles.legendRow,
                active && styles.legendRowActive,
                pressed && styles.legendRowPressed,
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: item.color }]}
              />
              <Text style={styles.legendLabel}>{item.label}</Text>
              <Text style={styles.legendValue}>
                {valueFormatter
                  ? valueFormatter(item.value)
                  : String(item.value)}
              </Text>
              <Text style={styles.legendShare}>{share}%</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    position: "relative",
  },

  chart: {
    width: "100%",
    height: 210,
  },

  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  centerCaption: {
    ...tokens.type.micro,
    letterSpacing: 0,
    textTransform: "uppercase",
    color: tokens.color.inkFaint,
    marginBottom: 2,
  },

  centerValue: {
    ...tokens.type.h2,
    color: tokens.color.ink,
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
    marginTop: 6,
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
  },

  legendRowActive: {
    backgroundColor: tokens.color.brandFaint,
  },

  legendRowPressed: {
    backgroundColor: tokens.color.surfacePressed,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendLabel: {
    flex: 1,
    ...tokens.type.caption,
    color: tokens.color.ink,
  },

  legendValue: {
    ...tokens.type.bodyStrong,
    color: tokens.color.ink,
  },

  legendShare: {
    ...tokens.type.micro,
    letterSpacing: 0,
    fontWeight: "700",
    color: tokens.color.inkFaint,
    minWidth: 40,
    textAlign: "right",
  },
});