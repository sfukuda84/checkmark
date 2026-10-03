#!/usr/bin/env python3
"""worktree_helper.py - speckit-feature / speckit-coding / speckit-all 共通の worktree 管理

各フィーチャーを .worktrees/<FEATURE_NAME>（ブランチ feature/<FEATURE_NAME>）で作業し、
ステップ完了ごとのコミットに付けた trailer "Speckit-Step: <STEP>" と "Speckit-Feature: <FEATURE_NAME>" で
進捗を判定する。フィーチャー名付きの trailer は main にマージされた後も残るので、マージ後も進捗を失わない。
プロジェクトのルートから実行しても worktree の中から実行しても同じように動く。
macOS / Linux / Windows で動くように、標準ライブラリだけで書く（Python 3.9 以上）。
"""

from __future__ import annotations

import functools
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

# マージ先のブランチ。main() で resolve_main_branch() の結果に置き換える（ローカルでは従来どおり main）。
MAIN_BRANCH = os.environ.get("SPECKIT_MAIN_BRANCH") or "main"
# Claude Code のクラウドセッション（VM 内では CLAUDE_CODE_REMOTE=true）。push できるのはセッションの作業ブランチだけで、
# VM は回収されると消えるため、マージ先を作業ブランチにし、マージ後に push する。
CLOUD_SESSION = os.environ.get("CLAUDE_CODE_REMOTE") == "true"
# S4-1（画面仕様）は後から足したステップ。既存の番号を変えないよう、S4 と S5 の間に差し込む。
SPEC_STEPS = ["S2", "S3", "S4", "S4-1", "S5", "S6", "S7-1", "S7-2", "S7-3"]
CODING_STEPS = ["S8", "S9", "S10", "S11"]
ALL_STEPS = SPEC_STEPS + CODING_STEPS
# 後から足したステップ。それより後のステップの記録があれば、足したステップも済んだものとみなす
# （足す前に作業を始めた worktree で、済んだ工程に戻らないようにする）。
INSERTED_STEPS = ("S4-1",)


def later_steps(step: str) -> list[str]:
    return ALL_STEPS[ALL_STEPS.index(step) + 1:]
PHASE_STEPS = {"spec": SPEC_STEPS, "coding": CODING_STEPS, "all": ALL_STEPS}
PHASE_LAST_STEP = {"spec": "S7-3", "coding": "S11", "all": "S11"}
# feature.json はローカル状態なので、.gitignore の設定にかかわらずコミットしない。
FEATURE_JSON = ".specify/feature.json"
ORDER_LINE_RE = re.compile(r"\*\*\s*([0-9]+)\.\s*\[[^\]]*\]\(\./([^.)]+)\.md\)")
TRAILER_RE = re.compile(r"^Speckit-Step:\s*(\S+)", re.MULTILINE)
FEATURE_TRAILER_RE = re.compile(r"^Speckit-Feature:\s*(\S+)", re.MULTILINE)
# checkpoint --skipped で、機能の重さに応じて省いたステップ（完了として数える）。
SKIPPED_TRAILER_RE = re.compile(r"^Speckit-Skipped:\s*(\S+)", re.MULTILINE)
# 機能の重さ（docs/feature/<name>.md のヘッダの **重さ**）。欄がなければ 標準。
WEIGHTS = ("軽", "標準", "重")
DEFAULT_WEIGHT = "標準"
WEIGHT_FIELD_RE = re.compile(r"\*\*重さ\*\*:\s*([^|\n]+?)\s*(?:\||$)", re.MULTILINE)
# 重さごとに省いてよいステップ（speckit-worktree の「機能の重さ」の表）。重はどれも省けない。
SKIPPABLE_STEPS = {
    "軽": ("S4", "S4-1", "S7-2", "S7-3", "S11"),
    "標準": ("S4-1", "S7-3"),
    "重": (),
}
MERGE_SUBJECT_RE = re.compile(r"^merge\(([^)]+)\): (spec|coding|all)$", re.MULTILINE)
UNCHECKED_RE = re.compile(r"^[ \t]*- \[ \].*$", re.MULTILINE)
CHECKED_RE = re.compile(r"^[ \t]*- \[[xX]\].*$", re.MULTILINE)
# 人が行うタスクの印（steering の「人が行うタスク」）。未完了でも AI の実装漏れとして扱わない。
HUMAN_MARKER = "[人]"
# 後の段階に回すタスクの印（steering の「後の段階に回すタスク」）。未完了でも finish を止めず、AI の実装漏れとして扱わない。
DEFERRED_MARKER = "[後]"
# ほかの機能の前提として、一部の Phase だけを先にマージしたときの件名（finish --partial）。進捗の判定には使わない。
PARTIAL_SUBJECT_RE = re.compile(r"^merge\(([^)]+)\): partial$", re.MULTILINE)
# 後の段階のタスク（[後]）を、実装までマージ済みの機能で片付ける工程（--phase deferred）。
# 進捗は Speckit-Step とは別の trailer で記録し、もとの機能の completed_steps（S2〜S11）を変えない。
# マージの件名は merge(<name>): deferred で、MERGE_SUBJECT_RE（spec|coding|all）に入らないので進捗の判定に使わない。
DEFERRED_STEPS = ["S8", "S9", "S10", "S11"]
# 後の段階の作業は差分が小さいことが多いので、重さに関わらず省いてよいステップ（S11 は S10 で CRITICAL・HIGH が 0 件のとき）。
DEFERRED_SKIPPABLE = ("S11",)
DEFERRED_SUFFIX = "-deferred"
DEFERRED_STEP_RE = re.compile(r"^Speckit-Deferred-Step:\s*(\S+)", re.MULTILINE)
DEFERRED_TARGETS_RE = re.compile(r"^Speckit-Deferred-Targets:\s*(.+)$", re.MULTILINE)
DEFERRED_RUN_RE = re.compile(r"^Speckit-Deferred-Run:\s*(\S+)", re.MULTILINE)
DEFERRED_SUBJECT_RE = re.compile(r"^merge\(([^)]+)\): deferred$", re.MULTILINE)
TASK_ID_RE = re.compile(r"^[ \t]*- \[([ xX])\] (T[0-9]+)\b")
# 作業中のメモ（feature ブランチだけに置き、finish で消す）と、落とし穴の受け箱（上限つき）。
HANDOVER_FILE = "handover.md"
HANDOVER_MAX_LINES = 30
HANDOVER_BASE_RE = re.compile(r"^基準コミット:\s*`?([0-9a-f]{7,40})`?", re.MULTILINE)
PITFALLS_FILE = "docs/pitfalls.md"
PITFALLS_MAX_ITEMS = 10
PITFALLS_MAX_FEATURES = 3
PITFALL_HEADING_RE = re.compile(r"^###\s+(P-[0-9]{8}-[0-9]+)\b", re.MULTILINE)
PITFALL_RECORDED_RE = re.compile(r"^\s*-\s*\*\*記録\*\*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", re.MULTILINE)
PITFALL_KEPT_RE = re.compile(r"^\s*-\s*\*\*据え置き\*\*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", re.MULTILINE)
# プロジェクトの開発コマンドの正本（commands set が作る。scaffold には置かないので update の対象にならない）。
COMMANDS_FILE = ".specify/commands.json"
# 決まった名前のコマンド。ほかの名前も set できる
COMMAND_KEYS = ("test", "lint", "typecheck", "build", "e2e", "dev")
STEERING_FILES = (".kiro/steering/language.md", ".kiro/steering/spec-driven-development.md")
AGENT_SKILL_DIRS = (".claude/skills", ".agents/skills", ".kiro/skills")
COMMIT_SEP = "\x1e"
# 機能ファイルの状態欄（speckit-concept-2-feature の様式）
STATUS_SPECIFIED = "spec化済み（specs/{name}）"
STATUS_DONE = "完了"
STATUS_HUMAN_PENDING = "人の作業待ち（specs/{name}）"
STATUS_DONE_DEFERRED = "完了（後の作業 {count} 件）"
NEW_FEATURE_RE = re.compile(r"^[0-9]{3}-[a-z0-9][a-z0-9-]*$")
STATUS_FIELD_RE = re.compile(r"\*\*状態\*\*:\s*([^|\n]+?)\s*(?:\||$)", re.MULTILINE)
# Spec Kit を使う前に実装した機能の状態欄（specs/ を持たない）
LEGACY_DONE_PREFIXES = ("実装済み", STATUS_DONE)

REPO_ROOT: Path = Path()
WORKTREES_DIR: Path = Path()


class HelperError(Exception):
    """終了コード 1 で終わるエラー。"""


class Precondition(Exception):
    """前提条件を満たさないときの停止。スキル側で案内を出すため終了コード 3 で終わる。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def info(message: str) -> None:
    print(message, file=sys.stderr)


def run_git(args: list[str], cwd: Path | None = None, check: bool = True,
            quiet: bool = False) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd or REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and proc.returncode != 0:
        if not quiet:
            sys.stderr.write(proc.stdout)
            sys.stderr.write(proc.stderr)
        raise HelperError(f"git {' '.join(args)} が失敗しました（終了コード {proc.returncode}）。")
    return proc


def git_out(args: list[str], cwd: Path | None = None) -> str:
    return run_git(args, cwd=cwd).stdout.strip()


def git_ok(args: list[str], cwd: Path | None = None) -> bool:
    return run_git(args, cwd=cwd, check=False).returncode == 0


def git_passthrough(args: list[str], cwd: Path | None = None) -> None:
    """git の出力を stderr に流しながら実行する（進行状況の表示用）。"""
    proc = run_git(args, cwd=cwd, check=False)
    sys.stderr.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        raise HelperError(f"git {' '.join(args)} が失敗しました（終了コード {proc.returncode}）。")


def find_repo_root() -> Path:
    """worktree の中から実行しても、メインの作業ツリーのルートを返す。

    - メインの作業ツリーの中なら、その最上位（--show-toplevel）。.git がファイルになっている
      submodule や --separate-git-dir のリポジトリでも正しく求められる。
    - このスクリプトが作った worktree（<ルート>/.worktrees/<名前>）の中なら、その 2 つ上。
    - それ以外の worktree の中なら、git worktree list の先頭。
    """
    def rev_parse(*args: str) -> str:
        proc = subprocess.run(["git", "rev-parse", *args], capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise HelperError("Git リポジトリの中で実行してください。")
        return proc.stdout.strip()

    toplevel = Path(rev_parse("--show-toplevel")).resolve()
    git_dir = Path(rev_parse("--absolute-git-dir")).resolve()
    common = Path(rev_parse("--git-common-dir"))
    common = (common if common.is_absolute() else Path.cwd() / common).resolve()
    if git_dir == common:
        return toplevel
    if toplevel.parent.name == ".worktrees":
        return toplevel.parent.parent
    proc = subprocess.run(["git", "worktree", "list", "--porcelain"], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    for line in proc.stdout.splitlines():
        if line.startswith("worktree "):
            return Path(line[len("worktree "):]).resolve()
    raise HelperError("メインの作業ツリーを特定できません。")


def resolve_main_branch() -> str:
    """マージ先のブランチ。SPECKIT_MAIN_BRANCH、クラウドセッションの作業ブランチ、main の順に決める。

    クラウドセッションでは、メインの作業ツリーが今いるブランチ（セッションの作業ブランチ）をマージ先にする。
    detached HEAD やフィーチャーのブランチにいるときは作業ブランチを判定できないので、main に戻す。
    """
    explicit = os.environ.get("SPECKIT_MAIN_BRANCH")
    if explicit:
        return explicit
    if CLOUD_SESSION:
        current = run_git(["rev-parse", "--abbrev-ref", "HEAD"], check=False).stdout.strip()
        if current and current != "HEAD" and not current.startswith("feature/"):
            return current
    return "main"


def push_after_merge() -> None:
    """クラウドセッションで、マージ先のブランチを origin に push する（VM が回収されてもマージの結果を残すため）。"""
    if not CLOUD_SESSION:
        return
    if not git_ok(["remote", "get-url", "origin"]):
        print("PUSH_SKIPPED: origin がありません")
        return
    proc = run_git(["push", "-u", "origin", MAIN_BRANCH], check=False)
    if proc.returncode == 0:
        print(f"PUSHED: origin/{MAIN_BRANCH}")
    else:
        # クラウドセッションでは作業ブランチ以外への push は拒否される。マージ自体は済んでいるので止めない。
        info(proc.stderr.strip())
        print(f"PUSH_FAILED: origin/{MAIN_BRANCH}（クラウドセッションで push できるのは作業ブランチだけ）")


def branch_of(name: str) -> str:
    return f"feature/{name}"


def worktree_of(name: str) -> Path:
    return WORKTREES_DIR / name


def branch_exists(name: str) -> bool:
    return git_ok(["rev-parse", "--verify", "-q", f"refs/heads/{branch_of(name)}"])


def main_has_file(name: str, filename: str) -> bool:
    return git_ok(["cat-file", "-e", f"{MAIN_BRANCH}:specs/{name}/{filename}"])


def main_has_tasks(name: str) -> bool:
    return main_has_file(name, "tasks.md")


def main_has_all_artifacts(name: str) -> bool:
    return all(main_has_file(name, f) for f in ("spec.md", "plan.md", "tasks.md"))


# history() が読みながら集める、フィーチャーごとの省いたステップ（ref をまたいでまとめる）。
_SKIPPED: dict[str, set[str]] = {}


def skipped_steps(name: str) -> list[str]:
    """checkpoint --skipped で省いたステップ（main とブランチの履歴から）。"""
    history(MAIN_BRANCH)
    if branch_exists(name):
        history(branch_of(name))
    found = _SKIPPED.get(name, set())
    return [step for step in ALL_STEPS if step in found]


@functools.lru_cache(maxsize=None)
def history(ref: str) -> tuple[dict[str, frozenset], frozenset]:
    """ref から辿れる全コミットを読み、(フィーチャーごとの完了ステップ, 実装までマージ済みのフィーチャー) を返す。"""
    proc = run_git(["log", ref, f"--format=%B{COMMIT_SEP}"], check=False)
    steps: dict[str, set[str]] = {}
    merged: set[str] = set()
    if proc.returncode == 0:
        for body in proc.stdout.split(COMMIT_SEP):
            feature = FEATURE_TRAILER_RE.search(body)
            if feature:
                steps.setdefault(feature.group(1), set()).update(TRAILER_RE.findall(body))
                _SKIPPED.setdefault(feature.group(1), set()).update(SKIPPED_TRAILER_RE.findall(body))
            for name, phase in MERGE_SUBJECT_RE.findall(body):
                if phase in ("coding", "all"):
                    merged.add(name)
    return {k: frozenset(v) for k, v in steps.items()}, frozenset(merged)


@functools.lru_cache(maxsize=None)
def partial_merges(ref: str) -> frozenset:
    """finish --partial で一部だけを ref にマージしたフィーチャー。"""
    proc = run_git(["log", ref, "--format=%s"], check=False)
    return frozenset(PARTIAL_SUBJECT_RE.findall(proc.stdout)) if proc.returncode == 0 else frozenset()


def forget_history() -> None:
    """コミットやマージで履歴が変わった後に呼ぶ。"""
    history.cache_clear()
    partial_merges.cache_clear()
    _SKIPPED.clear()
    main_tasks_text.cache_clear()
    branch_features.cache_clear()


def tasks_all_done(text: str) -> bool:
    """完了したタスクがあり、未完了が人のタスクだけか。"""
    return bool(CHECKED_RE.search(text)) and not split_unchecked(text)[0]


def coding_done(name: str) -> bool:
    """実装工程まで main にマージ済みか。

    main 上の S11 の記録か、merge(<name>): coding|all のコミットで判定する。これらの記録がない、Pull Request などで
    取り込んだフィーチャーは、main の tasks.md の AI のタスクがすべて完了していれば実装済みとみなす。
    """
    steps, merged = history(MAIN_BRANCH)
    return "S11" in steps.get(name, frozenset()) or name in merged or tasks_all_done(main_tasks_text(name))


def split_unchecked(text: str) -> tuple[list[str], list[str]]:
    """未完了のタスク行を (AI のタスク, 人のタスク) に分けて返す。後の段階に回したタスク（[後]）はどちらにも入れない。"""
    ai: list[str] = []
    human: list[str] = []
    for line in UNCHECKED_RE.findall(text):
        if HUMAN_MARKER in line:
            human.append(line.strip())
        elif DEFERRED_MARKER not in line:
            ai.append(line.strip())
    return ai, human


def split_deferred(text: str) -> list[str]:
    """未完了の、後の段階に回したタスク（[後]。[人] でもあるものは人のタスクとして数えるので除く）。"""
    return [line.strip() for line in UNCHECKED_RE.findall(text)
            if DEFERRED_MARKER in line and HUMAN_MARKER not in line]


def unchecked_tasks(tasks_file: Path) -> tuple[list[str], list[str]]:
    if not tasks_file.is_file():
        return [], []
    return split_unchecked(tasks_file.read_text(encoding="utf-8"))


@functools.lru_cache(maxsize=None)
def main_tasks_text(name: str) -> str:
    proc = run_git(["show", f"{MAIN_BRANCH}:specs/{name}/tasks.md"], check=False)
    return proc.stdout if proc.returncode == 0 else ""


def deferred_tasks(tasks_file: Path) -> list[str]:
    if not tasks_file.is_file():
        return []
    return split_deferred(tasks_file.read_text(encoding="utf-8"))


def status_after_coding(name: str, tasks_file: Path) -> str:
    """実装を終えた後の状態。人のタスクが残っていれば 人の作業待ち、後の段階のタスクだけなら 完了（後の作業 N 件）、
    どちらもなければ 完了。"""
    _, human = unchecked_tasks(tasks_file)
    if human:
        return STATUS_HUMAN_PENDING.format(name=name)
    deferred = deferred_tasks(tasks_file)
    return STATUS_DONE_DEFERRED.format(count=len(deferred)) if deferred else STATUS_DONE


def completed_steps(name: str, infer: bool = True) -> list[str]:
    """完了済みのステップ。infer が False なら、後から足したステップの推定（INSERTED_STEPS）をしない。

    - main とブランチの全履歴にある、このフィーチャー名付きの trailer
    - ブランチ上の main にないコミットの trailer（フィーチャー名がない旧形式も含む）
    - 仕様が main にマージ済み（tasks.md がある）なら S2〜S7-3
    - 実装まで main にマージ済みなら全ステップ
    """
    found: set[str] = set(history(MAIN_BRANCH)[0].get(name, frozenset()))
    if branch_exists(name):
        found.update(history(branch_of(name))[0].get(name, frozenset()))
        log = git_out(["log", f"{MAIN_BRANCH}..{branch_of(name)}", "--format=%B"])
        found.update(TRAILER_RE.findall(log))
    if main_has_tasks(name):
        found.update(SPEC_STEPS)
    if coding_done(name):
        found.update(ALL_STEPS)
    if infer:
        for step in INSERTED_STEPS:
            if step not in found and found.intersection(later_steps(step)):
                found.add(step)
    return [step for step in ALL_STEPS if step in found]


def next_step(name: str, phase: str) -> str:
    done = set(completed_steps(name))
    for step in PHASE_STEPS[phase]:
        if step not in done:
            return step
    return "S12"


@functools.lru_cache(maxsize=None)
def branch_features() -> frozenset:
    """worktree を使わずに作業しているフィーチャー（Spec Kit 標準の命名 NNN-slug のローカルブランチで、
    specs/<NNN-slug>/spec.md があり、specs/<NNN-slug>/ を変えたコミットが main にまだ取り込まれていないもの）。

    main に spec.md だけを先に取り込み、ブランチで tasks.md と実装を進めている場合も含める。main と同じ位置の
    ブランチ（取り込み済み）は含めない。"""
    found: set[str] = set()
    for branch in git_out(["for-each-ref", "--format=%(refname:short)", "refs/heads/"]).splitlines():
        if (NEW_FEATURE_RE.match(branch) and branch != MAIN_BRANCH
                and git_ok(["cat-file", "-e", f"{branch}:specs/{branch}/spec.md"])
                and git_out(["rev-list", "--count", f"{MAIN_BRANCH}..{branch}", "--", f"specs/{branch}"]) != "0"):
            found.add(branch)
    return frozenset(found)


def branch_tasks_text(name: str) -> str:
    """branch_features のフィーチャーの tasks.md。今そのブランチにいるときは、コミット前の変更も含めて読む。"""
    if git_out(["rev-parse", "--abbrev-ref", "HEAD"]) == name:
        path = REPO_ROOT / "specs" / name / "tasks.md"
        return path.read_text(encoding="utf-8") if path.is_file() else ""
    proc = run_git(["show", f"{name}:specs/{name}/tasks.md"], check=False)
    return proc.stdout if proc.returncode == 0 else ""


def feature_file_status(name: str) -> str:
    """docs/feature/ の機能ファイルの状態欄（main を優先し、なければ作業ツリー）。ファイルがなければ空文字。"""
    slug = name.split("-", 1)[1] if re.match(r"^[0-9]{3}-", name) else name
    for filename in (f"{name}.md", f"{slug}.md"):
        proc = run_git(["show", f"{MAIN_BRANCH}:docs/feature/{filename}"], check=False)
        path = REPO_ROOT / "docs" / "feature" / filename
        text = proc.stdout if proc.returncode == 0 else (path.read_text(encoding="utf-8") if path.is_file() else "")
        m = STATUS_FIELD_RE.search(text)
        if m:
            return m.group(1).strip()
    return ""


def feature_file_weight(name: str, wt: Path | None = None) -> str:
    """機能ファイルの重さ（軽 / 標準 / 重）。worktree があればそちらを優先し、欄がなければ 標準。"""
    slug = name.split("-", 1)[1] if re.match(r"^[0-9]{3}-", name) else name
    for filename in (f"{name}.md", f"{slug}.md"):
        texts = []
        if wt is not None and (wt / "docs" / "feature" / filename).is_file():
            texts.append((wt / "docs" / "feature" / filename).read_text(encoding="utf-8"))
        proc = run_git(["show", f"{MAIN_BRANCH}:docs/feature/{filename}"], check=False)
        if proc.returncode == 0:
            texts.append(proc.stdout)
        path = REPO_ROOT / "docs" / "feature" / filename
        if path.is_file():
            texts.append(path.read_text(encoding="utf-8"))
        for text in texts:
            m = WEIGHT_FIELD_RE.search(text)
            if m:
                value = m.group(1).strip()
                return value if value in WEIGHTS else DEFAULT_WEIGHT
    return DEFAULT_WEIGHT


def resolve_weight(name: str, override: str | None, wt: Path | None = None) -> str:
    if override is not None:
        if override not in WEIGHTS:
            raise HelperError(f"--weight は {' / '.join(WEIGHTS)} のいずれかにしてください（指定: {override}）。")
        return override
    return feature_file_weight(name, wt)


def implemented_without_spec(name: str) -> bool:
    """Spec Kit を使う前に実装された機能か（specs/ を持たず、機能ファイルの状態欄が 実装済み か 完了）。"""
    if (main_has_file(name, "spec.md") or worktree_of(name).is_dir() or branch_exists(name)
            or name in branch_features()):
        return False
    return feature_file_status(name).startswith(LEGACY_DONE_PREFIXES)


def read_spec_order() -> str:
    proc = run_git(["show", f"{MAIN_BRANCH}:docs/feature/spec_order.md"], check=False)
    if proc.returncode == 0:
        return proc.stdout
    path = REPO_ROOT / "docs" / "feature" / "spec_order.md"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return ""


def get_all_features() -> list[str]:
    """フィーチャー名を着手順に並べて返す。

    docs/feature/spec_order.md（任意）にあるものはその並び順（着手順の正本）で先に置き、
    そこにない main の specs/ と .worktrees/ のもの、worktree を使わずに作業しているブランチのもの（branch_features）は
    番号順で後ろに足す。
    """
    ordered: list[str] = []
    for match in ORDER_LINE_RE.finditer(read_spec_order()):
        num, slug = match.group(1), match.group(2)
        # 新形式はファイル名が NNN-slug で、そのまま specs/ の名前になる。旧形式は slug だけなので番号を付ける。
        name = slug if re.match(r"^[0-9]{3}-", slug) else f"{int(num):03d}-{slug}"
        if name not in ordered:
            ordered.append(name)
    rest: set[str] = set()
    proc = run_git(["ls-tree", "-d", "--name-only", MAIN_BRANCH, "specs/"], check=False)
    if proc.returncode == 0:
        for line in proc.stdout.splitlines():
            if line.startswith("specs/"):
                rest.add(line[len("specs/"):])
    if WORKTREES_DIR.is_dir():
        for child in WORKTREES_DIR.iterdir():
            # 後の段階の作業の worktree（<name>-deferred）は、フィーチャーとして数えない
            if child.is_dir() and not child.name.endswith(DEFERRED_SUFFIX):
                rest.add(child.name)
    rest.update(branch_features())
    return ordered + sorted(n for n in rest if n and n not in ordered)


def resolve_feature(query: str | None) -> str:
    """短い番号（1, 002）、スラッグ、完全名（001-todo-cli）、ファイルパスからフィーチャー名を決める。"""
    if not query:
        raise HelperError("フィーチャーを指定してください。")
    query = Path(query.replace("\\", "/")).name
    if query.endswith(".md"):
        query = query[:-3]
    padded = f"{int(query):03d}" if query.isdigit() else query

    matches: list[str] = []
    for feat in get_all_features():
        if feat == query:
            return feat
        if feat.startswith(f"{padded}-") or feat.endswith(f"-{query}"):
            matches.append(feat)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise HelperError(f"'{query}' に一致するフィーチャーが複数あります: {' '.join(matches)}")
    # 一覧にない新しいフィーチャーは、完全名（NNN-slug）で指定されたときだけ受け付ける。
    if NEW_FEATURE_RE.match(query):
        number, slug = query.split("-", 1)
        if re.fullmatch(r"[0-9-]+", slug):
            raise HelperError(
                f"'{query}' は範囲指定に見えます。範囲は list の結果から 1 件ずつ選び、完全名か番号で指定してください。")
        taken = [f for f in get_all_features() if f.startswith(f"{number}-")]
        if taken:
            raise HelperError(
                f"番号 {number} はすでに {' '.join(taken)} が使っています。綴りを確かめるか、別の番号にしてください。")
        return query
    raise HelperError(
        f"'{query}' に一致するフィーチャーが見つかりません（docs/feature/spec_order.md、specs/、.worktrees/ を検索）。"
        "新しいフィーチャーは 001-short-name の形の完全名で指定してください。"
    )


def stage_all(worktree: Path) -> None:
    run_git(["add", "-A"], cwd=worktree)
    run_git(["reset", "-q", "--", FEATURE_JSON], cwd=worktree, check=False)


def worktree_branch(worktree: Path) -> str | None:
    proc = run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=worktree, check=False)
    return proc.stdout.strip() if proc.returncode == 0 else None


def update_feature_status(wt: Path, name: str, status: str, only_from: tuple[str, ...] = ()) -> list[str]:
    """docs/feature/ の機能ファイルの状態欄と、README.md の一覧の状態列を status にする。更新したファイルを返す。

    only_from を指定したときは、今の状態がそのいずれかの場合だけ更新する（状態を後戻りさせないため）。
    機能ファイルがないプロジェクトでは何もしない。
    """
    feature_dir = wt / "docs" / "feature"
    slug = name.split("-", 1)[1] if re.match(r"^[0-9]{3}-", name) else name
    target = next((p for p in (feature_dir / f"{name}.md", feature_dir / f"{slug}.md") if p.is_file()), None)
    if target is None:
        return []
    changed: list[str] = []
    text = target.read_text(encoding="utf-8")
    m = re.search(r"(\*\*状態\*\*:\s*)([^|\n]+?)(\s*\|)", text)
    if m is None:
        return []
    current = m.group(2).strip()
    if current == status or (only_from and not any(current.startswith(p) for p in only_from)):
        return []
    with open(target, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text[:m.start(2)] + status + text[m.end(2):])
    changed.append(str(target.relative_to(wt)))
    readme = feature_dir / "README.md"
    if readme.is_file():
        lines = readme.read_text(encoding="utf-8").split("\n")
        row_re = re.compile(r"^\|\s*\d+\s*\|\s*\[[^\]]*\]\(\./" + re.escape(target.stem) + r"\.md\)\s*\|")
        updated = False
        for i, line in enumerate(lines):
            if row_re.match(line):
                cells = line.split("|")
                # ['', ' # ', ' 機能 ', ' 区分 ', ' 状態 ', ' 依存 ', ' 一言 ', '']
                if len(cells) > 5:
                    cells[4] = f" {status} "
                    lines[i] = "|".join(cells)
                    updated = True
        if updated:
            with open(readme, "w", encoding="utf-8", newline="\n") as handle:
                handle.write("\n".join(lines))
            changed.append(str(readme.relative_to(wt)))
    return changed


def print_state(name: str, phase: str, wt_state: str, weight: str = DEFAULT_WEIGHT) -> None:
    print(f"REPO_ROOT: {REPO_ROOT}")
    print(f"FEATURE_NAME: {name}")
    print(f"BRANCH: {branch_of(name)}")
    print(f"WORKTREE_DIR: {worktree_of(name)}")
    print(f"WORKTREE_STATE: {wt_state}")
    print(f"PHASE: {phase}")
    print(f"WEIGHT: {weight}")
    done = completed_steps(name)
    print(f"COMPLETED_STEPS: {' '.join(done)}")
    print(f"NEXT_STEP: {next_step(name, phase)}")
    skipped = skipped_steps(name)
    if skipped:
        print(f"SKIPPED_STEPS: {' '.join(skipped)}")
    missing = missing_artifacts(name, phase, done, skipped)
    if missing:
        print(f"MISSING_ARTIFACTS: {' '.join(missing)}")


def project_has_no_ui(root: Path) -> bool:
    """docs/design/DESIGN.md の対象が「UI なし」のプロジェクトか。"""
    design = root / "docs" / "design" / "DESIGN.md"
    return design.is_file() and bool(re.search(r"\*\*対象\*\*:\s*UI なし", design.read_text(encoding="utf-8")))


def missing_artifacts(name: str, phase: str, done: list[str], skipped: list[str]) -> list[str]:
    """実装工程（coding・all）で、仕様工程は済んでいるのに実装の前に要る成果物が欠けていれば、その名前を返す。

    いまは ui.md（S4-1 の画面仕様）だけを見る。S4-1 を足す前に仕様化した機能（S4-1 は推定で済んだ扱い）に多い。
    S4-1 を --skipped で省いた機能、「UI なし」のプロジェクト、S8 を終えた機能（実装の後にさかのぼって作らない）は対象にしない。
    """
    if phase not in ("coding", "all") or "S7-3" not in done or "S8" in done or "S4-1" in skipped:
        return []
    wt = worktree_of(name)
    root = wt if wt.is_dir() else REPO_ROOT
    if project_has_no_ui(root):
        return []
    return [] if (root / "specs" / name / "ui.md").is_file() else ["ui.md"]


def parse_args(args: list[str]) -> tuple[str | None, str | None, list[str]]:
    """(最初の位置引数, --phase の値, その他のフラグ) を返す。"""
    positional: str | None = None
    phase: str | None = None
    flags: list[str] = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--phase":
            phase = args[i + 1] if i + 1 < len(args) else ""
            i += 2
            continue
        if arg in VALUE_FLAGS:  # 値を取るフラグ。値は flag_value で読む
            i += 2
            continue
        if arg.startswith("--phase="):
            phase = arg[len("--phase="):]
        elif arg.startswith("--"):
            flags.append(arg)
        elif positional is None:
            positional = arg
        i += 1
    return positional, phase, flags


# 値を取るフラグ（`--name value` の形）
VALUE_FLAGS = ("--skip", "--weight", "--skipped", "--tasks")


def flag_value(args: list[str], name: str) -> str | None:
    """`--name value` か `--name=value` の値。なければ None。"""
    for i, arg in enumerate(args):
        if arg == name:
            return args[i + 1] if i + 1 < len(args) else ""
        if arg.startswith(name + "="):
            return arg[len(name) + 1:]
    return None


def positionals(args: list[str]) -> list[str]:
    """フラグとその値を除いた位置引数。"""
    out: list[str] = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--phase" or arg in VALUE_FLAGS:
            i += 2
            continue
        if not arg.startswith("--"):
            out.append(arg)
        i += 1
    return out


def require_phase(phase: str | None, allow_deferred: bool = False) -> str:
    if not phase:
        raise HelperError(f"--phase spec|coding|all{'|deferred' if allow_deferred else ''} を指定してください。")
    if allow_deferred and phase == "deferred":
        return phase
    if phase not in PHASE_STEPS:
        raise HelperError(f"--phase には spec / coding / all{' / deferred' if allow_deferred else ''} のいずれかを指定してください"
                          f"（指定値: '{phase}'）。")
    return phase


def check_phase_precondition(name: str, phase: str, wt: Path) -> None:
    done = completed_steps(name)
    if phase == "spec":
        if not wt.is_dir() and main_has_tasks(name):
            raise Precondition(
                "ALREADY_SPECIFIED",
                f"{name} の仕様（tasks.md）はすでに {MAIN_BRANCH} にマージされています。実装は speckit-coding で行ってください。",
            )
        if "S8" in done:
            raise Precondition(
                "CODING_IN_PROGRESS",
                f"{name} の worktree はすでに実装工程に入っています。speckit-coding または speckit-all で再開してください。",
            )
    elif phase == "coding":
        if "S7-3" not in done:
            if wt.is_dir() or branch_exists(name):
                raise Precondition(
                    "SPEC_INCOMPLETE",
                    f"{name} の仕様工程（S2〜S7-3）が終わっていません（次: {next_step(name, 'spec')}）。"
                    "speckit-feature または speckit-all で再開してください。",
                )
            raise Precondition(
                "SPEC_MISSING",
                f"{name} の spec.md / plan.md / tasks.md が {MAIN_BRANCH} にも worktree にもありません。"
                "先に speckit-feature または speckit-all を実行してください。",
            )
        if not wt.is_dir() and not main_has_all_artifacts(name):
            raise Precondition(
                "SPEC_MISSING",
                f"{name} の spec.md / plan.md / tasks.md が {MAIN_BRANCH} にそろっていません。"
                "先に speckit-feature または speckit-all を実行してください。",
            )
    if phase != "spec" and not wt.is_dir() and not branch_exists(name) and coding_done(name):
        hint = (f"残っている {DEFERRED_MARKER} のタスクは --phase deferred で片付ける。"
                if split_deferred(main_tasks_text(name)) else "")
        raise Precondition("ALREADY_IMPLEMENTED", f"{name} は実装まで {MAIN_BRANCH} にマージ済みです。{hint}")


def repo_is_dirty() -> bool:
    return bool(git_out(["status", "--porcelain"]))


def cmd_ensure(args: list[str]) -> None:
    positional, phase, _ = parse_args(args)
    phase = require_phase(phase, allow_deferred=True)
    name = resolve_feature(positional)
    weight_override = flag_value(args, "--weight")
    if phase == "deferred":
        deferred_ensure(name, flag_value(args, "--tasks"), weight_override)
        return
    if weight_override is not None:
        resolve_weight(name, weight_override)  # worktree を作る前に値を確かめる
    branch = branch_of(name)
    wt = worktree_of(name)

    run_git(["worktree", "prune"])
    check_phase_precondition(name, phase, wt)

    if wt.is_dir():
        current = worktree_branch(wt)
        if current is None:
            raise HelperError(f"{wt} は Git の worktree ではありません。手動で確認してください。")
        if current != branch:
            raise HelperError(f"{wt} のブランチが '{current}' です（期待値: '{branch}'）。手動で確認してください。")
        wt_state = "reused"
    else:
        if not git_ok(["check-ignore", "-q", ".worktrees/"]):
            raise HelperError(
                ".worktrees/ が .gitignore に登録されていません。"
                ".gitignore に '.worktrees/' を追加してコミットしてから再実行してください。"
            )
        if repo_is_dirty():
            info(git_out(["status", "--short"]))
            raise HelperError(f"{REPO_ROOT} に未コミットの変更があります。コミットまたは stash してから再実行してください。")
        WORKTREES_DIR.mkdir(parents=True, exist_ok=True)
        if branch_exists(name):
            info(f"==> 既存のブランチ {branch} に worktree を作り直します: {wt}")
            git_passthrough(["worktree", "add", str(wt), branch])
            wt_state = "reattached"
        else:
            info(f"==> {MAIN_BRANCH} から {branch} と worktree を作成します: {wt}")
            git_passthrough(["worktree", "add", "-b", branch, str(wt), MAIN_BRANCH])
            wt_state = "created"

    # feature.json は speckit の各スキルが対象ディレクトリの特定に使う。
    (wt / ".specify").mkdir(parents=True, exist_ok=True)
    (wt / "specs" / name).mkdir(parents=True, exist_ok=True)
    # Windows でも LF で書く（Path.write_text の newline 引数は 3.10 以降のため open を使う）。
    with open(wt / FEATURE_JSON, "w", encoding="utf-8", newline="\n") as handle:
        handle.write('{\n  "feature_directory": "specs/%s"\n}\n' % name)
    print_state(name, phase, wt_state, resolve_weight(name, weight_override, wt))


def cmd_state(args: list[str]) -> None:
    positional, phase, _ = parse_args(args)
    phase = require_phase(phase, allow_deferred=True)
    name = resolve_feature(positional)
    if phase == "deferred":
        dwt = deferred_worktree_of(name)
        print_deferred_state(name, "present" if dwt.is_dir() else "absent",
                             resolve_weight(name, flag_value(args, "--weight"), dwt if dwt.is_dir() else None))
        return
    wt = worktree_of(name)
    print_state(name, phase, "present" if wt.is_dir() else "absent",
                resolve_weight(name, flag_value(args, "--weight"), wt if wt.is_dir() else None))


def cmd_checkpoint(args: list[str]) -> None:
    pos = positionals(args)
    if len(pos) < 3:
        raise HelperError('使い方: checkpoint <feature> <step> <subject> [--skipped "<理由>" [--force]] [--weight 軽|標準|重]')
    name = resolve_feature(pos[0])
    step, subject = pos[1], pos[2]
    skipped_reason = flag_value(args, "--skipped")
    if parse_args(args)[1] == "deferred":
        deferred_checkpoint(name, step, subject, skipped_reason, "--force" in args)
        return
    if step not in ALL_STEPS:
        raise HelperError(f"ステップ '{step}' は不正です（有効値: {' '.join(ALL_STEPS)}）。")
    wt = worktree_of(name)
    if not wt.is_dir():
        raise HelperError(f"worktree {wt} がありません。先に ensure を実行してください。")
    current = worktree_branch(wt)
    if current != branch_of(name):
        raise HelperError(f"{wt} のブランチが '{current}' です。")
    if skipped_reason is not None:
        if not skipped_reason.strip():
            raise HelperError("--skipped には省いた理由を書いてください（例: --skipped \"軽: clarify は 1 回\"）。")
        weight = resolve_weight(name, flag_value(args, "--weight"), wt)
        if step not in SKIPPABLE_STEPS[weight] and "--force" not in args:
            allowed = " ".join(SKIPPABLE_STEPS[weight]) or "なし"
            raise HelperError(f"重さ「{weight}」では {step} を省けません（省けるステップ: {allowed}）。"
                              "どうしても省くなら、理由を確かめたうえで --force を付けてください。")
    # 後から足したステップを飛ばして、その次のステップを記録しようとしたら止める。
    # 推定で済んだとみなすのは、足す前に後のステップまで進んでいた worktree だけにする。
    recorded = set(completed_steps(name, infer=False))
    for inserted in INSERTED_STEPS:
        later = later_steps(inserted)
        if step == later[0] and inserted not in recorded and not recorded.intersection(later):
            raise HelperError(f"{inserted} が記録されていません。{inserted} を終えて記録してから {step} を記録してください。")

    # 機能ファイルの状態欄を進める（仕様を作ったら spec化済み、実装を終えたら 完了。人のタスクが残れば 人の作業待ち）
    if step == "S2":
        for path in update_feature_status(wt, name, STATUS_SPECIFIED.format(name=name), only_from=("未着手",)):
            info(f"==> 状態を更新しました: {path}")
    elif step == "S11":
        status = status_after_coding(name, wt / "specs" / name / "tasks.md")
        for path in update_feature_status(wt, name, status):
            info(f"==> 状態を更新しました: {path}")

    stage_all(wt)
    trailers = f"Speckit-Step: {step}\nSpeckit-Feature: {name}"
    if skipped_reason is not None:
        trailers += f"\nSpeckit-Skipped: {step} {' '.join(skipped_reason.split())}"
    run_git(["commit", "-q", "--allow-empty", "-m", subject, "-m", trailers], cwd=wt)
    forget_history()
    print(f"CHECKPOINT: {step} {git_out(['rev-parse', '--short', 'HEAD'], cwd=wt)}"
          + ("（省略）" if skipped_reason is not None else ""))
    print(f"NEXT_STEP: {next_step(name, 'all')}")


def cmd_finish(args: list[str]) -> None:
    positional, phase, flags = parse_args(args)
    phase = require_phase(phase, allow_deferred=True)
    name = resolve_feature(positional)
    if phase == "deferred":
        deferred_finish(name, flags)
        return
    branch = branch_of(name)
    wt = worktree_of(name)
    partial = "--partial" in flags
    if partial and phase == "spec":
        raise HelperError("--partial は coding か all の工程でだけ使えます（仕様の一部だけをマージしない）。")

    if not wt.is_dir():
        raise HelperError(f"worktree {wt} がありません。")
    # worktree の中で実行すると、削除後にシェルが消えたディレクトリに残る（Windows では削除自体が失敗する）
    cwd = Path.cwd().resolve()
    if cwd == wt.resolve() or wt.resolve() in cwd.parents:
        raise HelperError(f"finish は worktree の外（{REPO_ROOT}）で実行してください。`cd {REPO_ROOT}` してから再実行します。")
    done = completed_steps(name)
    # --partial でも、仕様工程（S2〜S7-3）は済んでいることを求める（一部をマージした後の実装は main の仕様に従うため）
    missing = [step for step in (SPEC_STEPS if partial else PHASE_STEPS[phase]) if step not in done]
    if missing:
        hint = "" if partial else "ほかの機能の前提として一部の Phase だけを先にマージするなら --partial を付ける。"
        raise HelperError(f"{'仕様' if partial else phase} 工程のステップが完了していません（未完了: {' '.join(missing)}）。{hint}")
    for filename in ("spec.md", "plan.md", "tasks.md"):
        if not (wt / "specs" / name / filename).is_file():
            raise HelperError(f"{wt / 'specs' / name / filename} がありません。")
    human_pending: list[str] = []
    deferred_pending: list[str] = []
    if phase in ("coding", "all") and not partial:
        remaining, human_pending = unchecked_tasks(wt / "specs" / name / "tasks.md")
        deferred_pending = deferred_tasks(wt / "specs" / name / "tasks.md")
        if remaining and "--allow-unchecked" not in flags:
            raise Precondition(
                "UNCHECKED_TASKS",
                f"{name} の tasks.md に未完了のタスク（{HUMAN_MARKER}・{DEFERRED_MARKER} 以外）が {len(remaining)} 件あります。"
                "一覧をユーザーに示し、残したままマージしてよいと確認できたら --allow-unchecked を付けて再実行してください。\n"
                + "\n".join(remaining),
            )

    drop_handover(wt, name, f"Speckit-Feature: {name}")
    stage_all(wt)
    if not git_ok(["diff", "--cached", "--quiet"], cwd=wt):
        if "--commit-leftovers" not in flags:
            files = git_out(["diff", "--cached", "--name-status"], cwd=wt)
            run_git(["reset", "-q"], cwd=wt)
            raise Precondition(
                "LEFTOVER_CHANGES",
                f"{wt} に、どのステップにも含まれていない変更があります。\n{files}\n"
                "内容をユーザーに示し、マージに含めてよいと確認できたら --commit-leftovers を付けて再実行してください。"
                "含めない変更は、ユーザーの了承を得て取り除いてから再実行してください。",
            )
        info("==> worktree の残りの変更をコミットします。")
        run_git(["commit", "-q", "-m", f"chore({name}): マージ前の残りの変更",
                 "-m", f"Speckit-Feature: {name}"], cwd=wt)

    # マージ後の片付けで止まらないよう、マージの前に worktree がクリーンであることを確かめる。
    leftover = git_out(["status", "--porcelain", "--", ".", f":(exclude){FEATURE_JSON}"], cwd=wt)
    if leftover:
        info(leftover)
        raise HelperError(f"{wt} にコミットできない変更が残っています。確認してから再実行してください。")
    if repo_is_dirty():
        info(git_out(["status", "--short"]))
        raise HelperError(f"{REPO_ROOT} に未コミットの変更があるためマージできません。コミットまたは stash してから再実行してください。")
    current = git_out(["rev-parse", "--abbrev-ref", "HEAD"])
    if current != MAIN_BRANCH:
        if "--switch" not in flags:
            raise Precondition(
                "NOT_ON_MAIN",
                f"{REPO_ROOT} のブランチが {current} です（マージ先は {MAIN_BRANCH}）。"
                f"{MAIN_BRANCH} に切り替えてよいかをユーザーに確認し、よければ --switch を付けて再実行してください。",
            )
        info(f"==> {REPO_ROOT} を {MAIN_BRANCH} に切り替えます（現在: {current}）。")
        run_git(["checkout", "-q", MAIN_BRANCH])

    if git_ok(["merge-base", "--is-ancestor", branch, MAIN_BRANCH]):
        # 競合を解消して手でマージした後の再実行など。ブランチはすでに main に入っているので片付けだけ行う。
        info(f"==> {branch} はすでに {MAIN_BRANCH} にマージ済みです。片付けだけを行います。")
    else:
        info(f"==> {branch} を {MAIN_BRANCH} に --no-ff でマージします。")
        try:
            # --partial は進捗の判定に使わない件名にする（MERGE_SUBJECT_RE は spec|coding|all だけを読む）
            git_passthrough(["merge", "--no-ff", "-m", f"merge({name}): {'partial' if partial else phase}", branch])
        except HelperError as error:
            raise HelperError(
                f"マージで競合しました。{REPO_ROOT} で競合を解消してマージをコミットし、"
                "もう一度 finish を実行してください（worktree とブランチは残しています）。"
            ) from error
    forget_history()

    info("==> worktree とブランチを削除します。")
    ignored = [line[3:] for line in git_out(["status", "--porcelain", "--ignored", "--untracked-files=normal"], cwd=wt)
               .splitlines() if line.startswith("!! ") and line[3:].rstrip("/") != FEATURE_JSON]
    if ignored:
        info("==> 次の無視対象のファイルは worktree と一緒に削除されます（.env など必要なものはメインの作業ツリーに控えてください）:")
        for path in ignored:
            info(f"      {path}")
    # 変更はすべてマージ済みで、残るのは無視対象のローカル状態だけなので --force で削除する。
    run_git(["worktree", "remove", "--force", str(wt)])
    git_passthrough(["branch", "-d", branch])
    print(f"FINISHED: {name} ({'partial' if partial else phase})")
    if ignored:
        print(f"REMOVED_IGNORED: {' '.join(ignored)}")
    print(f"MERGE_COMMIT: {git_out(['rev-parse', '--short', 'HEAD'])}")
    push_after_merge()
    if human_pending:
        # 人のタスクだけが残っているときは止めずにマージし、残りを知らせる。
        print(f"HUMAN_TASKS_PENDING: {len(human_pending)}")
        for line in human_pending:
            print(f"  {line}")
    if deferred_pending:
        # 後の段階に回したタスクも止めずにマージし、残りを知らせる。
        print(f"DEFERRED_TASKS_PENDING: {len(deferred_pending)}")
        for line in deferred_pending:
            print(f"  {line}")
    if partial:
        print("PARTIAL: 一部の Phase だけをマージした。残りは同じフィーチャーの speckit-coding で続ける（進捗は S8 から）")
    if phase != "spec":
        print_pitfalls()


# ---------------------------------------------------------------- 後の段階のタスク（--phase deferred）

def deferred_branch_of(name: str) -> str:
    return f"feature/{name}{DEFERRED_SUFFIX}"


def deferred_worktree_of(name: str) -> Path:
    return WORKTREES_DIR / f"{name}{DEFERRED_SUFFIX}"


def deferred_branch_exists(name: str) -> bool:
    return git_ok(["rev-parse", "--verify", "-q", f"refs/heads/{deferred_branch_of(name)}"])


def deferred_branch_log(name: str) -> str:
    """後の段階の作業のブランチにある、main にないコミットの本文。"""
    if not deferred_branch_exists(name):
        return ""
    return git_out(["log", f"{MAIN_BRANCH}..{deferred_branch_of(name)}", "--format=%B"])


def deferred_targets_recorded(name: str) -> list[str]:
    """ensure が始めのコミットに記録した対象のタスク ID。"""
    m = DEFERRED_TARGETS_RE.search(deferred_branch_log(name))
    return m.group(1).split() if m else []


def deferred_run_recorded(name: str) -> str:
    m = DEFERRED_RUN_RE.search(deferred_branch_log(name))
    return m.group(1) if m else ""


def deferred_completed_steps(name: str) -> list[str]:
    found = set(DEFERRED_STEP_RE.findall(deferred_branch_log(name)))
    return [step for step in DEFERRED_STEPS if step in found]


def deferred_next_step(name: str) -> str:
    done = set(deferred_completed_steps(name))
    return next((step for step in DEFERRED_STEPS if step not in done), "S12")


def deferred_runs_merged(name: str) -> int:
    proc = run_git(["log", MAIN_BRANCH, "--format=%s"], check=False)
    return sum(1 for n in DEFERRED_SUBJECT_RE.findall(proc.stdout) if n == name) if proc.returncode == 0 else 0


def task_ids(lines: list[str]) -> list[str]:
    return [m.group(2) for m in (TASK_ID_RE.match(line) for line in lines) if m]


def print_deferred_state(name: str, wt_state: str, weight: str) -> None:
    print(f"REPO_ROOT: {REPO_ROOT}")
    print(f"FEATURE_NAME: {name}")
    print(f"BRANCH: {deferred_branch_of(name)}")
    print(f"WORKTREE_DIR: {deferred_worktree_of(name)}")
    print(f"WORKTREE_STATE: {wt_state}")
    print("PHASE: deferred")
    print(f"WEIGHT: {weight}")
    print(f"RUN: {deferred_run_recorded(name)}")
    print(f"DEFERRED_TARGETS: {' '.join(deferred_targets_recorded(name))}")
    print(f"COMPLETED_STEPS: {' '.join(deferred_completed_steps(name))}")
    print(f"NEXT_STEP: {deferred_next_step(name)}")


def deferred_ensure(name: str, tasks_arg: str | None, weight_override: str | None) -> None:
    branch = deferred_branch_of(name)
    wt = deferred_worktree_of(name)
    run_git(["worktree", "prune"])
    requested = [t.strip() for t in (tasks_arg or "").split(",") if t.strip()]
    if weight_override is not None:
        resolve_weight(name, weight_override)  # worktree を作る前に値を確かめる
    if wt.is_dir() or deferred_branch_exists(name):
        # 再開。対象は始めのコミットの記録に従う（--tasks が違えば止める）
        recorded = deferred_targets_recorded(name)
        if requested and sorted(requested) != sorted(recorded):
            raise HelperError(f"{name} の後の段階の作業は、対象 {' '.join(recorded)} で始めています。"
                              "対象を変えるなら、今の作業を finish するか abort --phase deferred してから始め直してください。")
        if wt.is_dir():
            current = worktree_branch(wt)
            if current != branch:
                raise HelperError(f"{wt} のブランチが '{current}' です（期待値: '{branch}'）。手動で確認してください。")
            wt_state = "reused"
        else:
            info(f"==> 既存のブランチ {branch} に worktree を作り直します: {wt}")
            git_passthrough(["worktree", "add", str(wt), branch])
            wt_state = "reattached"
    else:
        if not coding_done(name):
            raise Precondition(
                "NOT_IMPLEMENTED",
                f"{name} は実装まで {MAIN_BRANCH} にマージされていません。残りのタスクは speckit-coding（--phase coding）で進めてください。",
            )
        pending = task_ids(split_deferred(main_tasks_text(name)))
        if not pending:
            raise Precondition("NO_DEFERRED_TASKS",
                               f"{name} の {MAIN_BRANCH} の tasks.md に、未完了の {DEFERRED_MARKER} のタスクがありません。")
        unknown = [t for t in requested if t not in pending]
        if unknown:
            raise HelperError(f"{' '.join(unknown)} は未完了の {DEFERRED_MARKER} のタスクではありません"
                              f"（未完了の {DEFERRED_MARKER}: {' '.join(pending)}）。")
        targets = requested or pending
        if not git_ok(["check-ignore", "-q", ".worktrees/"]):
            raise HelperError(".worktrees/ が .gitignore に登録されていません。'.worktrees/' を追加してコミットしてから再実行してください。")
        if repo_is_dirty():
            info(git_out(["status", "--short"]))
            raise HelperError(f"{REPO_ROOT} に未コミットの変更があります。コミットまたは stash してから再実行してください。")
        WORKTREES_DIR.mkdir(parents=True, exist_ok=True)
        info(f"==> {MAIN_BRANCH} から {branch} と worktree を作成します: {wt}")
        git_passthrough(["worktree", "add", "-b", branch, str(wt), MAIN_BRANCH])
        run = str(deferred_runs_merged(name) + 1)
        run_git(["commit", "-q", "--allow-empty", "-m", f"chore({name}): 後の段階のタスクの作業を始める（{' '.join(targets)}）",
                 "-m", f"Speckit-Deferred-Feature: {name}\nSpeckit-Deferred-Run: {run}\n"
                       f"Speckit-Deferred-Targets: {' '.join(targets)}"], cwd=wt)
        wt_state = "created"
    (wt / ".specify").mkdir(parents=True, exist_ok=True)
    with open(wt / FEATURE_JSON, "w", encoding="utf-8", newline="\n") as handle:
        handle.write('{\n  "feature_directory": "specs/%s"\n}\n' % name)
    print_deferred_state(name, wt_state, resolve_weight(name, weight_override, wt))


def deferred_checkpoint(name: str, step: str, subject: str, skipped_reason: str | None, force: bool) -> None:
    if step not in DEFERRED_STEPS:
        raise HelperError(f"後の段階の作業のステップ '{step}' は不正です（有効値: {' '.join(DEFERRED_STEPS)}）。")
    wt = deferred_worktree_of(name)
    if not wt.is_dir():
        raise HelperError(f"worktree {wt} がありません。先に ensure --phase deferred を実行してください。")
    if worktree_branch(wt) != deferred_branch_of(name):
        raise HelperError(f"{wt} のブランチが '{worktree_branch(wt)}' です。")
    if skipped_reason is not None:
        if not skipped_reason.strip():
            raise HelperError("--skipped には省いた理由を書いてください。")
        if step not in DEFERRED_SKIPPABLE and not force:
            raise HelperError(f"後の段階の作業では {step} を省けません（省けるステップ: {' '.join(DEFERRED_SKIPPABLE)}）。"
                              "どうしても省くなら、理由を確かめたうえで --force を付けてください。")
    stage_all(wt)
    trailers = (f"Speckit-Deferred-Step: {step}\nSpeckit-Deferred-Feature: {name}\n"
                f"Speckit-Deferred-Run: {deferred_run_recorded(name) or '1'}")
    if skipped_reason is not None:
        trailers += f"\nSpeckit-Deferred-Skipped: {step} {' '.join(skipped_reason.split())}"
    run_git(["commit", "-q", "--allow-empty", "-m", subject, "-m", trailers], cwd=wt)
    print(f"CHECKPOINT: {step} {git_out(['rev-parse', '--short', 'HEAD'], cwd=wt)}"
          + ("（省略）" if skipped_reason is not None else ""))
    print(f"NEXT_STEP: {deferred_next_step(name)}")


def deferred_finish(name: str, flags: list[str]) -> None:
    branch = deferred_branch_of(name)
    wt = deferred_worktree_of(name)
    if not wt.is_dir():
        raise HelperError(f"worktree {wt} がありません。")
    cwd = Path.cwd().resolve()
    if cwd == wt.resolve() or wt.resolve() in cwd.parents:
        raise HelperError(f"finish は worktree の外（{REPO_ROOT}）で実行してください。`cd {REPO_ROOT}` してから再実行します。")
    missing = [s for s in DEFERRED_STEPS if s not in deferred_completed_steps(name)]
    if missing:
        raise HelperError(f"後の段階の作業のステップが記録されていません（未記録: {' '.join(missing)}。"
                          "省いたステップも --skipped で記録する）。")
    tasks_file = wt / "specs" / name / "tasks.md"
    targets = deferred_targets_recorded(name)
    text = tasks_file.read_text(encoding="utf-8") if tasks_file.is_file() else ""
    unchecked_targets = [t for t in targets if re.search(rf"^[ \t]*- \[ \] {re.escape(t)}\b", text, re.MULTILINE)]
    if unchecked_targets:
        raise Precondition(
            "DEFERRED_TARGETS_UNCHECKED",
            f"対象のタスク {' '.join(unchecked_targets)} が tasks.md でまだ未完了です。実装して - [x] にしてから再実行してください"
            f"（{DEFERRED_MARKER} の印は残す）。",
        )
    drop_handover(wt, name, f"Speckit-Deferred-Feature: {name}")
    # 残りの [人]・[後] に合わせて、機能ファイルの状態欄を更新する（実装後の状態どうしでだけ動かす）
    status = status_after_coding(name, tasks_file)
    for path in update_feature_status(wt, name, status, only_from=(STATUS_DONE, "人の作業待ち")):
        info(f"==> 状態を更新しました: {path}")
    stage_all(wt)
    if not git_ok(["diff", "--cached", "--quiet"], cwd=wt):
        status_only = all(path.startswith("docs/feature/")
                          for path in git_out(["diff", "--cached", "--name-only"], cwd=wt).splitlines())
        if not status_only and "--commit-leftovers" not in flags:
            files = git_out(["diff", "--cached", "--name-status"], cwd=wt)
            run_git(["reset", "-q"], cwd=wt)
            raise Precondition(
                "LEFTOVER_CHANGES",
                f"{wt} に、どのステップにも含まれていない変更があります。\n{files}\n"
                "内容をユーザーに示し、マージに含めてよいと確認できたら --commit-leftovers を付けて再実行してください。",
            )
        run_git(["commit", "-q", "-m", f"docs({name}): 後の段階の作業の後の状態を記録",
                 "-m", f"Speckit-Deferred-Feature: {name}"], cwd=wt)
    if repo_is_dirty():
        info(git_out(["status", "--short"]))
        raise HelperError(f"{REPO_ROOT} に未コミットの変更があるためマージできません。コミットまたは stash してから再実行してください。")
    current = git_out(["rev-parse", "--abbrev-ref", "HEAD"])
    if current != MAIN_BRANCH:
        if "--switch" not in flags:
            raise Precondition("NOT_ON_MAIN", f"{REPO_ROOT} のブランチが {current} です（マージ先は {MAIN_BRANCH}）。"
                               f"{MAIN_BRANCH} に切り替えてよいかをユーザーに確認し、よければ --switch を付けて再実行してください。")
        info(f"==> {REPO_ROOT} を {MAIN_BRANCH} に切り替えます（現在: {current}）。")
        run_git(["checkout", "-q", MAIN_BRANCH])
    if git_ok(["merge-base", "--is-ancestor", branch, MAIN_BRANCH]):
        info(f"==> {branch} はすでに {MAIN_BRANCH} にマージ済みです。片付けだけを行います。")
    else:
        info(f"==> {branch} を {MAIN_BRANCH} に --no-ff でマージします。")
        try:
            git_passthrough(["merge", "--no-ff", "-m", f"merge({name}): deferred", branch])
        except HelperError as error:
            raise HelperError(
                f"マージで競合しました。{REPO_ROOT} で競合を解消してマージをコミットし、"
                "もう一度 finish --phase deferred を実行してください（worktree とブランチは残しています）。"
            ) from error
    forget_history()
    run_git(["worktree", "remove", "--force", str(wt)])
    git_passthrough(["branch", "-d", branch])
    print(f"FINISHED: {name} (deferred)")
    print(f"MERGE_COMMIT: {git_out(['rev-parse', '--short', 'HEAD'])}")
    print(f"FEATURE_STATUS: {status}")
    push_after_merge()
    main_text = main_tasks_text(name)
    human = split_unchecked(main_text)[1]
    rest = split_deferred(main_text)
    if human:
        print(f"HUMAN_TASKS_PENDING: {len(human)}")
        for line in human:
            print(f"  {line}")
    if rest:
        print(f"DEFERRED_TASKS_PENDING: {len(rest)}")
        for line in rest:
            print(f"  {line}")
    print_pitfalls()


def cmd_abort(args: list[str]) -> None:
    positional, phase, flags = parse_args(args)
    name = resolve_feature(positional)
    deferred = phase == "deferred"
    branch = deferred_branch_of(name) if deferred else branch_of(name)
    wt = deferred_worktree_of(name) if deferred else worktree_of(name)
    has_branch = deferred_branch_exists(name) if deferred else branch_exists(name)
    print(f"対象: {name}{'（後の段階の作業）' if deferred else ''}")
    if wt.is_dir():
        print(f"  削除する worktree: {wt}（未コミットの変更も失われます）")
    if has_branch:
        print(f"  削除するブランチ: {branch}（{MAIN_BRANCH} に未マージのコミットも失われます）")
    if "--yes" not in flags:
        print("確認のみ行いました。実行するには --yes を付けてください。")
        return
    if wt.is_dir():
        run_git(["worktree", "remove", "--force", str(wt)])
    if has_branch:
        run_git(["branch", "-D", branch])
    run_git(["worktree", "prune"])
    print(f"ABORTED: {name}")


def human_pending_of(name: str) -> list[str]:
    """残っている人のタスク。worktree があればその tasks.md、なければ main の tasks.md を読む。

    メインの作業ツリーが main にいるときは、コミット前の変更も含めて作業ツリーのファイルを読む。
    """
    tasks_file = worktree_of(name) / "specs" / name / "tasks.md"
    if tasks_file.is_file():
        return unchecked_tasks(tasks_file)[1]
    if name in branch_features():
        return split_unchecked(branch_tasks_text(name))[1]
    if git_out(["rev-parse", "--abbrev-ref", "HEAD"]) == MAIN_BRANCH:
        return unchecked_tasks(REPO_ROOT / "specs" / name / "tasks.md")[1]
    return split_unchecked(main_tasks_text(name))[1]


def deferred_pending_of(name: str) -> list[str]:
    """残っている後の段階のタスク。読む tasks.md の選び方は human_pending_of と同じ（後の段階の作業中ならその worktree）。"""
    for tasks_file in (deferred_worktree_of(name) / "specs" / name / "tasks.md",
                       worktree_of(name) / "specs" / name / "tasks.md"):
        if tasks_file.is_file():
            return deferred_tasks(tasks_file)
    if name in branch_features():
        return split_deferred(branch_tasks_text(name))
    if git_out(["rev-parse", "--abbrev-ref", "HEAD"]) == MAIN_BRANCH:
        return deferred_tasks(REPO_ROOT / "specs" / name / "tasks.md")
    return split_deferred(main_tasks_text(name))


def cmd_status(_: list[str]) -> None:
    print("| FEATURE | 仕様 | 実装 | WORKTREE | 人の作業 | 後の作業 |")
    print("|---|---|---|---|---|---|")
    for name in get_all_features():
        if implemented_without_spec(name):
            print(f"| {name} | -（Spec Kit 以前） | 完了 | - | - | - |")
            continue
        human = human_pending_of(name)
        human_col = f"残り {len(human)} 件" if human else "-"
        deferred = deferred_pending_of(name)
        deferred_col = f"残り {len(deferred)} 件" if deferred else "-"
        if name in branch_features() and not worktree_of(name).is_dir():
            text = branch_tasks_text(name)
            remaining = len(split_unchecked(text)[0])
            spec_col = "完了（未マージ）" if text else "作業中"
            if not text:
                coding_col = "-"
            elif tasks_all_done(text):
                coding_col = "完了（未マージ）"
            elif CHECKED_RE.search(text):
                coding_col = f"作業中（残り {remaining} 件）"
            else:
                coding_col = "未着手"
            print(f"| {name} | {spec_col} | {coding_col} | ブランチ {name} | {human_col} | {deferred_col} |")
            continue
        done = completed_steps(name)
        has_tasks = main_has_tasks(name)
        if has_tasks:
            spec_col = "完了"
        elif "S7-3" in done:
            spec_col = "完了（未マージ）"
        elif done or main_has_file(name, "spec.md"):
            # Pull Request などで spec.md だけを取り込んだフィーチャーも、仕様は作業中とみなす
            spec_col = "作業中"
        else:
            spec_col = "未着手"
        if coding_done(name):
            coding_col = "完了"
        elif "S8" in done or "S9" in done:
            coding_col = "作業中"
        elif has_tasks and CHECKED_RE.search(main_tasks_text(name)):
            coding_col = f"作業中（残り {len(split_unchecked(main_tasks_text(name))[0])} 件）"
        elif "S7-3" in done:
            coding_col = "未着手"
        else:
            coding_col = "-"
        if not coding_done(name) and name in partial_merges(MAIN_BRANCH):
            coding_col += "（一部をマージ済み）"
        wt_col = f"あり（次: {next_step(name, 'all')}）" if worktree_of(name).is_dir() else "-"
        if deferred_worktree_of(name).is_dir():
            dwt = f"後の作業中（{' '.join(deferred_targets_recorded(name))}。次: {deferred_next_step(name)}）"
            wt_col = dwt if wt_col == "-" else f"{wt_col}、{dwt}"
        skipped = skipped_steps(name)
        spec_skipped = [s for s in skipped if s in SPEC_STEPS]
        coding_skipped = [s for s in skipped if s in CODING_STEPS]
        if spec_skipped:
            spec_col += f"（省略: {' '.join(spec_skipped)}）"
        if coding_skipped:
            coding_col += f"（省略: {' '.join(coding_skipped)}）"
        print(f"| {name} | {spec_col} | {coding_col} | {wt_col} | {human_col} | {deferred_col} |")
    print_pitfalls()


def cmd_human_tasks(args: list[str]) -> None:
    """残っている人のタスクを、フィーチャーごとに表示する。"""
    positional, _, _ = parse_args(args)
    names = [resolve_feature(positional)] if positional else get_all_features()
    for name in names:
        human = human_pending_of(name)
        if human:
            print(f"{name}:")
            for line in human:
                print(f"  {line}")


def cmd_deferred_tasks(args: list[str]) -> None:
    """残っている後の段階のタスク（[後]）を、フィーチャーごとに表示する。"""
    positional, _, _ = parse_args(args)
    names = [resolve_feature(positional)] if positional else get_all_features()
    for name in names:
        deferred = deferred_pending_of(name)
        if deferred:
            print(f"{name}:")
            for line in deferred:
                print(f"  {line}")


def cmd_sync_status(args: list[str]) -> None:
    """main にマージ済みのフィーチャーの状態欄を、main の tasks.md に合わせる（人のタスクを片付けた後に使う）。"""
    positional, _, _ = parse_args(args)
    name = resolve_feature(positional)
    if worktree_of(name).is_dir():
        raise HelperError(f"{name} の worktree があります。worktree の作業は checkpoint と finish で進めてください。")
    if not coding_done(name):
        raise HelperError(f"{name} は実装まで {MAIN_BRANCH} にマージされていません。")
    current = git_out(["rev-parse", "--abbrev-ref", "HEAD"])
    if current != MAIN_BRANCH:
        raise HelperError(f"{REPO_ROOT} のブランチが {current} です。{MAIN_BRANCH} で実行してください。")
    tasks_file = REPO_ROOT / "specs" / name / "tasks.md"
    status = status_after_coding(name, tasks_file)
    # 実装後の状態（完了 / 人の作業待ち）どうしでだけ動かし、それ以前の状態を飛び越えない。
    changed = update_feature_status(REPO_ROOT, name, status, only_from=(STATUS_DONE, "人の作業待ち"))
    for path in changed:
        info(f"==> 状態を更新しました: {path}（コミットはしていません）")
    print(f"FEATURE_STATUS: {status}")
    human = unchecked_tasks(tasks_file)[1]
    if human:
        print(f"HUMAN_TASKS_PENDING: {len(human)}")
        for line in human:
            print(f"  {line}")
    deferred = deferred_tasks(tasks_file)
    if deferred:
        print(f"DEFERRED_TASKS_PENDING: {len(deferred)}")
        for line in deferred:
            print(f"  {line}")


def cmd_next(args: list[str]) -> None:
    _, phase, _ = parse_args(args)
    phase = require_phase(phase)
    skip: set[str] = set()
    for i, arg in enumerate(args):
        if arg == "--skip" and i + 1 < len(args):
            skip.update(resolve_feature(n) for n in args[i + 1].split(",") if n)
        elif arg.startswith("--skip="):
            skip.update(resolve_feature(n) for n in arg[len("--skip="):].split(",") if n)
    # Spec Kit 以前に実装済みの機能と、worktree を使わずにブランチで作業中のフィーチャーは候補にしない。
    features = [f for f in get_all_features() if f not in skip and not implemented_without_spec(f)
                and not (f in branch_features() and not worktree_of(f).is_dir())]

    # 途中のまま残っている worktree を最優先にする。
    for name in features:
        if not worktree_of(name).is_dir():
            continue
        done = completed_steps(name)
        if (phase == "spec" and "S8" not in done) or (phase == "coding" and "S7-3" in done) or phase == "all":
            print(name)
            return

    for name in features:
        has_tasks = main_has_tasks(name)
        if phase == "spec" and not has_tasks:
            print(name)
            return
        if phase == "coding" and has_tasks and not coding_done(name):
            print(name)
            return
        if phase == "all" and (not has_tasks or not coding_done(name)):
            print(name)
            return
    print("")


# ---------------------------------------------------------------- 引き継ぎ（resume・作業中のメモ・落とし穴）

def handover_path(wt: Path, name: str) -> Path:
    return wt / "specs" / name / HANDOVER_FILE


def handover_warnings(wt: Path, name: str) -> list[str]:
    """作業中のメモが古い・長いときの警告。メモがなければ空。"""
    path = handover_path(wt, name)
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    warnings: list[str] = []
    lines = len(text.rstrip("\n").splitlines())
    if lines > HANDOVER_MAX_LINES:
        warnings.append(f"メモが {lines} 行あります（上限 {HANDOVER_MAX_LINES} 行）。進捗やタスクの一覧を書いていないか確かめ、短くしてください。")
    m = HANDOVER_BASE_RE.search(text)
    if not m:
        warnings.append("メモに「基準コミット: <hash>」がありません。古さを判定できません。")
    elif not git_ok(["cat-file", "-e", f"{m.group(1)}^{{commit}}"], cwd=wt):
        warnings.append(f"基準コミット {m.group(1)} が見つかりません。メモを書き直してください。")
    else:
        rel = f"specs/{name}/{HANDOVER_FILE}"
        # メモだけを変えたコミットは数えない。checkpoint の空コミットは作業が進んだ印なので数える
        later = []
        for sha in git_out(["rev-list", "--abbrev-commit", f"{m.group(1)}..HEAD"], cwd=wt).split():
            files = git_out(["diff-tree", "--no-commit-id", "--name-only", "-r", "-m", "--root", sha], cwd=wt).split()
            if not files or set(files) != {rel}:
                later.append(sha)
        if later:
            warnings.append(f"メモを書いた後に {len(later)} 件のコミットがあります（{' '.join(later[:5])}）。"
                            "メモが今の状態と合っているか確かめ、合っていなければ書き直してください。")
    return warnings


def drop_handover(wt: Path, name: str, trailer: str) -> str | None:
    """finish の前に作業中のメモを消す（main に入れない）。消したメモの中身を返す。"""
    path = handover_path(wt, name)
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    rel = f"specs/{name}/{HANDOVER_FILE}"
    where = ""
    if git_ok(["ls-files", "--error-unmatch", rel], cwd=wt):
        run_git(["rm", "-q", "--", rel], cwd=wt)
        run_git(["commit", "-q", "-m", f"chore({name}): 作業中のメモを消す", "-m", trailer], cwd=wt)
        where = f"（中身は {git_out(['rev-parse', '--short', 'HEAD~1'], cwd=wt)} に残っている）"
    else:
        path.unlink()
    # この後で finish が止まっても中身が分かるよう、消した時点で表示する
    print(f"HANDOVER_REMOVED: 作業中のメモを消しました{where}。移すもの（decisions.md、{PITFALLS_FILE}）がないか確かめてください:")
    for line in text.rstrip("\n").splitlines():
        print(f"  | {line}")
    return text


def merged_features_after(day: str) -> int:
    """day（YYYY-MM-DD）より後の日付に main へ実装までマージした機能の数（コミットの日付で比べる）。"""
    proc = run_git(["log", MAIN_BRANCH, f"--format=%cs{COMMIT_SEP}%s"], check=False)
    if proc.returncode != 0:
        return 0
    names = set()
    # splitlines() は区切りの \x1e でも行を分けるので、改行だけで分ける
    for line in proc.stdout.split("\n"):
        date, _, subject = line.partition(COMMIT_SEP)
        m = MERGE_SUBJECT_RE.match(subject)
        if m and m.group(2) in ("coding", "all") and date > day:
            names.add(m.group(1))
    return len(names)


def pitfall_findings() -> tuple[int, list[str]]:
    """落とし穴の受け箱の件数と、棚卸しが要る理由。受け箱がなければ (0, [])。"""
    path = REPO_ROOT / PITFALLS_FILE
    if not path.is_file():
        return 0, []
    text = path.read_text(encoding="utf-8")
    ids = PITFALL_HEADING_RE.findall(text)
    findings: list[str] = []
    if not ids:
        findings.append(f"{PITFALLS_FILE} に項目がありません。ファイルごと消してください。")
        return 0, findings
    if len(ids) > PITFALLS_MAX_ITEMS:
        findings.append(f"{len(ids)} 件あります（上限 {PITFALLS_MAX_ITEMS} 件）。古いものから昇格か削除をしてください。")
    parts = re.split(r"^(?=###\s+P-)", text, flags=re.MULTILINE)
    for part in parts:
        m = PITFALL_HEADING_RE.match(part)
        if not m:
            continue
        kept = PITFALL_KEPT_RE.search(part)
        recorded = PITFALL_RECORDED_RE.search(part)
        since = kept.group(1) if kept else (recorded.group(1) if recorded else None)
        if since is None:
            findings.append(f"{m.group(1)}: 「記録」の日付がありません。")
            continue
        merged = merged_features_after(since)
        if merged >= PITFALLS_MAX_FEATURES:
            how = "据え置きは 1 回までです。昇格か削除をしてください" if kept else "昇格・削除・据え置き（1 回まで）のどれかにしてください"
            findings.append(f"{m.group(1)}: {'据え置いて' if kept else '記録して'}から {merged} 機能をマージしました。{how}。")
    return len(ids), findings


def print_pitfalls() -> None:
    count, findings = pitfall_findings()
    if count or findings:
        print(f"PITFALLS: {count} 件（上限 {PITFALLS_MAX_ITEMS} 件、{PITFALLS_MAX_FEATURES} 機能で棚卸し）")
    for finding in findings:
        print(f"PITFALLS_TRIAGE: {finding}")


def unconfirmed_decisions(path: Path) -> list[str]:
    """decisions.md の表で、「確認の結果」（最後の列）が空の行。"""
    if not path.is_file():
        return []
    rows: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not line.lstrip().startswith("|") or len(cells) < 3 or not cells[0].isdigit():
            continue
        if not cells[-1] and any(cells[1:-1]):
            rows.append(line.strip())
    return rows


def cmd_resume(args: list[str]) -> None:
    """セッションを始めるときの要約。進捗とタスクは正本から生成し、作業中のメモがあれば古さを確かめて表示する。"""
    positional, _, _ = parse_args(args)
    name = resolve_feature(positional)
    dwt, wt = deferred_worktree_of(name), worktree_of(name)
    if dwt.is_dir():
        root, where = dwt, f"{dwt}（後の段階の作業）"
        print(f"NEXT_STEP: {deferred_next_step(name)}（--phase deferred。対象: {' '.join(deferred_targets_recorded(name))}）")
    elif wt.is_dir():
        root, where = wt, str(wt)
        print(f"NEXT_STEP: {next_step(name, 'all')}")
    else:
        root, where = REPO_ROOT, f"{REPO_ROOT}（worktree なし）"
        print(f"NEXT_STEP: {'完了' if coding_done(name) else next_step(name, 'all')}")
    print(f"FEATURE_NAME: {name}")
    print(f"WORKDIR: {where}")
    print(f"WEIGHT: {feature_file_weight(name, root if root != REPO_ROOT else None)}")
    print(f"COMPLETED_STEPS: {' '.join(completed_steps(name))}")
    skipped = skipped_steps(name)
    if skipped:
        print(f"SKIPPED_STEPS: {' '.join(skipped)}")
    fdir = root / "specs" / name
    tasks_file = fdir / "tasks.md"
    sections = [
        ("HUMAN_TASKS_PENDING", unchecked_tasks(tasks_file)[1]),
        ("DEFERRED_TASKS_PENDING", deferred_tasks(tasks_file)),
        ("UNCHECKED_TASKS", unchecked_tasks(tasks_file)[0]),
        ("UNCONFIRMED_DECISIONS", unconfirmed_decisions(fdir / "decisions.md")),
    ]
    spec = fdir / "spec.md"
    provisional = [l.strip() for l in spec.read_text(encoding="utf-8").splitlines() if "（仮）" in l] if spec.is_file() else []
    sections.append(("PROVISIONAL_CLARIFICATIONS", provisional))
    backlog = fdir / "reviews" / "backlog.md"
    open_backlog = [l.strip() for l in backlog.read_text(encoding="utf-8").splitlines()
                    if l.strip().startswith("|") and l.strip().rstrip("|").strip().endswith("未")] if backlog.is_file() else []
    sections.append(("REVIEW_BACKLOG", open_backlog))
    for key, lines in sections:
        if lines:
            print(f"{key}: {len(lines)}")
            for line in lines[:10]:
                print(f"  {line}")
            if len(lines) > 10:
                print(f"  …ほか {len(lines) - 10} 件")
    path = handover_path(root, name)
    if path.is_file():
        print(f"HANDOVER: {path}")
        for warning in handover_warnings(root, name):
            print(f"HANDOVER_WARN: {warning}")
        for line in path.read_text(encoding="utf-8").rstrip("\n").splitlines():
            print(f"  | {line}")
    else:
        print("HANDOVER: なし")
    print_pitfalls()


def cmd_pitfalls(_: list[str]) -> None:
    count, findings = pitfall_findings()
    if not count and not findings:
        print("PITFALLS: なし")
        return
    print_pitfalls()


# ---------------------------------------------------------------- 開発コマンドと診断（commands・doctor）

def current_toplevel() -> Path:
    """今いる作業ツリー（worktree の中ならその worktree）の最上位。commands.json はここを読み書きする。"""
    return Path(git_out(["rev-parse", "--show-toplevel"], cwd=Path.cwd())).resolve()


def load_commands(root: Path) -> dict[str, str]:
    path = root / COMMANDS_FILE
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise HelperError(f"{COMMANDS_FILE} を JSON として読めません: {error}") from error
    commands = data.get("commands") if isinstance(data, dict) else None
    if not isinstance(commands, dict):
        raise HelperError(f"{COMMANDS_FILE} に \"commands\" の表がありません。")
    return {str(k): str(v) for k, v in commands.items() if v is not None}


def save_commands(root: Path, commands: dict[str, str]) -> Path:
    path = root / COMMANDS_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = {k: commands[k] for k in COMMAND_KEYS if k in commands}
    ordered.update({k: v for k, v in sorted(commands.items()) if k not in ordered})
    data = {
        "_about": "プロジェクトの開発コマンドの正本（speckit-worktree §4）。プロジェクトのルートで実行する。"
                  "空文字は「使わない」。worktree_helper.py commands set/unset で変える",
        "commands": ordered,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return path


def first_program(command: str) -> str:
    """コマンドの先頭のプログラム名（環境変数の代入 FOO=1 は飛ばす）。"""
    try:
        words = shlex.split(command)
    except ValueError:
        words = command.split()
    for word in words:
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", word):
            continue
        return word
    return ""


def cmd_commands(args: list[str]) -> None:
    """開発コマンドの読み書き。get <key> / set <key> <command> / unset <key> / 引数なしで一覧。"""
    root = current_toplevel()
    commands = load_commands(root)
    action = args[0] if args else "list"
    if action == "list":
        if not commands:
            print(f"COMMANDS: なし（{COMMANDS_FILE} がない。commands set <key> <command> で作る）")
            return
        for key, value in commands.items():
            print(f"{key}: {value if value else '（使わない）'}")
        return
    if action == "get":
        if len(args) < 2:
            raise HelperError("使い方: commands get <key>")
        if args[1] not in commands:
            print("")
            raise HelperError(f"{args[1]} は {COMMANDS_FILE} にありません。plan.md・quickstart.md・設定ファイルから判断し、"
                              f"決まったら commands set {args[1]} '<command>' で記録してください。")
        print(commands[args[1]])
        return
    if action == "set":
        if len(args) < 3:
            raise HelperError("使い方: commands set <key> <command>（使わないものは空文字 '' を指定する）")
        key = args[1]
        if not re.match(r"^[a-z][a-z0-9_-]*$", key):
            raise HelperError(f"キー '{key}' は英小文字・数字・-・_ で書いてください（例: {', '.join(COMMAND_KEYS)}）。")
        commands[key] = " ".join(args[2:]) if len(args) > 3 else args[2]
        path = save_commands(root, commands)
        print(f"COMMAND_SET: {key}: {commands[key] or '（使わない）'}（{path}。コミットはしていない）")
        return
    if action == "unset":
        if len(args) < 2 or args[1] not in commands:
            raise HelperError("使い方: commands unset <key>（記録にあるキーを指定する）")
        del commands[args[1]]
        save_commands(root, commands)
        print(f"COMMAND_UNSET: {args[1]}")
        return
    raise HelperError(f"commands の操作 '{action}' は不明です（list / get / set / unset）。")


def doctor_results(root: Path, main_ok: bool) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    add = results.append
    add(("OK", f"Python {sys.version_info.major}.{sys.version_info.minor}") if sys.version_info >= (3, 9)
        else ("ERROR", f"Python {sys.version_info.major}.{sys.version_info.minor} は古い（3.9 以上が要る）"))
    add(("OK", f"マージ先のブランチ {MAIN_BRANCH} がある") if main_ok
        else ("ERROR", f"ブランチ {MAIN_BRANCH} がない（既定のブランチが別の名前なら SPECKIT_MAIN_BRANCH を指定する）"))
    add(("OK", ".worktrees/ が .gitignore で無視されている") if git_ok(["check-ignore", "-q", ".worktrees/"])
        else ("ERROR", ".worktrees/ が .gitignore にない（ensure が止まる）"))
    # 開発コマンド
    try:
        commands = load_commands(root)
    except HelperError as error:
        add(("ERROR", str(error)))
        commands = None
    if commands is not None:
        if not commands:
            add(("WARN", f"{COMMANDS_FILE} がない（最初の機能の S5 か S8 で、commands set で記録する）"))
        for key in COMMAND_KEYS[:3]:
            if commands and key not in commands:
                add(("WARN", f"commands.{key} が記録されていない（使わないなら空文字で記録する）"))
        for key, value in (commands or {}).items():
            if not value:
                add(("OK", f"commands.{key}: 使わない"))
                continue
            prog = first_program(value)
            if prog and (shutil.which(prog) or (root / prog).exists()):
                add(("OK", f"commands.{key}: {prog} がある"))
            else:
                add(("WARN", f"commands.{key}: '{prog}' が PATH にない（インストールの手順を示すか、パスを直す）"))
    # スキルのリンク
    for base in AGENT_SKILL_DIRS:
        d = root / base
        if not d.is_dir():
            add(("ERROR", f"{base}/ がない"))
            continue
        entries = list(d.iterdir())
        broken = sorted(p.name for p in entries if p.is_symlink() and not p.exists())
        names = {p.name for p in entries}
        missing = [n for n in ("speckit-worktree", "speckit-specify") if n not in names]
        if broken:
            add(("ERROR", f"{base}/ のリンクが切れている: {', '.join(broken)}"))
        if missing:
            add(("ERROR", f"{base}/ に {', '.join(missing)} がない"))
        if not broken and not missing:
            add(("OK", f"{base}/ のスキル {len(names)} 件"))
    # Spec Kit と憲章
    if not (root / ".specify").is_dir():
        add(("ERROR", ".specify/ がない"))
    else:
        constitution = root / ".specify" / "memory" / "constitution.md"
        if not constitution.is_file():
            add(("WARN", "憲章（.specify/memory/constitution.md）がない（speckit-constitution で作る）"))
        elif "[PROJECT_NAME]" in constitution.read_text(encoding="utf-8"):
            add(("WARN", "憲章がテンプレートのまま（speckit-constitution で作る）"))
        else:
            add(("OK", "憲章がある"))
    # steering と、エージェント向けの入口
    for rel in STEERING_FILES:
        if not (root / rel).is_file():
            add(("ERROR", f"{rel} がない"))
    for rel in ("CLAUDE.md", "AGENTS.md", "GEMINI.md"):
        path = root / rel
        if not path.is_file():
            add(("WARN", f"{rel} がない"))
            continue
        body = path.read_text(encoding="utf-8")
        lacking = [r for r in STEERING_FILES if r not in body]
        add(("WARN", f"{rel} が {', '.join(lacking)} を読み込んでいない") if lacking
            else ("OK", f"{rel} が steering を読み込んでいる"))
    return results


def cmd_doctor(_: list[str], main_ok: bool = True) -> int:
    results = doctor_results(REPO_ROOT, main_ok)
    for level, message in results:
        print(f"{level}: {message}")
    errors = sum(1 for level, _ in results if level == "ERROR")
    warns = sum(1 for level, _ in results if level == "WARN")
    print(f"SUMMARY: ERROR {errors} / WARN {warns}")
    return 1 if errors else 0


def cmd_list(_: list[str]) -> None:
    for name in get_all_features():
        print(name)


def cmd_resolve(args: list[str]) -> None:
    print(resolve_feature(args[0] if args else None))


USAGE = f"""Usage: worktree_helper.py <command> [arguments]

Commands:
  ensure <feature> --phase spec|coding|all [--weight 軽|標準|重]
        worktree があれば再利用し、なければ {MAIN_BRANCH} から作る。進捗と次のステップ、機能の重さ（WEIGHT。
        機能ファイルの **重さ**。欄がなければ 標準。--weight で上書き）を表示する
  state <feature> --phase spec|coding|all [--weight 軽|標準|重]
        変更せずに進捗と次のステップ、機能の重さを表示する。coding / all で、仕様工程が済んでいて S8 の前なのに
        ui.md がなければ MISSING_ARTIFACTS: ui.md を出す（S4-1 を省いた機能と「UI なし」のプロジェクトは除く）
  checkpoint <feature> <step> <subject> [--skipped "<理由>" [--force]] [--weight 軽|標準|重]
        worktree の変更をすべてコミットし、trailer "Speckit-Step: <step>" と "Speckit-Feature: <feature>" で
        完了を記録する（変更がなくても空コミットで記録）。S2 と S11 では機能ファイルの状態欄も更新する。
        --skipped: 機能の重さで省いたステップとして記録する（trailer "Speckit-Skipped: <step> <理由>"。完了として数える）。
        重さで省けないステップ（重はすべて）は止まる。--force で止めずに記録する
  finish <feature> --phase spec|coding|all [--allow-unchecked] [--commit-leftovers] [--switch] [--partial]
        最終ステップの完了を確認し、{MAIN_BRANCH} に --no-ff でマージして worktree とブランチを削除する。
        worktree の外で実行する。coding / all では tasks.md に未完了があると止まる（--allow-unchecked で続行）。
        未完了が {HUMAN_MARKER}・{DEFERRED_MARKER} のタスクだけなら止めずにマージし、
        HUMAN_TASKS_PENDING・DEFERRED_TASKS_PENDING で残りを表示する。
        --partial（coding / all）: 仕様工程が済んでいれば、実装の最終ステップと未完了の検査をせず、
        "merge(<feature>): partial" の件名でマージする。ほかの機能の前提として一部の Phase だけを先に入れるときに使う
        （進捗は進めない。残りは同じフィーチャーの S8 から続ける）
        どのステップにも含まれない変更があると止まる（--commit-leftovers で続行）。
        メインの作業ツリーが main 以外にいると止まる（--switch で main に切り替えて続行）
  abort <feature> [--phase deferred] [--yes]
        worktree とブランチを破棄する。--yes がなければ対象を表示するだけ。--phase deferred は後の段階の作業のもの
  ensure|state <feature> --phase deferred [--tasks T045,T046] [--weight 軽|標準|重]
        実装まで {MAIN_BRANCH} にマージ済みの機能の {DEFERRED_MARKER} のタスクを、専用の worktree
        （.worktrees/<feature>{DEFERRED_SUFFIX}、ブランチ feature/<feature>{DEFERRED_SUFFIX}）で片付ける。--tasks がなければ
        未完了の {DEFERRED_MARKER} をすべて対象にする。checkpoint <feature> <S8〜S11> <subject> --phase deferred で記録し
        （trailer "Speckit-Deferred-Step"。もとの機能の進捗は変えない）、finish <feature> --phase deferred で
        "merge(<feature>): deferred" の件名でマージする
  list
        全フィーチャー名を着手順（spec_order.md の並び、その後に番号順）で表示する
  status
        全フィーチャーの仕様・実装・worktree の状況と、残っている人のタスク・後の段階のタスクの件数を表示する
  human-tasks [<feature>]
        残っている {HUMAN_MARKER} のタスクを表示する（worktree があればその tasks.md、なければ {MAIN_BRANCH} のもの）
  deferred-tasks [<feature>]
        残っている {DEFERRED_MARKER} のタスクを表示する（読む tasks.md は human-tasks と同じ）
  sync-status <feature>
        {MAIN_BRANCH} にマージ済みのフィーチャーの状態欄を tasks.md に合わせる（完了 / 完了（後の作業 N 件） / 人の作業待ち）。
        人のタスクを片付けた後に {MAIN_BRANCH} で実行する。変更はコミットしない
  next --phase spec|coding|all [--skip <feature,...>]
        次に着手すべきフィーチャーを表示する（途中の worktree を優先。--skip で除外）
  resolve <query>
        番号やスラッグからフィーチャー名を決める
  resume <feature>
        セッションを始めるときの要約。次のステップ、残っている [人]・[後]・未完了のタスク、確かめていない decisions.md の行、
        spec.md の（仮）、review の backlog を正本から生成し、作業中のメモ（specs/<feature>/{HANDOVER_FILE}）があれば
        古さ（基準コミットの後のコミット）と長さ（{HANDOVER_MAX_LINES} 行まで）を確かめて表示する
  commands [list | get <key> | set <key> <command> | unset <key>]
        プロジェクトの開発コマンドの正本（{COMMANDS_FILE}）を読み書きする。キーは {', '.join(COMMAND_KEYS)} など。
        使わないものは空文字で記録する。今いる作業ツリー（worktree の中ならその worktree）のファイルを読み書きし、コミットはしない。
        get は、記録がなければ終了コード 1
  doctor
        環境と設定を診断し、OK / WARN / ERROR の行と SUMMARY を出す（ERROR があれば終了コード 1）。Python、マージ先のブランチ、
        .gitignore の .worktrees/、開発コマンド（記録と PATH）、スキルのリンク、.specify/ と憲章、steering とエージェント向けの入口
  pitfalls
        落とし穴の受け箱（{PITFALLS_FILE}）の件数と、棚卸しが要る項目（{PITFALLS_MAX_ITEMS} 件を超えた、記録か据え置きから
        {PITFALLS_MAX_FEATURES} 機能をマージした）を表示する。status と finish（coding / all / deferred）の最後にも出る

Steps: {' '.join(ALL_STEPS)}（S1 は ensure、S12 は finish）
Exit codes: 0 = 成功, 1 = エラー, 3 = 前提条件を満たさない（PRECONDITION: <code> を stderr に出力）
Environment: SPECKIT_MAIN_BRANCH（既定のブランチ名。既定値 main）
             CLAUDE_CODE_REMOTE=true（Claude Code のクラウドセッション。SPECKIT_MAIN_BRANCH がなければ、
             メインの作業ツリーの今のブランチをマージ先にし、finish の後に origin へ push する）"""

COMMANDS = {
    "ensure": cmd_ensure,
    "state": cmd_state,
    "checkpoint": cmd_checkpoint,
    "finish": cmd_finish,
    "merge": cmd_finish,
    "abort": cmd_abort,
    "list": cmd_list,
    "status": cmd_status,
    "human-tasks": cmd_human_tasks,
    "deferred-tasks": cmd_deferred_tasks,
    "sync-status": cmd_sync_status,
    "next": cmd_next,
    "resolve": cmd_resolve,
    "resume": cmd_resume,
    "commands": cmd_commands,
    "doctor": cmd_doctor,
    "pitfalls": cmd_pitfalls,
}


def main(argv: list[str]) -> int:
    global REPO_ROOT, WORKTREES_DIR, MAIN_BRANCH
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    action = argv[0] if argv else "help"
    if action in ("help", "-h", "--help"):
        print(USAGE)
        return 0
    command = COMMANDS.get(action)
    try:
        if command is None:
            raise HelperError(f"不明なコマンド '{action}' です。'worktree_helper.py help' で使い方を確認してください。")
        REPO_ROOT = find_repo_root()
        WORKTREES_DIR = REPO_ROOT / ".worktrees"
        MAIN_BRANCH = resolve_main_branch()
        main_ok = git_ok(["rev-parse", "--verify", "-q", f"refs/heads/{MAIN_BRANCH}"])
        if action == "doctor":
            # 診断は、マージ先のブランチがなくても結果を出す（それ自体を ERROR として報告する）
            return cmd_doctor(argv[1:], main_ok)
        if not main_ok:
            raise HelperError(
                f"ブランチ {MAIN_BRANCH} がありません。既定のブランチが別の名前なら、環境変数 SPECKIT_MAIN_BRANCH にその名前を指定してください。")
        command(argv[1:])
    except Precondition as stop:
        print(f"PRECONDITION: {stop.code}", file=sys.stderr)
        print(str(stop), file=sys.stderr)
        return 3
    except HelperError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
