// src/app/api/clip/devices/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const endpoint = mustEnv("CLIP_GRAPHQL_URL");
    const auth = req.headers.get("authorization");
    if (!auth) {
      return Response.json({ ok: false, error: "Missing Authorization header" }, { status: 401 });
    }

    // まずは items から deviceId を集める（確実に動くやり方）
    const body = {
      operationName: "ListClipCalcData",
      variables: { limit: 200 },
      query: `
        query ListClipCalcData($limit: Int) {
          listClipCalcData(limit: $limit) {
            items { deviceId sendDateTime payloadType payload }
          }
        }
      `,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const json = await res.json();
    if (json.errors?.length) {
      return Response.json({ ok: false, errors: json.errors }, { status: 500 });
    }

    const items = json?.data?.listClipCalcData?.items;
    if (!Array.isArray(items)) {
      return Response.json({ ok: false, error: "Unexpected response", raw: json }, { status: 500 });
    }

    // deviceId をユニーク化＋最新時刻っぽいものを添える
    const map = new Map<string, { deviceId: string; latestSendDateTime?: string; sampleHead?: string; sampleType?: string }>();
    for (const it of items) {
      const id = it?.deviceId;
      if (!id) continue;
      const prev = map.get(id);
      const head = typeof it?.payload === "string" ? it.payload.slice(0, 2) : undefined;
      const obj = prev ?? { deviceId: id };
      if (!obj.latestSendDateTime || (it.sendDateTime && it.sendDateTime > obj.latestSendDateTime)) {
        obj.latestSendDateTime = it.sendDateTime;
        obj.sampleHead = head;
        obj.sampleType = it.payloadType ?? undefined;
      }
      map.set(id, obj);
    }

    const devices = Array.from(map.values()).sort((a, b) =>
      (b.latestSendDateTime ?? "").localeCompare(a.latestSendDateTime ?? "")
    );

    return Response.json({ ok: true, count: devices.length, devices });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
