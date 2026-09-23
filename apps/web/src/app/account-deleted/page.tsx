import Link from "next/link";

export default function AccountDeletedPage() {
  return (
    <>
      <h1>退会しました</h1>
      <p>アカウントと、これまでのチェックの候補名・結果をすべて削除しました。ご利用ありがとうございました。</p>
      <p>
        <Link href="/sign-up">もう一度登録する</Link>
      </p>
    </>
  );
}
