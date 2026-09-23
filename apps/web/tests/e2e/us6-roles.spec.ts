import { expect, test } from "@playwright/test";
import { dismissCookieBanner, resetDb, signIn, signUpAndVerify, sql, uniqueEmail } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US6: 利用者は運営者の画面に入れず、運営者は入れる", async ({ page }) => {
  const email = uniqueEmail("us6");
  await signUpAndVerify(page, email);
  await dismissCookieBanner(page);
  const res = await page.goto("/operator");
  expect(res?.status()).toBe(404);
  await sql(`update "user" set role = 'operator' where email = $1`, [email]);
  await page.goto("/operator");
  await expect(page.getByRole("heading", { name: "運営者向けの画面" })).toBeVisible();
});

test("US6: 停止されたアカウントは、次の操作で停止の画面に移り、ログインもできない", async ({ page }) => {
  const email = uniqueEmail("us6s");
  await signUpAndVerify(page, email);
  await dismissCookieBanner(page);
  await sql(`update "user" set status = 'suspended' where email = $1`, [email]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/suspended/);
  await expect(page.getByText("support@example.com")).toBeVisible();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/suspended/);
});
