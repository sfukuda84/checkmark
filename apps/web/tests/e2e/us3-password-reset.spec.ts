import { expect, test } from "@playwright/test";
import { resetDb, signIn, signUpAndVerify, uniqueEmail, waitForMailLink, formAlert } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US3: パスワードを再設定し、新しいパスワードでログインできる", async ({ page }) => {
  const email = uniqueEmail("us3");
  await signUpAndVerify(page, email);
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "再設定の案内を送る" }).click();
  await expect(page.getByRole("status")).toContainText("登録されていれば");

  const link = await waitForMailLink(email, "パスワードの再設定");
  await page.goto(link);
  await page.getByLabel("新しいパスワード（8 文字以上）").fill("a-brand-new-long-passphrase");
  await page.getByRole("button", { name: "パスワードを変更する" }).click();
  await expect(page.getByRole("status")).toContainText("パスワードを変更しました");

  await signIn(page, email, "correct-horse-battery-staple");
  await expect(formAlert(page)).toBeVisible();
  await signIn(page, email, "a-brand-new-long-passphrase");
  await expect(page.getByText(`ログイン中: ${email}`)).toBeVisible();

  // 同じリンクはもう使えない
  await page.context().clearCookies();
  await page.goto(link);
  await expect(formAlert(page)).toContainText("無効");
});
