#!/usr/bin/env python3
"""docs/design/（デザインの共通の決め事）と、機能ごとの画面仕様（specs/<NNN-name>/ui.md）を検証する。

使い方:
    python3 validate_design.py <docs/design のパス>                            # 共通の決め事だけ
    python3 validate_design.py <docs/design のパス> --feature specs/001-xxx    # 機能の画面仕様も

検証すること:
    - DESIGN.md と EXPERIENCE.md があり、必須の節がそろっている（「対象」が「UI なし」なら中身は問わない）。
      docs/design/ がない（デザインの工程を足す前に立ち上げた）プロジェクトでは、警告だけを出して機能の検証に進む
    - トークン（tokens.tokens.json と tokens.<テーマ>.tokens.json）が DTCG 2025.10 の形に沿っている
      （トークンは $value を持つ、$type が既知、color と dimension の値の形、参照 {a.b} が解決でき循環しない、
      参照先と型が一致する、テーマのファイルは基本のファイルにあるトークンだけを上書きする）
    - DESIGN.md の本文でバッククォートで囲んだトークン名（`color.brand.primary` など）がトークンにある（警告）
    - EXPERIENCE.md の画面一覧の ID（SCR-<機能番号>-<連番>）が重複せず、形が正しい
    - --feature のとき（ui.md がない、画面仕様の工程を足す前の機能は警告だけ）: ui.md の必須の節、画面 ID の機能番号、要件 ID（FR-xxx）が spec.md にあること、
      spec.md の FR が ui.md のどこかの画面に対応していること（警告）、EXPERIENCE.md の画面一覧に載っていること（警告）

終了コード: エラーが 1 件以上なら 1、なければ 0（警告は終了コードに影響しない）。
標準ライブラリだけで書く（Python 3.9 以上）。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DESIGN_SECTIONS = [
    "## ブランドとトーン",
    "## 色",
    "## 文字",
    "## レイアウトと余白",
    "## 形と奥行き",
    "## コンポーネント",
    "## してよいこと・してはいけないこと",
]
EXPERIENCE_SECTIONS = [
    "## 情報設計",
    "## 画面一覧",
    "## 画面遷移",
    "## 状態のパターン",
    "## 言葉づかい",
    "## アクセシビリティ",
]
UI_SECTIONS = [
    "## 画面一覧",
    "## 画面遷移",
    "## 画面ごとの仕様",
]
TARGET_RE = re.compile(r"\*\*対象\*\*:\s*(UI あり|UI なし)")
SCREEN_ID_RE = re.compile(r"\bSCR-(\d{3})-(\d{2})\b")
SCREEN_ROW_RE = re.compile(r"^\|\s*(SCR-[^\s|]+)\s*\|")
FR_RE = re.compile(r"\bFR-\d{3}\b")
# spec.md で要件を定義している行（「- **FR-001**: …」）。ほかの仕様の要件への参照（「001 の FR-040」など）は数えない
FR_DEF_RE = re.compile(r"^\s*[-*]\s*\*\*(FR-\d{3})\*\*", re.MULTILINE)
FEATURE_DIR_RE = re.compile(r"^(\d{3})-[a-z0-9]+(-[a-z0-9]+)*$")
TOKENS_FILE = "tokens.tokens.json"
THEME_FILE_RE = re.compile(r"^tokens\.([a-z0-9-]+)\.tokens\.json$")
# DTCG 2025.10 の型（Format モジュールの基本型と複合型）
TOKEN_TYPES = {
    "color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number",
    "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
}
DIMENSION_UNITS = {"px", "rem"}
DURATION_UNITS = {"ms", "s"}
FONT_WEIGHT_NAMES = {
    "thin", "hairline", "extra-light", "ultra-light", "light", "normal", "regular", "book", "medium",
    "semi-bold", "demi-bold", "bold", "extra-bold", "ultra-bold", "black", "heavy", "extra-black", "ultra-black",
}
ALIAS_RE = re.compile(r"^\{([^{}]+)\}$")
TOKEN_REF_RE = re.compile(r"`((?:color|font|space|radius|shadow|motion)\.[A-Za-z0-9_.-]+)`")

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def read(path: Path, missing_ok: bool = False) -> str | None:
    """UTF-8（BOM 付きも可）で読む。missing_ok なら、ないことを警告にする。"""
    try:
        return path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        (warn if missing_ok else err)(f"{path}: ファイルがありません")
    except UnicodeDecodeError:
        err(f"{path}: UTF-8 で読めません")
    return None


def target_of(text: str, path: Path) -> str | None:
    match = TARGET_RE.search(text)
    if not match:
        err(f"{path}: ヘッダに「**対象**: UI あり」か「**対象**: UI なし」がありません")
        return None
    return match.group(1)


def check_sections(text: str, path: Path, sections: list[str]) -> None:
    lines = {line.strip() for line in text.splitlines()}
    for section in sections:
        if section not in lines:
            err(f"{path}: 節「{section}」がありません")


# --- トークン ---------------------------------------------------------------

def flatten(node: dict, path: str, inherited: str | None, out: dict[str, dict], where: Path) -> None:
    """グループをたどり、トークン（$value を持つもの）を "a.b.c" → {type, value} にまとめる。"""
    group_type = node.get("$type", inherited)
    for key, child in node.items():
        if key.startswith("$"):
            continue
        name = f"{path}.{key}" if path else key
        if "." in key or "{" in key or "}" in key:
            err(f"{where}: {name}: 名前に「.」「{{」「}}」は使えません")
            continue
        if not isinstance(child, dict):
            err(f"{where}: {name}: トークンかグループ（オブジェクト）である必要があります")
            continue
        if "$value" in child:
            token_type = child.get("$type", group_type)
            out[name] = {"type": token_type, "value": child["$value"]}
        else:
            flatten(child, name, group_type, out, where)


def check_value(name: str, token_type: str | None, value: object, where: Path) -> None:
    if isinstance(value, str) and ALIAS_RE.match(value):
        return  # 参照は後でまとめて確かめる
    if isinstance(value, dict) and "$ref" in value:
        err(f"{where}: {name}: $ref（JSON Pointer）の参照には対応していません。\"{{a.b.c}}\" の形で参照します")
        return
    if token_type is None:
        err(f"{where}: {name}: $type がありません（トークンか、それを含むグループに書く）")
        return
    if token_type not in TOKEN_TYPES:
        err(f"{where}: {name}: $type「{token_type}」は DTCG の型ではありません")
        return
    if token_type == "color":
        if not (isinstance(value, dict) and isinstance(value.get("colorSpace"), str)
                and isinstance(value.get("components"), list)):
            err(f"{where}: {name}: color の $value は colorSpace と components を持つオブジェクトにします"
                "（例: {\"colorSpace\": \"srgb\", \"components\": [0.1, 0.2, 0.3], \"hex\": \"#1a334d\"}）")
    elif token_type == "dimension":
        if not (isinstance(value, dict) and isinstance(value.get("value"), (int, float))
                and value.get("unit") in DIMENSION_UNITS):
            err(f"{where}: {name}: dimension の $value は {{\"value\": 数値, \"unit\": \"px\" か \"rem\"}} にします")
    elif token_type == "duration":
        if not (isinstance(value, dict) and isinstance(value.get("value"), (int, float))
                and value.get("unit") in DURATION_UNITS):
            err(f"{where}: {name}: duration の $value は {{\"value\": 数値, \"unit\": \"ms\" か \"s\"}} にします")
    elif token_type == "fontWeight":
        numeric = isinstance(value, (int, float)) and not isinstance(value, bool) and 1 <= value <= 1000
        if not (numeric or value in FONT_WEIGHT_NAMES):
            err(f"{where}: {name}: fontWeight の $value は 1〜1000 の数値か、bold などの決まった名前にします")
    elif token_type == "fontFamily":
        if not (isinstance(value, str) or (isinstance(value, list) and value and all(isinstance(v, str) for v in value))):
            err(f"{where}: {name}: fontFamily の $value は文字列か、文字列の配列にします")
    elif token_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            err(f"{where}: {name}: number の $value は数値にします")


def resolve(name: str, tokens: dict[str, dict], where: Path, seen: tuple[str, ...] = ()) -> None:
    value = tokens[name]["value"]
    match = ALIAS_RE.match(value) if isinstance(value, str) else None
    if not match:
        return
    target = match.group(1)
    if target in seen or target == name:
        err(f"{where}: {name}: 参照が循環しています（{' → '.join((*seen, name, target))}）")
        return
    if target not in tokens:
        err(f"{where}: {name}: 参照先 {{{target}}} がありません")
        return
    own, other = tokens[name]["type"], tokens[target]["type"]
    if own and other and own != other:
        err(f"{where}: {name}: {own} のトークンが {other} のトークン {{{target}}} を参照しています")
        return
    resolve(target, tokens, where, (*seen, name))


def load_tokens(path: Path) -> dict[str, dict] | None:
    text = read(path)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        err(f"{path}: JSON として読めません（{error.lineno} 行 {error.colno} 列: {error.msg}）")
        return None
    if not isinstance(data, dict):
        err(f"{path}: 最上位はオブジェクトにします")
        return None
    tokens: dict[str, dict] = {}
    flatten(data, "", None, tokens, path)
    if not tokens:
        err(f"{path}: トークンが 1 つもありません")
    return tokens


def check_tokens(design_dir: Path) -> None:
    base_path = design_dir / TOKENS_FILE
    base = load_tokens(base_path)
    if base is None:
        return
    for name, token in base.items():
        check_value(name, token["type"], token["value"], base_path)
    for name in base:
        resolve(name, base, base_path)
    design = read(design_dir / "DESIGN.md", missing_ok=True) or ""
    for ref in sorted(set(TOKEN_REF_RE.findall(design))):
        if ref not in base and not any(name.startswith(ref + ".") for name in base):
            warn(f"{design_dir / 'DESIGN.md'}: トークン「{ref}」が {TOKENS_FILE} にありません")
    for group in ("color", "font", "space"):
        if not any(name == group or name.startswith(group + ".") for name in base):
            warn(f"{base_path}: グループ「{group}」がありません（色・文字・余白の基本のトークンを置く）")

    for path in sorted(design_dir.glob("tokens.*.tokens.json")):
        if not THEME_FILE_RE.match(path.name):
            warn(f"{path}: テーマのファイル名は tokens.<英小文字・数字・ハイフン>.tokens.json にします（検証していません）")
            continue
        theme = load_tokens(path)
        if theme is None:
            continue
        merged = {**base, **theme}
        for name, token in theme.items():
            if name not in base:
                err(f"{path}: {name}: 基本のファイル（{TOKENS_FILE}）にないトークンです。テーマは既存のトークンの上書きだけにします")
                continue
            token_type = token["type"] or base[name]["type"]
            check_value(name, token_type, token["value"], path)
        for name in theme:
            resolve(name, merged, path)


# --- 画面 -------------------------------------------------------------------

def screen_rows(text: str, path: Path) -> list[str]:
    """「## 画面一覧」の節の表の 1 列目の ID。"""
    ids: list[str] = []
    in_section = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_section = line.strip() == "## 画面一覧"
            continue
        if not in_section:
            continue
        match = SCREEN_ROW_RE.match(line)
        if not match:
            continue
        screen = match.group(1)
        if not SCREEN_ID_RE.fullmatch(screen):
            err(f"{path}: 画面 ID「{screen}」の形が違います（SCR-<機能番号 3 桁>-<連番 2 桁>。例: SCR-001-01）")
            continue
        ids.append(screen)
    seen: set[str] = set()
    for screen in ids:
        if screen in seen:
            err(f"{path}: 画面 ID「{screen}」が重複しています")
        seen.add(screen)
    return ids


def check_design_dir(design_dir: Path) -> tuple[str | None, list[str]]:
    """共通の決め事を検証し、対象（UI あり / なし）と EXPERIENCE.md の画面 ID を返す。"""
    design_md = design_dir / "DESIGN.md"
    experience_md = design_dir / "EXPERIENCE.md"
    if not design_dir.is_dir():
        warn(f"{design_dir}: ありません。デザインの共通の決め事がないので、speckit-design で作ってください")
        return None, []
    design = read(design_md)
    if design is None:
        return None, []
    target = target_of(design, design_md)
    if target == "UI なし":
        return target, []
    check_sections(design, design_md, DESIGN_SECTIONS)
    experience = read(experience_md)
    screens: list[str] = []
    if experience is not None:
        check_sections(experience, experience_md, EXPERIENCE_SECTIONS)
        screens = screen_rows(experience, experience_md)
        if not screens:
            warn(f"{experience_md}: 画面一覧に画面がありません")
    check_tokens(design_dir)
    return target, screens


def check_feature(feature_dir: Path, project_target: str | None, project_screens: list[str]) -> None:
    match = FEATURE_DIR_RE.match(feature_dir.name)
    if not match:
        err(f"{feature_dir}: ディレクトリ名が <NNN-name> の形ではありません")
        return
    number = match.group(1)
    ui_md = feature_dir / "ui.md"
    # 画面仕様の工程（S4-1）を足す前に仕様化した機能には ui.md がない。警告だけにする
    ui = read(ui_md, missing_ok=True)
    if ui is None:
        return
    target = target_of(ui, ui_md)
    if target is None or target == "UI なし":
        return
    if project_target == "UI なし":
        err(f"{ui_md}: docs/design/DESIGN.md が「UI なし」なのに、画面仕様が「UI あり」です")
    check_sections(ui, ui_md, UI_SECTIONS)
    screens = screen_rows(ui, ui_md)
    if not screens:
        err(f"{ui_md}: 画面一覧に画面がありません（画面のない機能は「**対象**: UI なし」にする）")
    for screen in screens:
        if SCREEN_ID_RE.fullmatch(screen).group(1) != number:
            err(f"{ui_md}: 画面 ID「{screen}」の機能番号が {number} ではありません")
        if project_screens and screen not in project_screens:
            warn(f"{ui_md}: 画面「{screen}」が docs/design/EXPERIENCE.md の画面一覧にありません（行を足す）")
        heading = re.search(rf"^###\s+{re.escape(screen)}\b", ui, re.MULTILINE)
        if not heading:
            err(f"{ui_md}: 画面「{screen}」の「### {screen} …」の節が「## 画面ごとの仕様」にありません")

    spec = (feature_dir / "spec.md")
    if not spec.is_file():
        warn(f"{spec}: spec.md がないため、要件との対応を確かめていません")
        return
    spec_text = read(spec)
    if spec_text is None:
        return
    spec_defined = set(FR_DEF_RE.findall(spec_text))
    # 定義の行が見つからない古い書き方の spec.md では、従来どおり出てくる FR をすべて要件とみなす
    spec_frs = spec_defined or set(FR_RE.findall(spec_text))
    spec_mentioned = set(FR_RE.findall(spec_text))
    ui_frs = set(FR_RE.findall(ui))
    # ui.md の FR が spec.md のどこにも出てこなければ誤り（参照として出てくるものは許す）
    for fr in sorted(ui_frs - spec_mentioned):
        err(f"{ui_md}: 要件「{fr}」が spec.md にありません")
    for fr in sorted(spec_frs - ui_frs):
        warn(f"{ui_md}: spec.md の「{fr}」に対応する画面がありません（画面を伴わない要件なら無視してよい）")


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = list(argv)
    feature: Path | None = None
    if "--feature" in args:
        index = args.index("--feature")
        if index + 1 >= len(args):
            print("使い方: validate_design.py <docs/design のパス> [--feature specs/<NNN-name>]", file=sys.stderr)
            return 2
        feature = Path(args[index + 1])
        del args[index:index + 2]
    if len(args) != 1:
        print("使い方: validate_design.py <docs/design のパス> [--feature specs/<NNN-name>]", file=sys.stderr)
        return 2
    design_dir = Path(args[0])
    target, screens = check_design_dir(design_dir)
    if feature is not None:
        check_feature(feature, target, screens)

    for message in errors:
        print(f"ERROR: {message}")
    for message in warnings:
        print(f"WARN: {message}")
    print(f"結果: エラー {len(errors)} 件、警告 {len(warnings)} 件")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
