"use client";

import { useState } from "react";
import type { CookieConsentChoice } from "@/legal/cookie-consent";
import { setCookieConsent } from "./actions";

export function CookieChoiceForm({ current }: { current: CookieConsentChoice | null }) {
  const [choice, setChoice] = useState(current);
  return (
    <>
      <p role="status">
        現在の設定: {choice === "all" ? "すべて許可" : choice === "essential" ? "必須のみ" : "未選択"}
      </p>
      <button type="button" onClick={async () => setChoice(await setCookieConsent(true))}>
        すべて許可する
      </button>{" "}
      <button type="button" className="secondary" onClick={async () => setChoice(await setCookieConsent(false))}>
        必須のみにする
      </button>
    </>
  );
}
