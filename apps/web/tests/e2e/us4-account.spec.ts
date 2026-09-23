import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  dismissCookieBanner,
  PASSWORD,
  resetDb,
  signIn,
  signUpAndVerify,
  sql,
  uniqueEmail,
  waitForMailLink,
  formAlert,
} from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

/** ログインから 10 分を過ぎた状態にする（再認証を求められるように）。 */
async function ageSessions() {
  await sql(`update session set reauthenticated_at = now() - interval '11 minutes'`);
}

test("US4: 再認証してメールアドレスを変更する", async ({ page }) => {
  const email = uniqueEmail("us4");
  const next = uniqueEmail("us4new");
  await signUpAndVerify(page, email);
  await dismissCookieBanner(page);
  await ageSessions();

  await page.goto("/account");
  await page.getByLabel("新しいメールアドレス").fill(next);
  await page.getByRole("button", { name: "メールアドレスを変更する" }).click();
  await expect(page).toHaveURL(/\/account\/reauth/);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "確認する" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.getByLabel("新しいメールアドレス").fill(next);
  await page.getByRole("button", { name: "メールアドレスを変更する" }).click();
  await expect(page.getByRole("status")).toContainText("確認メールを送りました");
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.goto(await waitForMailLink(next, "新しいメールアドレスの確認"));
  await expect(page.getByRole("status")).toContainText("メールアドレスを変更しました");
  await expect(page.getByText(next, { exact: true })).toBeVisible();
  await waitForMailLink(email, "メールアドレスが変更されました");
});

test("US4: 退会すると、ログインできなくなる", async ({ page }) => {
  const email = uniqueEmail("us4del");
  await signUpAndVerify(page, email);
  await dismissCookieBanner(page);
  await page.goto("/account");
  // 性能: アカウントの画面の応答が 1 秒以内（SC-006）
  const start = Date.now();
  const res = await page.goto("/account");
  expect(res?.ok()).toBe(true);
  expect(Date.now() - start).toBeLessThan(1000);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.getByRole("button", { name: "退会する" }).click();
  await page.getByRole("button", { name: "削除して退会する" }).click();
  await expect(page).toHaveURL(/\/account-deleted/);
  expect(await sql(`select 1 from "user" where email = $1`, [email])).toHaveLength(0);

  await signIn(page, email);
  await expect(formAlert(page)).toBeVisible();
});
