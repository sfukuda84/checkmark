import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { dismissCookieBanner, resetDb, signUpAndVerify, sql, uniqueEmail } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US5: 旧版だけに同意した利用者は、同意の画面を経て使い続ける", async ({ page }) => {
  const email = uniqueEmail("us5");
  await signUpAndVerify(page, email);
  await dismissCookieBanner(page);
  await sql(`update consents set version = '2000-01-01' where document = 'terms'`);

  await page.goto("/");
  await expect(page).toHaveURL(/\/consent/);
  await expect(page.getByRole("link", { name: /利用規約（.*版）/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("button", { name: "同意して続ける" }).click();
  await expect(page.getByText(`ログイン中: ${email}`)).toBeVisible();
  expect(await sql(`select 1 from consents where document = 'terms' and version <> '2000-01-01'`)).toHaveLength(1);
});

test("US5: 初回の訪問で Cookie の同意を求め、選んだら表示しない", async ({ page }) => {
  await page.goto("/sign-in");
  const banner = page.getByRole("region", { name: "Cookie の利用について" });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "必須のみ" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(banner).toBeHidden();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "cookie_consent")?.value).toBe("essential");

  // 選択はあとから変えられる（FR-021）
  await page.getByRole("link", { name: "Cookie の設定" }).click();
  await page.getByRole("button", { name: "すべて許可する" }).click();
  await expect(page.getByRole("status")).toContainText("すべて許可");
  const after = await page.context().cookies();
  expect(after.find((c) => c.name === "cookie_consent")?.value).toBe("all");
});
