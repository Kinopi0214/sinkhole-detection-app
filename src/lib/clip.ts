// src/lib/clip.ts
export function decodePayload0x89(hex: string) {
  const buf = Buffer.from(hex, "hex");

  if (buf.length < 16) throw new Error(`payload too short: ${buf.length}`);
  if (buf[0] !== 0x89) throw new Error("Not 0x89 payload");

  const ch = buf.readUInt8(1);
  const trigger1 = buf.readFloatLE(2);
  const trigger2 = buf.readFloatLE(6);
  const epoch = buf.readUInt32LE(10);

  return { ch, trigger1, trigger2, epoch };
}
