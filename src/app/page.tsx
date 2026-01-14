// src/app/page.tsx
import WaterDemo from "@/components/WaterDemo";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <WaterDemo />

      {/* ここから下は既存の CLIP デバッグUI（今のまま残す） */}
      {/* ...あなたの既存UI... */}
    </main>
  );
}
