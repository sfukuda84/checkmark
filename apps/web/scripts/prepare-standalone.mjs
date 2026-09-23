// next build の standalone の出力に、静的ファイル（.next/static）を置く。OS によらず動くよう Node で行う。
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, ".next", "static");
const to = path.join(root, ".next", "standalone", "apps", "web", ".next", "static");
if (!existsSync(from)) {
  console.error(".next/static がない。先に next build を実行する");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("standalone に静的ファイルを置いた");
