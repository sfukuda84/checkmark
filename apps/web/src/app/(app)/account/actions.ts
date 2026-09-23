"use server";

import { headers } from "next/headers";
import { getDb } from "@app/db";
import { getAuth } from "@/auth";
import { requireUser } from "@/auth/guards";
import { reauthenticateWithPassword } from "@/auth/reauth";

export type ReauthState = { error: string | null; ok: boolean };

/** パスワードの再入力による再認証（research R6）。 */
export async function reauthenticate(_prev: ReauthState, form: FormData): Promise<ReauthState> {
  await requireUser();
  const result = await reauthenticateWithPassword(
    getAuth(),
    getDb(),
    new Headers(await headers()),
    String(form.get("password") ?? ""),
  );
  if (!result.ok) return { error: result.code, ok: false };
  return { error: null, ok: true };
}
