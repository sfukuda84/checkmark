"use client";

import Link from "next/link";
import { useState } from "react";
import { setCookieConsent } from "@/app/legal/cookies/actions";

/** Cookie の同意のバナー。未選択の間だけ表示する（FR-021）。 */
export function CookieBanner({ initiallyChosen }: { initiallyChosen: boolean }) {
  const [chosen, setChosen] = useState(initiallyChosen);
  if (chosen) return null;
  const choose = async (optional: boolean) => {
    await setCookieConsent(optional);
    setChosen(true);
  };
  return (
    <section className="cookie-banner" aria-label="Cookie の利用について">
      <div className="inner">
        <p>
          本サービスは、ログインの状態を保つために必須の Cookie を使います。分析などの必須でない Cookie
          は、同意いただいた場合に限って使います。 詳しくは<Link href="/legal/privacy">プライバシーポリシー</Link>
          をご覧ください。
        </p>
        <button type="button" onClick={() => choose(true)}>
          すべて許可する
        </button>{" "}
        <button type="button" className="secondary" onClick={() => choose(false)}>
          必須のみ
        </button>
      </div>
    </section>
  );
}
