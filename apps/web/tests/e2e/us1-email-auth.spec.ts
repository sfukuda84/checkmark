import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PASSWORD, resetDb, signIn, signUp, signUpAndVerify, uniqueEmail, waitForMailLink, formAlert } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US1: サインアップ、確認、ログイン、ログアウト、再ログイン", async ({ page }) => {
  const email = uniqueEmail("us1");
  await signUp(page, email);
  await expect(page.getByText("確認メールを送りました")).toBeVisible();
  await page.goto(await waitForMailLink(email, "メールアドレスの確認"));
  await page.getByRole("link", { name: "はじめる" }).click();
  await expect(page.getByRole("heading", { name: "ネーミングチェッカー" })).toBeVisible();
  await expect(page.getByText(`ログイン中: ${email}`)).toBeVisible();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, email);
  await expect(page.getByText(`ログイン中: ${email}`)).toBeVisible();
});

test("US1: 同意しないと登録できず、漏えいパスワードは拒否される", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("メールアドレス").fill(uniqueEmail("us1b"));
  await page.getByLabel("パスワード（8 文字以上）").fill(PASSWORD);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(formAlert(page)).toContainText("同意が必要");

  await page.getByLabel(/利用規約.*同意する/).check();
  await page.getByLabel("パスワード（8 文字以上）").fill("password123");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(formAlert(page)).toContainText("漏えい");
});

test("US1: 誤ったパスワードでは、どちらが誤りかを示さない", async ({ page }) => {
  const email = uniqueEmail("us1c");
  await signUpAndVerify(page, email);
  await page.context().clearCookies();
  await signIn(page, email, "wrong-password-x");
  await expect(formAlert(page)).toHaveText("メールアドレスまたはパスワードが正しくありません。");
});

test("アクセシビリティ: 登録とログインの画面に重大な違反がない（NFR-UX-003）", async ({ page }) => {
  for (const path of ["/sign-up", "/sign-in", "/forgot-password"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${path}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
  }
});

test("性能: 登録とログインの画面の応答が 1 秒以内（SC-006）", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path); // 初回（コンパイルやキャッシュ）を除く
    const start = Date.now();
    const res = await page.goto(path);
    expect(res?.ok()).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
  }
});
