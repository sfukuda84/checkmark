import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { candidateRow, resetDb, runCheck, signInAsNewUser } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US1: 候補を一括で実行し、商標の照合結果を比較表で見る", async ({ page }) => {
  await signInAsNewUser(page, "c-us1");
  const started = Date.now();
  await runCheck(page, ["さくらのみち", "ソラマメ", "キエタショウヒョウ", "さくらのみち"]);
  // SC-001: 入力から比較表の画面に移るまで 1 分以内
  expect(Date.now() - started).toBeLessThan(60_000);

  await expect(page.getByText("同じ候補を 1 件まとめました。")).toBeVisible();
  await expect(page.getByText("簡易チェックです。")).toBeVisible();
  await expect(page.getByText(/3 件中 3 件が完了/)).toBeVisible({ timeout: 30_000 });

  await expect(candidateRow(page, "さくらのみち")).toContainText("同一の商標あり（1 件）");
  await expect(candidateRow(page, "ソラマメ")).toContainText("類似の商標あり");
  await expect(candidateRow(page, "キエタショウヒョウ")).toContainText("見つからなかった（登録できるとは限りません）");
  await expect(page.getByText(/時点までの出願・登録/)).toBeVisible();

  const row = candidateRow(page, "さくらのみち");
  await row.getByText("該当した商標を見る").click();
  await expect(row).toContainText("登録第 6000001 号");
  await expect(row).toContainText("検証用食品株式会社");
  await expect(row.getByRole("link", { name: /J-PlatPat で詳細を見る/ }).first()).toHaveAttribute(
    "href",
    "https://www.j-platpat.inpit.go.jp/c1801/TR/JP-2020-000001/40/ja",
  );

  // SC-009: 結果画面の表示が 1 秒以内
  const t = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(Date.now() - t).toBeLessThan(1_000);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("US1: 入力画面のアクセシビリティと入力の検証", async ({ page }) => {
  await signInAsNewUser(page, "c-us1b");
  await page.goto("/checks/new");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByLabel(/名前の候補/).fill("サクラ\n🌸");
  await page.getByRole("button", { name: "チェックする" }).click();
  await expect(page.getByText("2 行目: 使えない文字が含まれています")).toBeVisible();
});
