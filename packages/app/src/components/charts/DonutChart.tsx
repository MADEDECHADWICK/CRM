// packages/app/src/components/charts/DonutChart.tsx
//
// An interactive donut. Tapping a legend row focuses that slice and dims the
// rest; the centre shows the running total.
//
// The ring is drawn with react-native-svg because an annular sector genuinely
// needs arc geometry. This replaced victory-native + Skia, which has no browser
// support — react-native-svg renders to native canvas on a phone and to plain
// SVG in a browser, so both platforms now produce the same ring from the same
// numbers with no platform branch in this file.

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { tokens } from "@crm/core";

export type DonutDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Optional secondary line, e.g. KES value for that stage. */
  meta?: string;
};

type DonutChartProps = {
  data: DonutDatum[];
  centerValue: string;
  centerCaption: string;
  valueFormatter?: (value: number) => string;
};

const SIZE = 210;
const PADDING = 2;

// Matches the innerRadius="72%" the Skia version asked for.
const INNER_RATIO = 0.72;

const DIMMED_OPACITY = 0.3;
const TAU = Math.PI * 2;

function pointOn(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * Builds the path for one annular sector, starting at 12 o'clock and sweeping
 * clockwise.
 *
 * A single arc command cannot span more than half a turn, so anything wider is
 * split in half and the pieces concatenated. That recursion is also what makes
 * the degenerate case work: one slice holding 100% of the value would otherwise
 * ask for an arc from a point back to itself, which renders as nothing at all —
 * a lone deal in the pipeline drawing an empty ring.
 */
function sectorPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const sweep = endAngle - startAngle;

  if (sweep <= 0) return "";

  if (sweep >= TAU - 1e-6) {
    const half = startAngle + Math.PI;

    return `${sectorPath(cx, cy, outerRadius, innerRadius, startAngle, half)} ${sectorPath(
      cx,
      cy,
      outerRadius,
      innerRadius,
      half,
      startAngle + TAU
    )}`;
  }

  if (sweep > Math.PI) {
    const mid = startAngle + Math.PI;

    return `${sectorPath(cx, cy, outerRadius, innerRadius, startAngle, mid)} ${sectorPath(
      cx,
      cy,
      outerRadius,
      innerRadius,
      mid,
      endAngle
    )}`;
  }

  const outerStart = pointOn(cx, cy, outerRadius, startAngle);
  const outerEnd = pointOn(cx, cy, outerRadius, endAngle);
  const innerEnd = pointOn(cx, cy, innerRadius, endAngle);
  const innerStart = pointOn(cx, cy, innerRadius, startAngle);

  // sweep-flag 1 draws the outer arc clockwise; the inner arc runs back with 0
  // so the ring does not fill in solid.
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

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

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerRadius = SIZE / 2 - PADDING;
  const innerRadius = outerRadius * INNER_RATIO;

  let cursor = -Math.PI / 2;

  const slices = visible.map((item) => {
    const sweep = total > 0 ? (item.value / total) * TAU : 0;
    const path = sectorPath(
      cx,
      cy,
      outerRadius,
      innerRadius,
      cursor,
      cursor + sweep
    );

    cursor += sweep;

    return {
      key: item.key,
      color: item.color,
      label: item.label,
      path,
    };
  });

  return (
    <View>
      <View style={styles.chart}>
        <Svg width={SIZE} height={SIZE}>
          {slices.map((slice) => (
            <Path
              key={slice.key}
              d={slice.path}
              fill={slice.color}
              opacity={
                activeKey && slice.label !== activeKey ? DIMMED_OPACITY : 1
              }
            />
          ))}
        </Svg>

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
              <View style={styles.legendLabelWrap}>
                <Text style={styles.legendLabel}>{item.label}</Text>
                {item.meta ? <Text style={styles.legendMeta}>{item.meta}</Text> : null}
              </View>
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
  chart: {
    width: SIZE,
    height: SIZE,
    alignSelf: "center",
    position: "relative",
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

  legendLabelWrap: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    ...tokens.type.caption,
    color: tokens.color.ink,
  },
  legendMeta: {
    ...tokens.type.micro,
    letterSpacing: 0,
    color: tokens.color.inkMuted,
    marginTop: 2,
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