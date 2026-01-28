"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WaterDemo.module.css";

import { MockWaterProvider } from "@/lib/providers/mockWaterProvider";
import { calcDiff, judgeRisk, type RiskLevel, type WaterReading } from "@/lib/water";

type Row = WaterReading & {
  diff: number; // L/min
  risk: RiskLevel;
};

type RowWithTotal = Row & {
  totalDiffL: number; // L
};

function numEnv(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function formatInterval(intervalMs: number) {
  const s = intervalMs / 1000;
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
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

  // 体積換算：diff(L/min) × (intervalMs/60000) = L
  const stepMinutes = intervalMs / 60000;

  // ✅ 発表用シナリオ設定（ここを変えるだけで演出調整できます）
  const demoEqualRows = 4;  // 最初の「差分0」行数（3にしたければ 3）
  const demoRampRows = 10;  // 差分を増やすフェーズ行数
  const demoRampStep = 0.9; // 1行ごとの下流低下量（L/min）

  const provider = useMemo(
    () =>
      new MockWaterProvider(upstreamBase, downstreamBase, jitter, {
        equalRows: demoEqualRows,
        rampRows: demoRampRows,
        rampStep: demoRampStep,
      }),
    [upstreamBase, downstreamBase, jitter]
  );

  const timerRef = useRef<number | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [running, setRunning] = useState(true);

  // ✅ 初期は空（0から開始）
  const [rows, setRows] = useState<Row[]>([]);

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

  const rowsWithTotalDiff: RowWithTotal[] = useMemo(() => {
    let accL = 0;
    return rows.map((cur) => {
      accL += cur.diff * stepMinutes;
      return { ...cur, totalDiffL: accL };
    });
  }, [rows, stepMinutes]);

  const latest = rowsWithTotalDiff.length
    ? rowsWithTotalDiff[rowsWithTotalDiff.length - 1]
    : null;

  const latestTone = latest ? riskTone(latest.risk) : "neutral";

  const noteText = `※差分の総量（L）は、差分（L/min）を更新間隔（${intervalMs}ms）で積分して累積しています。`;

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>疑似リアルタイム水量デモ（履歴）</div>
            <div className={styles.sub}>更新間隔: {formatInterval(intervalMs)}</div>
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
            <div className={styles.kpiLabel}>差分の総量（L）</div>
            <div className={styles.kpiValue}>{latest ? latest.totalDiffL.toFixed(2) : "--"}</div>
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
          <button className={styles.btn} onClick={() => setRunning((v) => !v)}>
            {running ? "停止" : "再開"}
          </button>

          <button className={styles.btn} onClick={() => setRows([])}>
            クリア
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.tableNote}>{noteText}</div>

        <div className="excel-wrap">
          <table className="excel-table">
            <thead>
              <tr>
                <th>上流（L/min）</th>
                <th>下流（L/min）</th>
                <th>差分（L/min）</th>
                <th>差分の総量（L）</th>
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
                    <td>{r.totalDiffL.toFixed(2)}</td>
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

        {rowsWithTotalDiff.length === 0 && (
          <div className={styles.emptyHint}>データを取得中です。しばらくお待ちください。</div>
        )}
      </div>
    </div>
  );
}
