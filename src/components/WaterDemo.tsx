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
  // ✅ 要望：初回/クリア後の最初の1回だけ 5s 待ち、その後 10s 更新
  const intervalMs = 10000;
  const initialDelayMs = 5000;

  // ✅ 要望：中心値を50付近に
  const upstreamBase = numEnv("NEXT_PUBLIC_UPSTREAM_BASE", 50);
  const downstreamBase = numEnv("NEXT_PUBLIC_DOWNSTREAM_BASE", 50);

  // ばらつき（小さめ推奨）
  const jitter = numEnv("NEXT_PUBLIC_WATER_JITTER", 1.5);

  const warnDiff = numEnv("NEXT_PUBLIC_RISK_WARN_DIFF", 3);
  const dangerDiff = numEnv("NEXT_PUBLIC_RISK_DANGER_DIFF", 8);

  const maxRows = 300;

  // 体積換算：diff(L/min) × (intervalMs/60000) = L
  const stepMinutes = intervalMs / 60000;

  // 発表用演出
  const demoRampRows = 10;
  const demoRampStep = 0.6;
  const probStartDiffAt3rd = 0.5; // 3行目開始の確率（等差分0が2行）

  const createProvider = () =>
    new MockWaterProvider(upstreamBase, downstreamBase, jitter, {
      equalRowsProb3: probStartDiffAt3rd,
      rampRows: demoRampRows,
      rampStep: demoRampStep,
    });

  // ✅ provider を state で持つ（クリアで作り直して完全リセット）
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

    setRows((prev) => {
      const next = [...prev, { ...r, diff, risk }];
      if (next.length > maxRows) return next.slice(next.length - maxRows);
      return next;
    });
  };

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (startTimeoutRef.current) window.clearTimeout(startTimeoutRef.current);
    timerRef.current = null;
    startTimeoutRef.current = null;
  };

  const startTimer = () => {
    // 最初の1回だけ 5秒待ち
    startTimeoutRef.current = window.setTimeout(() => {
      appendOne();

      // 以降は 10秒間隔
      timerRef.current = window.setInterval(() => {
        appendOne();
      }, intervalMs);
    }, initialDelayMs);
  };

  useEffect(() => {
    stopTimer();

    if (!running) return;

    startTimer();
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, provider]);

  const rowsWithTotalDiff: RowWithTotal[] = useMemo(() => {
    let accL = 0;
    return rows.map((cur) => {
      accL += cur.diff * stepMinutes;
      return { ...cur, totalDiffL: accL };
    });
  }, [rows, stepMinutes]);

  const latest = rowsWithTotalDiff.length ? rowsWithTotalDiff[rowsWithTotalDiff.length - 1] : null;
  const latestTone = latest ? riskTone(latest.risk) : "neutral";

  const noteText = `※差分の総量（L）は、差分（L/min）を更新間隔（${intervalMs}ms）で積分して累積しています。`;

  const handleClear = () => {
    // ✅ クリアで「差分0から再開」するために provider を作り直す
    stopTimer();
    setRows([]);
    setProvider(createProvider());
    setRunning(true); // 自動で再開（5s待ってから1行目）
  };

  return (
    <div className={styles.page}>
      {/* 上部：ヘッダー + KPIカード + ボタン */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>疑似リアルタイム水量デモ（履歴）</div>
            <div className={styles.sub}>更新間隔: {formatInterval(intervalMs)}</div>
          </div>
          <div className={styles.now}>現在時刻：{new Date(now).toLocaleString("ja-JP")}</div>
        </div>

        {/* ✅ ここが “消えていたデザイン” の本体（KPIカード） */}
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

          <button className={styles.btn} onClick={handleClear}>
            クリア
          </button>
        </div>
      </div>

      {/* 下部：テーブル */}
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
          <div className={styles.emptyHint}>データを取得中です。しばらくお待ちください。</div>
        )}
      </div>
    </div>
  );
}
