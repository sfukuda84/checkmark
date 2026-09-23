import "server-only";
import { headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@app/db";
import { getAuth } from "./index";
import { resolveAccess, type CurrentUser, type ResolveOptions } from "./access-state";

async function guard(options: ResolveOptions): Promise<CurrentUser> {
  const h = new Headers(await nextHeaders());
  const { decision, user } = await resolveAccess(getAuth(), getDb(), h, options);
  switch (decision.kind) {
    case "ok":
      return user!;
    case "redirect":
      redirect(decision.to);
    case "suspended":
      redirect("/suspended");
    case "not-found":
      notFound();
  }
}

/** ログインが要る画面とサーバー処理の入口（contracts/routes.md）。 */
export function requireUser(options: Omit<ResolveOptions, "requireOperator"> = {}): Promise<CurrentUser> {
  return guard(options);
}

/** 運営者の画面の入口。運営者でなければ 404（FR-025）。 */
export function requireOperator(): Promise<CurrentUser> {
  return guard({ requireOperator: true });
}
