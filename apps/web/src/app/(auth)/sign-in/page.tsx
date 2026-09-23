import { serverEnv } from "@app/shared/env";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const env = serverEnv();
  return (
    <>
      <h1>ログイン</h1>
      <SignInForm googleEnabled={!!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} />
    </>
  );
}
