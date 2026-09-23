// テストの既定の環境変数。結合テストはテスト用 DB（app_test）を使う。
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.MAIL_TRANSPORT ??= "file";
process.env.LOG_LEVEL ??= "silent";
