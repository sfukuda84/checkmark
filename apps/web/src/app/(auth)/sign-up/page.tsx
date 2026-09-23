import { serverEnv } from "@app/shared/env";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const env = serverEnv();
  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const initialError = error
    ? "Google での登録を完了できませんでした。利用規約とプライバシーポリシーに同意のうえ、もう一度お試しください。"
    : null;
  return (
    <>
      <h1>アカウントの登録</h1>
      <SignUpForm googleEnabled={googleEnabled} initialError={initialError} />
    </>
  );
}
