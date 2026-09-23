import { expect, test } from "@playwright/test";
import { candidateRow, resetDb, runCheck, signInAsNewUser } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US2: 区分を選ぶと、その区分の商標だけで照合する", async ({ page }) => {
  await signInAsNewUser(page, "c-us2");
  await runCheck(page, ["ミライデンキ"]);
  await expect(page.getByText("全区分")).toBeVisible();
  await expect(candidateRow(page, "ミライデンキ")).toContainText("同一の商標あり（2 件）", { timeout: 30_000 });

  await runCheck(page, ["ミライデンキ"], [9]);
  await expect(page.locator("dl.meta")).toContainText("第 9 類");
  await expect(candidateRow(page, "ミライデンキ")).toContainText("同一の商標あり（1 件）", { timeout: 30_000 });
});
