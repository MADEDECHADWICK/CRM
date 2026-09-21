// apps/mobile/src/components/charts/pipeline.ts
//
// Shared helpers to turn opportunities into the shape the chart components
// expect, plus the canonical stage ordering used across the mobile app.

import {
  STAGE_COLORS,
  STAGE_LABELS,
  type Opportunity,
  type Stage,
} from "@crm/core";

import type { DonutDatum } from "./DonutChart";
import type { StageBarDatum } from "./StageBarChart";

export const PIPELINE_ORDER: readonly Stage[] = [
  "PROSPECT",
  "LEAD",
  "PROPOSAL",
  "WON",
  "LOST",
  "NO_REPLY",
  "DEFERRED",
];

export type PipelineCount = { stage: Stage; count: number };

export function countByStage(opportunities: Opportunity[]): PipelineCount[] {
  return PIPELINE_ORDER.map((stage) => ({
    stage,
    count: opportunities.filter((item) => item.stage === stage).length,
  }));
}

export function pipelineDonut(counts: PipelineCount[]): DonutDatum[] {
  return counts.map(({ stage, count }) => ({
    key: stage,
    label: STAGE_LABELS[stage],
    value: count,
    color: STAGE_COLORS[stage].dot,
  }));
}

export function pipelineBar(counts: PipelineCount[]): StageBarDatum[] {
  return counts.map(({ stage, count }) => ({
    key: stage,
    label: STAGE_LABELS[stage],
    count,
    color: STAGE_COLORS[stage].dot,
  }));
}