// packages/ui/src/RagBadge.tsx
//
// Companion to Badge, for the proposal drafting clock rather than the
// pipeline stage. Deliberately a separate component: a row often needs BOTH
// signals ("Proposal" + "Due soon"), and collapsing them into one badge would
// force a priority decision on every call site.
//
// Renders nothing when there is no RAG value, so callers can drop it into a
// list row without guarding every time — the server omits `rag` on endpoints
// that have not been taught to compute it.

import React from "react";
import { View, Text } from "react-native";
import { RAG_COLORS, RAG_LABELS, type RagResult } from "@crm/core";

type RagBadgeProps = {
  rag?: RagResult | null;
  /** Appends the day count, e.g. "Due soon · 9d left". Off in dense lists. */
  showDays?: boolean;
};

function daySuffix(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue}d overdue`;
  }
  if (days === 0) return "today";
  return `${days}d left`;
}

export function RagBadge({ rag, showDays = false }: RagBadgeProps) {
  if (!rag) return null;

  const colors = RAG_COLORS[rag.status];
  const suffix = showDays ? daySuffix(rag.daysRemaining) : null;
  const text = suffix ? `${RAG_LABELS[rag.status]} · ${suffix}` : RAG_LABELS[rag.status];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.bg,
        alignSelf: "flex-start",
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.dot,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }}>
        {text}
      </Text>
    </View>
  );
}
