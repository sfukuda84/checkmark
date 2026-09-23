import { account, eq, getDb } from "@app/db";
import { serverEnv } from "@app/shared/env";
import { hasPassword } from "@/auth/account-policy";
import { requireUser } from "@/auth/guards";
import { safeNextPath } from "@/lib/error-messages";
import { ReauthForm } from "./reauth-form";

export const dynamic = "force-dynamic";

export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const { next } = await searchParams;
  const accounts = await getDb()
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, user.id));
  const env = serverEnv();
  return (
    <>
      <h1>本人確認</h1>
      <p>大切な操作の前に、本人であることを確かめます。確認は 10 分間有効です。</p>
      <ReauthForm
        next={safeNextPath(next, "/account")}
        withPassword={hasPassword(accounts)}
        googleEnabled={!!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
      />
    </>
  );
}
