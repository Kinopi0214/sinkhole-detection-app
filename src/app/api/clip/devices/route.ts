export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClipItem = {
  deviceId?: string;
  sendDateTime?: string;
  payloadType?: string;
  payload?: string;
};

type DeviceSummary = {
  deviceId: string;
  latestSendDateTime?: string;
  sampleHead?: string;
  sampleType?: string;
};

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

    const body = {
      operationName: "ListClipCalcData",
      variables: { limit: 200 },
      query: `
        query ListClipCalcData($limit: Int) {
          listClipCalcData(limit: $limit) {
            items {
              deviceId
              sendDateTime
              payloadType
              payload
            }
          }
        }
      `,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: auth,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const json = await res.json();

    if (json.errors?.length) {
      return Response.json({ ok: false, errors: json.errors }, { status: 500 });
    }

    const items: ClipItem[] = json?.data?.listClipCalcData?.items;
    if (!Array.isArray(items)) {
      return Response.json({ ok: false, error: "Unexpected response", raw: json }, { status: 500 });
    }

    // deviceIdごとに最新を集計（Mapで型を安定させる）
    const map = new Map<string, DeviceSummary>();

    for (const it of items) {
      const id = typeof it.deviceId === "string" ? it.deviceId : undefined;
      if (!id) continue;

      const head = typeof it.payload === "string" ? it.payload.slice(0, 2) : undefined;
      const type = typeof it.payloadType === "string" ? it.payloadType : undefined;
      const dt = typeof it.sendDateTime === "string" ? it.sendDateTime : undefined;

      const prev = map.get(id) ?? { deviceId: id };

      // prev.latestSendDateTime が undefined でも比較できるように安全に
      if (!prev.latestSendDateTime || (dt && dt > prev.latestSendDateTime)) {
        prev.latestSendDateTime = dt;
        prev.sampleHead = head;
        prev.sampleType = type;
      }

      map.set(id, prev);
    }

    const devices = Array.from(map.values()).sort((a, b) =>
      (b.latestSendDateTime ?? "").localeCompare(a.latestSendDateTime ?? "")
    );

    return Response.json({ ok: true, count: devices.length, devices });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
