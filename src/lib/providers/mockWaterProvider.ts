// src/lib/providers/mockWaterProvider.ts
import type { WaterReading } from "@/lib/water";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 発表用の「見せ方」を作れる疑似水量生成
 *
 * シナリオ:
 *  - 最初の equalRows 回は downstream = upstream（差分0で正常を見せる）
 *    ※equalRowsは未指定ならアクセスごとに2 or 3をランダム（→3行目or4行目から差分）
 *  - 次の rampRows 回は downstream を少しずつ下げていき差分を増やす
 *  - それ以降はランダム挙動（必要ならOFFにもできる）
 */
export class MockWaterProvider {
  private upstream: number;
  private downstream: number;

  // ランダム異常用
  private anomalyCount = 0;
  private anomalyType: "warn" | "danger" | null = null;

  // シナリオ用
  private tick = 0;
  private equalRows: number;
  private rampRows: number;
  private rampStep: number; // 1行ごとに下流を下げる量（L/min）

  constructor(
    private upstreamBase: number,
    private downstreamBase: number,
    private jitter: number,
    opts?: {
      equalRows?: number; // 最初に差分0を何行出すか
      rampRows?: number;  // 差分を増やすフェーズ行数
      rampStep?: number;  // 1行ごとの下流低下量（L/min）
      equalRowsProb3?: number; // 3行目から差分にする確率（equalRows=2）
    }
  ) {
    this.upstream = upstreamBase;
    this.downstream = downstreamBase;

    // ✅ ここが今回のポイント：アクセスごとに 3行目 or 4行目 から差分が出る
    // equalRows=2 -> 3行目から差分
    // equalRows=3 -> 4行目から差分
    const p3 = opts?.equalRowsProb3 ?? 0.5; // 3行目から差分にする確率
    const randomEqualRows = Math.random() < p3 ? 2 : 3;

    this.equalRows = opts?.equalRows ?? randomEqualRows;

    // ✅ 発表向けデフォルト（必要に応じて調整）
    this.rampRows = opts?.rampRows ?? 10;

    // ✅ ばらつきを抑えたい場合はここを小さめに（例: 0.4〜0.8）
    this.rampStep = opts?.rampStep ?? 0.8;
  }

  next(): WaterReading {
    this.tick++;

    /* ===== 1. 上流は安定して揺れる（ここを抑えると全体が滑らかになる） ===== */
    const pullU = (this.upstreamBase - this.upstream) * 0.06; // 復元の強さ（大きいほどベースに戻る）
    const stepU = (Math.random() - 0.5) * this.jitter;        // ランダム揺れ（jitterが効く）
    this.upstream += pullU + stepU;
    this.upstream = clamp(this.upstream, 0, 9999);

    /* ===== 2. 発表用シナリオフェーズ ===== */

    // (A) 最初は下流=上流（差分0）
    if (this.tick <= this.equalRows) {
      this.anomalyType = null;
      this.anomalyCount = 0;
      this.downstream = this.upstream; // 完全一致
      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    // (B) 徐々に下流を下げて差分を作る（見せ場）
    const rampEnd = this.equalRows + this.rampRows;
    if (this.tick <= rampEnd) {
      this.anomalyType = null;
      this.anomalyCount = 0;

      const k = this.tick - this.equalRows; // 1,2,3...
      // downstream = upstream - (k * rampStep) + 小さいノイズ（自然さだけ少し）
      const tinyNoise = (Math.random() - 0.5) * (this.jitter * 0.15); // 小さめ
      this.downstream = this.upstream - k * this.rampStep + tinyNoise;

      this.downstream = clamp(this.downstream, 0, 9999);
      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    /* ===== 3. それ以降（ランダム挙動） =====
       発表で「差が大きくなりすぎる」のが嫌なら、
       下の確率(0.02/0.12)を下げる or 係数を小さくしてください。
    */
    if (this.anomalyCount > 0) {
      this.anomalyCount--;
      if (this.anomalyCount === 0) this.anomalyType = null;
    } else {
      const r = Math.random();
      if (r < 0.01) {
        this.anomalyType = "danger";
        this.anomalyCount = 3;
      } else if (r < 0.06) {
        this.anomalyType = "warn";
        this.anomalyCount = 2;
      } else {
        this.anomalyType = null;
      }
    }

    const pullD = (this.downstreamBase - this.downstream) * 0.06;
    let stepD = (Math.random() - 0.5) * this.jitter;

    // ✅ ばらつきを抑えたいので “引き下げ量” を控えめに
    if (this.anomalyType === "warn") stepD -= this.jitter * 0.5;
    if (this.anomalyType === "danger") stepD -= this.jitter * 1.2;

    this.downstream += pullD + stepD;
    this.downstream = clamp(this.downstream, 0, 9999);

    return {
      upstream: this.upstream,
      downstream: this.downstream,
      ts: Date.now(),
    };
  }
}
