#!/usr/bin/env python3
"""speckit-bootstrap の進捗（B1〜B6）を記録し、読み出す。

使い方:
    python3 bootstrap.py state                                   # 完了済みのステップと次のステップ
    python3 bootstrap.py checkpoint <ステップ> "<subject>" [--allow-empty] [--trailer "キー: 値"]...
        # git add -A して、trailer「Speckit-Bootstrap: <ステップ>」付きでコミットする

trailer は、コミットのメッセージの最後の段落にあるものだけが git に読まれる。
コミットを手で書いて trailer を別の段落に分けると（例: -m "Speckit-Bootstrap: B1" -m "Co-Authored-By: …"）、
完了が数えられない。checkpoint は、--trailer で渡したほかの trailer も同じ最後の段落にまとめる。

出力（state と checkpoint）:
    COMPLETED_STEPS: B1 B2 …
    NEXT_STEP: <ステップ> | DONE
    checkpoint はその前に CHECKPOINT: <ステップ> <コミット> を出す。

終了コード: 成功で 0、誤りで 1。
標準ライブラリだけで書く（Python 3.9 以上）。
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

STEPS = ["B1", "B2", "B3", "B4", "B5", "B5-1", "B6"]
TRAILER = "Speckit-Bootstrap"
# 後から足したステップ。これより後のステップの記録があれば、記録がなくても済んだものとみなす
# （そのステップを足す前に立ち上げを終えたプロジェクトで、済んだ工程に戻らない）
LATER_ADDED = {"B5-1"}


class BootstrapError(Exception):
    pass


def git(root: Path, args: list[str], check: bool = True, stdin: str | None = None) -> subprocess.CompletedProcess:
    proc = subprocess.run(["git", *args], cwd=str(root), input=stdin, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if check and proc.returncode != 0:
        raise BootstrapError(f"git {' '.join(args)} が失敗しました: {proc.stderr.strip()}")
    return proc


def find_root(start: Path) -> Path:
    proc = git(start, ["rev-parse", "--show-toplevel"], check=False)
    if proc.returncode != 0:
        raise BootstrapError(f"{start} は git リポジトリではありません")
    return Path(proc.stdout.strip())


def recorded_steps(root: Path) -> set[str]:
    proc = git(root, ["log", f"--format=%(trailers:key={TRAILER},valueonly)"], check=False)
    if proc.returncode != 0:  # コミットがまだない
        return set()
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def state(root: Path) -> tuple[list[str], str]:
    found = recorded_steps(root)
    done = [s for s in STEPS if s in found]
    for i, step in enumerate(STEPS):
        if step in found:
            continue
        if step in LATER_ADDED and any(s in found for s in STEPS[i + 1:]):
            continue
        return done, step
    return done, "DONE"


def normalize_step(value: str) -> str:
    step = value.strip().upper()
    if step not in STEPS:
        raise BootstrapError(f"ステップ {value} は不正です（有効値: {' '.join(STEPS)}）")
    return step


def checkpoint_message(subject: str, step: str, trailers: list[str]) -> str:
    """コミットのメッセージ。trailer はすべて最後の段落にまとめる（段落を分けると git は trailer として読まない）。"""
    if not subject.strip():
        raise BootstrapError("コミットの件名が空です")
    lines = [f"{TRAILER}: {step}"]
    for t in trailers:
        t = t.strip()
        if not t:
            continue
        if ":" not in t:
            raise BootstrapError(f"--trailer は「キー: 値」の形で指定する（指定: {t}）")
        lines.append(t)
    return f"{subject.strip()}\n\n" + "\n".join(lines) + "\n"


def print_state(root: Path) -> None:
    done, nxt = state(root)
    print(f"COMPLETED_STEPS: {' '.join(done)}")
    print(f"NEXT_STEP: {nxt}")


def cmd_state(root: Path, _: argparse.Namespace) -> int:
    print_state(root)
    return 0


def cmd_checkpoint(root: Path, args: argparse.Namespace) -> int:
    step = normalize_step(args.step)
    message = checkpoint_message(args.subject, step, args.trailer or [])
    git(root, ["add", "-A"])
    cmd = ["commit", "-q", "-F", "-"]
    staged = git(root, ["diff", "--cached", "--quiet"], check=False).returncode != 0
    if not staged:
        if not args.allow_empty:
            raise BootstrapError("記録する変更がありません。変更がなくても完了を記録するなら --allow-empty を付ける")
        cmd.append("--allow-empty")
    git(root, cmd, stdin=message)
    head = git(root, ["rev-parse", "--short", "HEAD"]).stdout.strip()
    print(f"CHECKPOINT: {step} {head}")
    print_state(root)
    return 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(prog="bootstrap.py", description="speckit-bootstrap の進捗の記録と読み出し")
    ap.add_argument("--root", default=None, help="リポジトリのルート（省略時はカレントディレクトリから探す）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("state", help="完了済みのステップと次のステップ")
    p = sub.add_parser("checkpoint", help="ステップの完了を記録する（git add -A してコミット）")
    p.add_argument("step", help=" / ".join(STEPS))
    p.add_argument("subject", help="コミットの件名（例: docs(bootstrap): B1 コンセプトを機能に仕分け）")
    p.add_argument("--allow-empty", action="store_true", help="変更がなくても記録する")
    p.add_argument("--trailer", action="append", help="ほかの trailer（例: 'Co-Authored-By: …'）。何度でも指定できる")
    args = ap.parse_args(argv)
    handlers = {"state": cmd_state, "checkpoint": cmd_checkpoint}
    try:
        root = find_root(Path(args.root).expanduser().resolve() if args.root else Path.cwd())
        return handlers[args.cmd](root, args)
    except BootstrapError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
