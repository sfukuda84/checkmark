"use server";

import { redirect } from "next/navigation";
import { getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { acceptConsentFor } from "@/legal/accept";

export type AcceptConsentState = { error: string | null };

/** 表示した版への同意を記録する（FR-020）。 */
export async function acceptConsent(_prev: AcceptConsentState, form: FormData): Promise<AcceptConsentState> {
  const user = await requireUser({ allowWithoutConsent: true });
  const result = await acceptConsentFor(getDb(), user.id, {
    terms: String(form.get("terms") ?? ""),
    privacy: String(form.get("privacy") ?? ""),
  });
  if (!result.ok) return { error: result.code };
  redirect("/");
}
