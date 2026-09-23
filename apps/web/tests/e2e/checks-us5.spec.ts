import { expect, test } from "@playwright/test";
import { currentPeriod, formAlert, resetDb, signInAsNewUser, sql } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("US5: 残りの回数を示し、超える実行はできない", async ({ page }) => {
  const email = await signInAsNewUser(page, "c-us5");
  const [u] = await sql<{ id: string }>(`select id from "user" where email = $1`, [email]);
  await sql(`insert into usage_counters (user_id, period, used) values ($1, $2, 48)`, [u!.id, currentPeriod()]);

  await page.goto("/checks/new");
  await expect(page.getByText("今月の残り:")).toContainText("2 件");
  await page.getByLabel(/名前の候補/).fill("ア\nイ\nウ");
  await page.getByRole("button", { name: "チェックする" }).click();
  await expect(formAlert(page)).toContainText("上限を超えています");
  await expect(formAlert(page)).toContainText("残りは 2 件");

  await sql(`update usage_counters set used = 50 where user_id = $1`, [u!.id]);
  await page.goto("/checks/new");
  await expect(page.getByText("上限に達しました")).toBeVisible();
  await expect(page.getByRole("button", { name: "チェックする" })).toBeDisabled();
});
