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

  // ✅ 総水分量（累積）表示用：上流/下流/差分
  const [totalUpL, setTotalUpL] = useState(0);
  const [totalDownL, setTotalDownL] = useState(0);
  const [totalDiffL, setTotalDiffL] = useState(0);

  // 前回の時刻（ts）を保持
  const lastTsRef = useRef<number | null>(null);

  const appendOne = () => {
    const r = provider.next();
    const diff = calcDiff(r);
    const risk = judgeRisk(diff, warnDiff, dangerDiff);

    // ✅ 累積更新（dtは r.ts を使う）
    const lastTs = lastTsRef.current;

    if (lastTs === null) {
      // 初回は時刻だけ保存（dtが取れない）
      lastTsRef.current = r.ts;
    } else {
      const dtSec = (r.ts - lastTs) / 1000;
      lastTsRef.current = r.ts;

      if (dtSec > 0 && dtSec < 60 * 60) {
        const dtMin = dtSec / 60;

        // 上流・下流の総量
        setTotalUpL((prev) => prev + r.upstream * dtMin);
        setTotalDownL((prev) => prev + r.downstream * dtMin);

        // 差分の総量（ここが表にも出す対象）
        setTotalDiffL((prev) => prev + (r.upstream - r.downstream) * dtMin);
      }
    }

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

  // ✅ 表に出すため：各行時点の「差分総量（累積差）」を rows から計算して付与
  // こうすると「表示の行」と「累積値」が必ず一致します（重要）
  const rowsWithTotalDiff = useMemo(() => {
    if (rows.length === 0) return [];

    let acc = 0; // 累積差（L）

    return rows.map((cur, i) => {
      const prev = rows[i - 1];
      if (prev) {
        const dtSec = (cur.ts - prev.ts) / 1000;
        if (dtSec > 0 && dtSec < 60 * 60) {
          const dtMin = dtSec / 60;
          // 差分総量（累積差）
          acc += (cur.upstream - cur.downstream) * dtMin;
        }
      }
      return { ...cur, totalDiffL: acc };
    });
  }, [rows]);

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

      <div className="flex items-center gap-2 flex-wrap">
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
          onClick={() => setRows((prev) => prev.slice(-1))}
        >
          クリア（最新のみ）
        </button>

        {/* ✅ 総水分量リセット */}
        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          onClick={() => {
            setTotalUpL(0);
            setTotalDownL(0);
            setTotalDiffL(0);

            // 次のappendOneでdtを取れるように「最新行のts」を前回時刻としてセット
            setRows((prev) => {
              const latest = prev.slice(-1);
              lastTsRef.current = latest[0]?.ts ?? null;
              return latest;
            });
          }}
        >
          総水分量リセット
        </button>
      </div>

      {/* テーブル（差分の右に「差分総量」を1列だけ追加） */}
      <div className="excel-wrap">
        <table className="excel-table">
          <thead>
            <tr>
              <th>上流（L/min）</th>
              <th>下流（L/min）</th>
              <th>差分（L/min）</th>

              {/* ✅ 追加：差分の総量（累積差） */}
              <th>差分の総量（L）</th>

              <th>判定</th>
              <th>更新日時</th>
            </tr>
          </thead>

          <tbody>
            {rowsWithTotalDiff.map((r) => {
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

                  {/* ✅ 追加列：差分総量 */}
                  <td>{r.totalDiffL.toFixed(2)}</td>

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
