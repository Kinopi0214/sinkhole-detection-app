"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MockWaterProvider } from "@/lib/providers/mockWaterProvider";
import { calcDiff, judgeRisk, type RiskLevel, type WaterReading } from "@/lib/water";

type Row = WaterReading & {
  diff: number;
  risk: RiskLevel;
};

function numEnv(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function riskLabel(risk: RiskLevel) {
  return risk === "danger" ? "危険" : risk === "warn" ? "注意" : "正常";
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

  // ① 右上の現在時刻
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

  return (
    <div className="rounded-xl border p-4 space-y-4">
      {/* タイトル行：左タイトル、右に現在時刻 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">疑似リアルタイム水量デモ（履歴）</h2>
          <div className="text-sm text-gray-600">
            更新間隔: {intervalMs}ms ／ 閾値: 注意 ≥ {warnDiff} ／ 危険 ≥ {dangerDiff}
          </div>
        </div>

        <div className="text-sm text-gray-700">
          現在時刻：{new Date(now).toLocaleString("ja-JP")}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          onClick={appendOne}
        >
          1回取得
        </button>

        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          onClick={() => setRunning((v) => !v)}
        >
          {running ? "停止" : "再開"}
        </button>

        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          onClick={() => setRows(rows.slice(-1))}
        >
          クリア（最新のみ）
        </button>
      </div>

      {/* ② 罫線ありのテーブル */}
      <div className="excel-wrap">
  <table className="excel-table">
    <thead>
      <tr>
        <th>上流（L/min）</th>
        <th>下流（L/min）</th>
        <th>差分（上流-下流）</th>
        <th>判定</th>
        <th>更新日時</th>
      </tr>
    </thead>

    <tbody>
  {rows.map((r) => {
    const rowClass =
      r.risk === "danger"
        ? "row-danger"
        : r.risk === "warn"
        ? "row-warn"
        : "row-safe";

    return (
      <tr key={r.ts} className={rowClass}>
        <td>{r.upstream.toFixed(2)}</td>
        <td>{r.downstream.toFixed(2)}</td>
        <td>{r.diff.toFixed(2)}</td>
        <td>{riskLabel(r.risk)}</td>
        <td>{new Date(r.ts).toLocaleString("ja-JP")}</td>
      </tr>
    );
  })}
</tbody>

  </table>
</div>


    </div>
  );
}
