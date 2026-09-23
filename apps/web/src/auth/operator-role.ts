import { eq, user, type Database, type UserRole } from "@app/db";

/** 運営者のロールの付与と取り消し。画面からは行わず、CLI からだけ呼ぶ（FR-027）。 */
export async function setOperatorRole(db: Database, email: string, role: UserRole): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ role })
    .where(eq(user.email, email.trim().toLowerCase()))
    .returning({ id: user.id });
  return rows.length > 0;
}
