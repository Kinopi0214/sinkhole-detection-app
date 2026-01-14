// src/lib/water.ts
export type WaterReading = {
  upstream: number;
  downstream: number;
  ts: number; // epoch ms
};

export type RiskLevel = "safe" | "warn" | "danger";

export function calcDiff(reading: WaterReading) {
  return reading.upstream - reading.downstream;
}

export function judgeRisk(diff: number, warnDiff: number, dangerDiff: number): RiskLevel {
  if (diff >= dangerDiff) return "danger";
  if (diff >= warnDiff) return "warn";
  return "safe";
}
