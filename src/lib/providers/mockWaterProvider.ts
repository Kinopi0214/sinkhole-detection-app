// src/lib/providers/mockWaterProvider.ts
import type { WaterReading } from "@/lib/water";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class MockWaterProvider {
  private upstream: number;
  private downstream: number;

  private tick = 0;

  private equalRows: number;
  private rampRows: number;
  private rampStep: number;

  constructor(
    private upstreamBase: number,
    private downstreamBase: number,
    private jitter: number,
    opts?: {
      equalRowsProb3?: number;
      rampRows?: number;
      rampStep?: number;
    }
  ) {
    this.upstream = upstreamBase;
    this.downstream = downstreamBase;

    const p3 = opts?.equalRowsProb3 ?? 0.5;
    this.equalRows = Math.random() < p3 ? 2 : 3; // 3行目 or 4行目から差分

    this.rampRows = opts?.rampRows ?? 10;
    this.rampStep = opts?.rampStep ?? 0.6;
  }

  next(): WaterReading {
    this.tick++;

    // 上流：小さく揺らす
    const pullU = (this.upstreamBase - this.upstream) * 0.05;
    const stepU = (Math.random() - 0.5) * this.jitter;
    this.upstream += pullU + stepU;
    this.upstream = clamp(this.upstream, 0, 9999);

    // ===== 差分0フェーズ =====
    if (this.tick <= this.equalRows) {
      this.downstream = this.upstream;
      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    // ===== 差分を徐々に増やすフェーズ =====
    const rampEnd = this.equalRows + this.rampRows;
    if (this.tick <= rampEnd) {
      const k = this.tick - this.equalRows;
      const tinyNoise = (Math.random() - 0.5) * this.jitter * 0.1;
      this.downstream = this.upstream - k * this.rampStep + tinyNoise;
      this.downstream = clamp(this.downstream, 0, 9999);

      return {
        upstream: this.upstream,
        downstream: this.downstream,
        ts: Date.now(),
      };
    }

    // ===== 以降は安定推移 =====
    const pullD = (this.downstreamBase - this.downstream) * 0.05;
    const stepD = (Math.random() - 0.5) * this.jitter;
    this.downstream += pullD + stepD;
    this.downstream = clamp(this.downstream, 0, 9999);

    return {
      upstream: this.upstream,
      downstream: this.downstream,
      ts: Date.now(),
    };
  }
}
