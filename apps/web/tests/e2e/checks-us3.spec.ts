import { expect, test } from "@playwright/test";
import { candidateRow, resetDb, runCheck, signInAsNewUser } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US3: 画面を閉じても処理は続き、トップの直近のチェックから結果に戻れる。他人は開けない", async ({
  page,
  browser,
}) => {
  await signInAsNewUser(page, "c-us3");
  await runCheck(page, ["ホシゾラ", "ハルカゼ"]);
  const url = page.url();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "直近のチェック" })).toBeVisible();
  await page
    .getByRole("link", { name: /のチェック$/ })
    .first()
    .click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText(/2 件中 2 件が完了/)).toBeVisible({ timeout: 30_000 });
  await expect(candidateRow(page, "ホシゾラ")).toContainText("同一の商標あり");

  const other = await browser.newPage();
  await signInAsNewUser(other, "c-us3-other");
  const res = await other.goto(url);
  expect(res?.status()).toBe(404);
  await expect(other.getByText("ホシゾラ")).toHaveCount(0);
  await other.close();
});
