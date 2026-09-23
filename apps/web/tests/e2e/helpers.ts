import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import pg from "pg";
import { MAIL_OUTBOX_DIR } from "../../playwright.config";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function resetDb() {
  await sql(
    `truncate table auth_events, consents, outbound_emails, rate_limit_buckets, rate_limit, verification, account, session, "user" restart identity cascade`,
  );
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

interface SavedMail {
  to: string;
  subject: string;
  text: string;
}

/** worker が書き出したメールから、宛先と件名に合う最新のリンクを取り出す。 */
export async function waitForMailLink(to: string, subjectIncludes: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const files = await readdir(MAIL_OUTBOX_DIR).catch(() => [] as string[]);
        const mails: SavedMail[] = [];
        for (const f of files.sort()) mails.push(JSON.parse(await readFile(path.join(MAIL_OUTBOX_DIR, f), "utf8")));
        const found = mails.reverse().find((m) => m.to === to && m.subject.includes(subjectIncludes));
        link = found?.text.match(/https?:\/\/\S+/)?.[0];
        return link;
      },
      { timeout: 30_000, message: `メールが届かない: ${to} ${subjectIncludes}` },
    )
    .toBeTruthy();
  return link!;
}

export const PASSWORD = "correct-horse-battery-staple";

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-up");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード（8 文字以上）").fill(password);
  await page.getByLabel(/利用規約.*同意する/).check();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
}

export async function signUpAndVerify(page: Page, email: string, password = PASSWORD) {
  await signUp(page, email, password);
  await page.goto(await waitForMailLink(email, "メールアドレスの確認"));
  await expect(page.getByRole("heading", { name: "メールアドレスを確認しました" })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** Cookie のバナーを閉じる（操作の邪魔にならないように）。 */
export async function dismissCookieBanner(page: Page) {
  const btn = page.getByRole("button", { name: "必須のみ" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

/** フォームのエラー（Next.js のルートの告知用の要素を除く）。 */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
