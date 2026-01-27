"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MockWaterProvider } from "@/lib/providers/mockWaterProvider";
import { calcDiff, judgeRisk, type RiskLevel, type WaterReading } from "@/lib/water";

type Row = WaterReading & {
  diff: number;
  risk: RiskLevel;
};

type RowWithTotal = Row & {
  totalDiffLmin: number; // ✅ 差分（L/min）を単純累積した値
};

function numEnv(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function riskLabel(risk: RiskLevel) {
  return risk === "danger" ? "危険" : risk === "warn" ? "注意" : "正常";
}

function riskBadgeClass(risk: RiskLevel) {
  return risk === "danger"
    ? "bg-red-100 text-red-800 border-red-200"
    : risk === "warn"
    ? "bg-yellow-100 text-yellow-800 border-yellow-200"
    : "bg-blue-100 text-blue-800 border-blue-200";
}

function riskCardBorderClass(risk: RiskLevel) {
  return risk === "danger"
    ? "border-red-200"
    : risk === "warn"
    ? "border-yellow-200"
    : "border-blue-200";
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

  // 右上の現在時刻
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

  // ✅ 差分（L/min）を「単純に加算」していく累積値を各行に付与
  const rowsWithTotalDiff: RowWithTotal[] = useMemo(() => {
    let acc = 0;
    return rows.map((cur) => {
      acc += cur.diff;
      return { ...cur, totalDiffLmin: acc };
    });
  }, [rows]);

  // ✅ 現在値カード用（最新行）
  const latest = rowsWithTotalDiff.length
    ? rowsWithTotalDiff[rowsWithTotalDiff.length - 1]
    : null;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">疑似リアルタイム水量デモ（履歴）</h2>
            <div className="text-sm text-gray-600">
              更新間隔: {intervalMs}ms ／ 閾値: 注意 ≥ {warnDiff} ／ 危険 ≥ {dangerDiff}
            </div>
          </div>
          <div className="text-sm text-gray-700">現在時刻：{new Date(now).toLocaleString("ja-JP")}</div>
        </div>

        {/* ✅ 現在値カード */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-gray-500">上流（L/min）</div>
            <div className="text-2xl font-semibold tabular-nums">
              {latest ? latest.upstream.toFixed(2) : "--"}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-gray-500">下流（L/min）</div>
            <div className="text-2xl font-semibold tabular-nums">
              {latest ? latest.downstream.toFixed(2) : "--"}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-gray-500">差分（L/min）</div>
            <div className="text-2xl font-semibold tabular-nums">
              {latest ? latest.diff.toFixed(2) : "--"}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-gray-500">差分の総量（L/min）</div>
            <div className="text-2xl font-semibold tabular-nums">
              {latest ? latest.totalDiffLmin.toFixed(2) : "--"}
            </div>
          </div>

          <div
            className={[
              "rounded-xl border bg-white p-3 shadow-sm",
              latest ? riskCardBorderClass(latest.risk) : "",
            ].join(" ")}
          >
            <div className="text-xs text-gray-500">判定</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={[
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                  latest ? riskBadgeClass(latest.risk) : "bg-gray-100 text-gray-700 border-gray-200",
                ].join(" ")}
              >
                {latest ? riskLabel(latest.risk) : "--"}
              </span>
              <span className="text-xs text-gray-500">
                {latest ? new Date(latest.ts).toLocaleString("ja-JP") : ""}
              </span>
            </div>
          </div>
        </div>

        {/* 操作ボタン */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
            onClick={appendOne}
          >
            1回取得
          </button>

          <button
            className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
            onClick={() => setRunning((v) => !v)}
          >
            {running ? "停止" : "再開"}
          </button>

          <button
            className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
            onClick={() => setRows((prev) => prev.slice(-1))}
          >
            クリア（最新のみ）
          </button>
        </div>
      </div>

      {/* 履歴テーブル */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
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

                return (
                  <tr key={r.ts} className={rowClass}>
                    <td>{r.upstream.toFixed(2)}</td>
                    <td>{r.downstream.toFixed(2)}</td>
                    <td>{r.diff.toFixed(2)}</td>
                    <td>{r.totalDiffLmin.toFixed(2)}</td>

                    <td>
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                          riskBadgeClass(r.risk),
                        ].join(" ")}
                      >
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
