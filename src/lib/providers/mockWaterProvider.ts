// src/lib/providers/mockWaterProvider.ts
import type { WaterReading } from "@/lib/water";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 正常が多く、たまに注意、まれに危険になる疑似水量生成
 */
export class MockWaterProvider {
  private upstream: number;
  private downstream: number;

  // 異常状態の持続カウンタ
  private anomalyCount = 0;
  private anomalyType: "warn" | "danger" | null = null;

  constructor(
    private upstreamBase: number,
    private downstreamBase: number,
    private jitter: number
  ) {
    this.upstream = upstreamBase;
    this.downstream = downstreamBase;
  }

  next(): WaterReading {
    /* ===== 1. 状態遷移（異常を続けるか、新しく起こすか） ===== */
    if (this.anomalyCount > 0) {
      this.anomalyCount--;
      if (this.anomalyCount === 0) {
        this.anomalyType = null;
      }
    } else {
      const r = Math.random();

      if (r < 0.02) {
        // 危険：2%
        this.anomalyType = "danger";
        this.anomalyCount = 3 + Math.floor(Math.random() * 3); // 3〜5回続く
      } else if (r < 0.12) {
        // 注意：10%
        this.anomalyType = "warn";
        this.anomalyCount = 2 + Math.floor(Math.random() * 3); // 2〜4回
      } else {
        // 正常：88%
        this.anomalyType = null;
      }
    }

    /* ===== 2. 上流は安定して揺れる ===== */
    const pullU = (this.upstreamBase - this.upstream) * 0.05;
    const stepU = (Math.random() - 0.5) * this.jitter;
    this.upstream += pullU + stepU;

    /* ===== 3. 下流は状態によって変える ===== */
    const pullD = (this.downstreamBase - this.downstream) * 0.05;
    let stepD = (Math.random() - 0.5) * this.jitter;

    if (this.anomalyType === "warn") {
      stepD -= this.jitter * 0.8; // 少し下がる
    }

    if (this.anomalyType === "danger") {
      stepD -= this.jitter * 2.0; // 大きく下がる
    }

    this.downstream += pullD + stepD;

    /* ===== 4. 範囲制限 ===== */
    this.upstream = clamp(this.upstream, 0, 9999);
    this.downstream = clamp(this.downstream, 0, 9999);

    return {
      upstream: this.upstream,
      downstream: this.downstream,
      ts: Date.now(),
    };
  }
}
