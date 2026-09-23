"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 確認中の候補がある間、2 秒ごとに画面を読み直す（research R5、FR-019）。 */
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
