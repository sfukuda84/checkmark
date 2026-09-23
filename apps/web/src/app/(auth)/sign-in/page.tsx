import { serverEnv } from "@app/shared/env";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const env = serverEnv();
  const initialError = error
    ? "Google でのログインを完了できませんでした。はじめて Google で使う場合は、アカウントの登録の画面で規約に同意のうえ登録してください。"
    : null;
  return (
    <>
      <h1>ログイン</h1>
      <SignInForm googleEnabled={!!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} initialError={initialError} />
    </>
  );
}
