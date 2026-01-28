// src/lib/providers/mockWaterProvider.ts
import type { WaterReading } from "@/lib/water";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 発表用の「見せ方」を作れる疑似水量生成
 *
 * シナリオ（デフォルト）:
 *  - 最初の equalRows 回は downstream = upstream（差分0で正常を見せる）
 *  - 次の rampRows 回は downstream を少しずつ下げていき差分を増やす（注意→危険の流れ）
 *  - それ以降は従来の「ほぼ正常、たまに注意、まれに危険」のランダム挙動
 */
export class MockWaterProvider {
  private upstream: number;
  private downstream: number;

  // 従来の異常状態の持続カウンタ（ランダム用）
  private anomalyCount = 0;
  private anomalyType: "warn" | "danger" | null = null;

  // シナリオ用
  private tick = 0;
  private equalRows: number;
  private rampRows: number;
  private rampStep: number; // 1ステップでどれだけ下流を下げるか（L/min）

  constructor(
    private upstreamBase: number,
    private downstreamBase: number,
    private jitter: number,
    opts?: {
      equalRows?: number; // 最初に差分0を何行出すか
      rampRows?: number;  // その後に差分を増やすフェーズを何行続けるか
      rampStep?: number;  // 1行ごとに下流をどれだけ下げるか（L/min）
    }
  ) {
    this.upstream = upstreamBase;
    this.downstream = downstreamBase;

    // ✅ 発表向けデフォルト
    this.equalRows = opts?.equalRows ?? 4;   // 3〜4行にしたいならここを 3 にしてもOK
    this.rampRows = opts?.rampRows ?? 10;    // 差分が増える“演出”の長さ
    this.rampStep = opts?.rampStep ?? 0.9;   // 0.5〜1.5くらいが見やすい
  }

  next(): WaterReading {
    this.tick++;

    /* ===== 1. 上流は安定して揺れる ===== */
    const pullU = (this.upstreamBase - this.upstream) * 0.05;
    const stepU = (Math.random() - 0.5) * this.jitter;
    this.upstream += pullU + stepU;

    // 範囲制限（上流）
    this.upstream = clamp(this.upstream, 0, 9999);

    /* ===== 2. 発表用シナリオフェーズ ===== */
    // (A) 最初は下流=上流（差分0）
    if (this.tick <= this.equalRows) {
      this.anomalyType = null;
      this.anomalyCount = 0;
      this.downstream = this.upstream; // ✅ 完全一致
      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    // (B) 次は徐々に下流を下げて差分を作る（見せ場）
    const rampEnd = this.equalRows + this.rampRows;
    if (this.tick <= rampEnd) {
      this.anomalyType = null;
      this.anomalyCount = 0;

      const k = this.tick - this.equalRows; // 1,2,3...
      // downstream = upstream - (k * rampStep) （必要なら微小ノイズを足してもいい）
      this.downstream = this.upstream - k * this.rampStep;

      this.downstream = clamp(this.downstream, 0, 9999);
      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    /* ===== 3. それ以降は従来通り（ランダム） ===== */
    if (this.anomalyCount > 0) {
      this.anomalyCount--;
      if (this.anomalyCount === 0) this.anomalyType = null;
    } else {
      const r = Math.random();
      if (r < 0.02) {
        this.anomalyType = "danger";
        this.anomalyCount = 3 + Math.floor(Math.random() * 3); // 3〜5回
      } else if (r < 0.12) {
        this.anomalyType = "warn";
        this.anomalyCount = 2 + Math.floor(Math.random() * 3); // 2〜4回
      } else {
        this.anomalyType = null;
      }
    }

    const pullD = (this.downstreamBase - this.downstream) * 0.05;
    let stepD = (Math.random() - 0.5) * this.jitter;

    if (this.anomalyType === "warn") stepD -= this.jitter * 0.8;
    if (this.anomalyType === "danger") stepD -= this.jitter * 2.0;

    this.downstream += pullD + stepD;
    this.downstream = clamp(this.downstream, 0, 9999);

    return {
      upstream: this.upstream,
      downstream: this.downstream,
      ts: Date.now(),
    };
  }
}
