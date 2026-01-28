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
  totalDiffL: number;
};

function numEnv(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function formatInterval(intervalMs: number) {
  return `${intervalMs / 1000}s`;
}

function riskLabel(risk: RiskLevel) {
  return risk === "danger" ? "危険" : risk === "warn" ? "注意" : "正常";
}

function riskTone(risk: RiskLevel) {
  return risk === "danger" ? "danger" : risk === "warn" ? "warn" : "safe";
}

export default function WaterDemo() {
  const intervalMs = 10000;      // 更新間隔10s
  const initialDelayMs = 5000;  // 最初は5s待つ

  const upstreamBase = numEnv("NEXT_PUBLIC_UPSTREAM_BASE", 50);
  const downstreamBase = numEnv("NEXT_PUBLIC_DOWNSTREAM_BASE", 50);
  const jitter = numEnv("NEXT_PUBLIC_WATER_JITTER", 1.5);

  const warnDiff = numEnv("NEXT_PUBLIC_RISK_WARN_DIFF", 3);
  const dangerDiff = numEnv("NEXT_PUBLIC_RISK_DANGER_DIFF", 8);

  const stepMinutes = intervalMs / 60000;

  const demoRampRows = 10;
  const demoRampStep = 0.6;
  const probStartDiffAt3rd = 0.5;

  const createProvider = () =>
    new MockWaterProvider(upstreamBase, downstreamBase, jitter, {
      equalRowsProb3: probStartDiffAt3rd,
      rampRows: demoRampRows,
      rampStep: demoRampStep,
    });

  const [provider, setProvider] = useState(() => createProvider());
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(true);

  const timerRef = useRef<number | null>(null);
  const startTimeoutRef = useRef<number | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const appendOne = () => {
    const r = provider.next();
    const diff = calcDiff(r);
    const risk = judgeRisk(diff, warnDiff, dangerDiff);

    setRows((prev) => [...prev, { ...r, diff, risk }]);
  };

  const startTimer = () => {
    // 最初の5秒待ち
    startTimeoutRef.current = window.setTimeout(() => {
      appendOne();

      timerRef.current = window.setInterval(() => {
        appendOne();
      }, intervalMs);
    }, initialDelayMs);
  };

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (startTimeoutRef.current) window.clearTimeout(startTimeoutRef.current);
    timerRef.current = null;
    startTimeoutRef.current = null;
  };

  useEffect(() => {
    if (!running) {
      stopTimer();
      return;
    }

    startTimer();

    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, provider]);

  const rowsWithTotalDiff: RowWithTotal[] = useMemo(() => {
    let acc = 0;
    return rows.map((cur) => {
      acc += cur.diff * stepMinutes;
      return { ...cur, totalDiffL: acc };
    });
  }, [rows, stepMinutes]);

  const latest = rowsWithTotalDiff.at(-1);
  const latestTone = latest ? riskTone(latest.risk) : "neutral";

  const noteText = `※差分の総量（L）は、差分（L/min）を更新間隔（${intervalMs}ms）で積分して累積しています。`;

  const handleClear = () => {
    stopTimer();
    setRows([]);
    setProvider(createProvider()); // ✅ providerを作り直す
    setRunning(true);              // 自動で再開（5s後）
  };

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

        <div className={styles.controls}>
          <button className={styles.btn} onClick={() => setRunning((v) => !v)}>
            {running ? "停止" : "再開"}
          </button>

          <button className={styles.btn} onClick={handleClear}>
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
                const tone = riskTone(r.risk);
                const rowClass =
                  r.risk === "danger" ? "row-danger" : r.risk === "warn" ? "row-warn" : "row-safe";

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
          <div className={styles.emptyHint}>
            データを取得中です。しばらくお待ちください。
          </div>
        )}
      </div>
    </div>
  );
}
