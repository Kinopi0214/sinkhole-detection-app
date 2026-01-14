import { decodePayload0x89 } from "@/lib/clip";

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
    const targetDeviceId = mustEnv("CLIP_DEVICE_ID");

    const auth = req.headers.get("authorization");
    if (!auth) {
      return Response.json({ ok: false, error: "Missing Authorization header" }, { status: 401 });
    }

    // ✅ deviceId で絞る（filter）
    const body = {
      operationName: "ListClipCalcData",
      variables: {
        limit: 50,
        filter: { deviceId: { eq: targetDeviceId } },
      },
      query: `
        query ListClipCalcData($limit: Int, $filter: ModelClipCalcDataFilterInput) {
          listClipCalcData(limit: $limit, filter: $filter) {
            items {
              deviceId
              sendDateTime
              payloadType
              communicationLine
              rssi
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

    const items = json?.data?.listClipCalcData?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ ok: false, error: "No items for target device", raw: json }, { status: 500 });
    }

    // 0x89を探す
    const hit = items.find((it: any) => typeof it?.payload === "string" && it.payload.toLowerCase().startsWith("89"));

    if (!hit) {
      const sample = items.slice(0, 15).map((it: any) => ({
        deviceId: it.deviceId,
        sendDateTime: it.sendDateTime,
        payloadType: it.payloadType,
        payloadHead: typeof it.payload === "string" ? it.payload.slice(0, 2) : null,
        payloadLen: typeof it.payload === "string" ? it.payload.length : null,
      }));

      return Response.json(
        { ok: false, error: "No 0x89 payload found for target device", targetDeviceId, sample },
        { status: 500 }
      );
    }

    const decoded = decodePayload0x89(hit.payload);
    const diff = decoded.trigger2 - decoded.trigger1;

    return Response.json({
      ok: true,
      deviceId: hit.deviceId,
      sendDateTime: hit.sendDateTime,
      payloadType: hit.payloadType,
      payloadHex: hit.payload,
      ...decoded,
      diff,
      iso: new Date(decoded.epoch * 1000).toISOString(),
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
