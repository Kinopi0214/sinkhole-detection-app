"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WaterDemo.module.css";

import { MockWaterProvider } from "@/lib/providers/mockWaterProvider";
import { calcDiff, judgeRisk, type RiskLevel, type WaterReading } from "@/lib/water";

type Row = WaterReading & {
  diff: number;
  risk: RiskLevel;
};

type RowWithTotal = Row & {
  totalDiffLmin: number; // 差分(L/min)を単純加算した累積
};

function numEnv(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function riskLabel(risk: RiskLevel) {
  return risk === "danger" ? "危険" : risk === "warn" ? "注意" : "正常";
}

function riskTone(risk: RiskLevel) {
  return risk === "danger" ? "danger" : risk === "warn" ? "warn" : "safe";
}

export default function WaterDemo() {
  const intervalMs = numEnv("NEXT_PUBLIC_WATER_INTERVAL_MS", 10000);
  const upstreamBase = numEnv("NEXT_PUBLIC_UPSTREAM_BASE", 120);
  const downstreamBase = numEnv("NEXT_PUBLIC_DOWNSTREAM_BASE", 117);
  const warnDiff = numEnv("NEXT_PUBLIC_RISK_WARN_DIFF", 3);
  const dangerDiff = numEnv("NEXT_PUBLIC_RISK_DANGER_DIFF", 8);
  const jitter = numEnv("NEXT_PUBLIC_WATER_JITTER", 3);

  const maxRows = 300;

  const provider = useMemo(
    () => new MockWaterProvider(upstreamBase, downstreamBase, jitter),
    [upstreamBase, downstreamBase, jitter]
  );

  const timerRef = useRef<number | null>(null);

  // 現在時刻（右上表示）
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [running, setRunning] = useState(true);

  const [rows, setRows] = useState<Row[]>(() => {
    const first = provider.next();
    const diff = calcDiff(first);
    const risk = judgeRisk(diff, warnDiff, dangerDiff);
    return [{ ...first, diff, risk }];
  });

  const appendOne = () => {
    const r = provider.next();
    const diff = calcDiff(r);
    const risk = judgeRisk(diff, warnDiff, dangerDiff);

    setRows((prev) => {
      const next = [...prev, { ...r, diff, risk }];
      if (next.length > maxRows) return next.slice(next.length - maxRows);
      return next;
    });
  };

  useEffect(() => {
    if (!running) return;

    timerRef.current = window.setInterval(() => {
      appendOne();
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, intervalMs]);

  // 差分(L/min)を単純累積
  const rowsWithTotalDiff: RowWithTotal[] = useMemo(() => {
    let acc = 0;
    return rows.map((cur) => {
      acc += cur.diff;
      return { ...cur, totalDiffLmin: acc };
    });
  }, [rows]);

  const latest = rowsWithTotalDiff.length
    ? rowsWithTotalDiff[rowsWithTotalDiff.length - 1]
    : null;

  const latestTone = latest ? riskTone(latest.risk) : "neutral";

  return (
    <div className={styles.page}>
      {/* 上部：カード領域 */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>疑似リアルタイム水量デモ（履歴）</div>
            <div className={styles.sub}>
              更新間隔: {intervalMs}ms ／ 閾値: 注意 ≥ {warnDiff} ／ 危険 ≥ {dangerDiff}
            </div>
          </div>
          <div className={styles.now}>現在時刻：{new Date(now).toLocaleString("ja-JP")}</div>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>上流（L/min）</div>
            <div className={styles.kpiValue}>{latest ? latest.upstream.toFixed(2) : "--"}</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>下流（L/min）</div>
            <div className={styles.kpiValue}>{latest ? latest.downstream.toFixed(2) : "--"}</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>差分（L/min）</div>
            <div className={styles.kpiValue}>{latest ? latest.diff.toFixed(2) : "--"}</div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>差分の総量（L/min）</div>
            <div className={styles.kpiValue}>{latest ? latest.totalDiffLmin.toFixed(2) : "--"}</div>
          </div>

          <div className={`${styles.kpiCard} ${styles[`kpiTone_${latestTone}`]}`}>
            <div className={styles.kpiLabel}>判定</div>
            <div className={styles.kpiRow}>
              <span className={`${styles.badge} ${styles[`badge_${latestTone}`]}`}>
                {latest ? riskLabel(latest.risk) : "--"}
              </span>
              <span className={styles.kpiTime}>
                {latest ? new Date(latest.ts).toLocaleString("ja-JP") : ""}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <button className={styles.btn} onClick={appendOne}>
            1回取得
          </button>

          <button className={styles.btn} onClick={() => setRunning((v) => !v)}>
            {running ? "停止" : "再開"}
          </button>

          <button className={styles.btn} onClick={() => setRows((prev) => prev.slice(-1))}>
            クリア（最新のみ）
          </button>
        </div>
      </div>

      {/* 下部：テーブル */}
      <div className={styles.panel}>
        {/* ここは既存のexcel CSSが効く前提（あなたのglobals.cssにあるはず） */}
        <div className="excel-wrap">
          <table className="excel-table">
            <thead>
              <tr>
                <th>上流（L/min）</th>
                <th>下流（L/min）</th>
                <th>差分（L/min）</th>
                <th>差分の総量（L/min）</th>
                <th>判定</th>
                <th>更新日時</th>
              </tr>
            </thead>

            <tbody>
              {rowsWithTotalDiff.map((r) => {
                const rowClass =
                  r.risk === "danger" ? "row-danger" : r.risk === "warn" ? "row-warn" : "row-safe";

                const tone = riskTone(r.risk);

                return (
                  <tr key={r.ts} className={rowClass}>
                    <td>{r.upstream.toFixed(2)}</td>
                    <td>{r.downstream.toFixed(2)}</td>
                    <td>{r.diff.toFixed(2)}</td>
                    <td>{r.totalDiffLmin.toFixed(2)}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>
                        {riskLabel(r.risk)}
                      </span>
                    </td>
                    <td>{new Date(r.ts).toLocaleString("ja-JP")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
