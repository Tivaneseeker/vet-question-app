from __future__ import annotations

import argparse
import csv
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

FIELDS = ["分类", "题干", "A", "B", "C", "D", "E", "正确答案", "解析"]
CHOICES = ["A", "B", "C", "D", "E"]
DEFAULT_INPUTS = [Path(r"F:\vet-question-app\input"), Path(r"F:\vet-question-app\input_ocr")]
DEFAULT_OUTPUT = Path(r"F:\vet-question-app\output")


def read_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    lines: list[str] = []
    for paragraph in root.findall(".//w:p", ns):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", ns)).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def read_pdf(path: Path) -> str:
    try:
        import pdfplumber  # type: ignore
    except ImportError as exc:
        raise RuntimeError("读取 PDF 需要 pdfplumber，请先安装：pip install pdfplumber") from exc

    lines: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                lines.append(text)
    return "\n".join(lines)


def normalize_text(text: str) -> str:
    text = text.replace("\u3000", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def category_from_name(path: Path) -> str:
    name = path.name
    for category in ["基础科目", "预防科目", "临床科目", "综合科目"]:
        if category in name:
            return category
    return "未分类"


def split_blocks(text: str) -> list[str]:
    pattern = re.compile(r"(?m)(?=^\s*(?:\d{1,4}|[一二三四五六七八九十百]+)[\.、．]\s*)")
    blocks = [block.strip() for block in pattern.split(text) if block.strip()]
    return [block for block in blocks if re.search(r"(?:^|\n)\s*[A-EＡ-Ｅ][\.、．]\s*", block)]


def split_blocks_with_positions(text: str) -> list[tuple[int, str]]:
    pattern = re.compile(r"(?m)^\s*(?:\d{1,4}|[一二三四五六七八九十百]+)[\.、．]\s*")
    matches = list(pattern.finditer(text))
    blocks: list[tuple[int, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start() : end].strip()
        if re.search(r"(?:^|\n)\s*[A-EＡ-Ｅ][\.、．]\s*", block):
            blocks.append((match.start(), block))
    return blocks


def category_markers(text: str, fallback: str) -> list[tuple[int, str]]:
    markers: list[tuple[int, str]] = [(0, fallback)]
    normalized_pairs = [
        ("基础科目", "基础科目"),
        ("基础科⽬", "基础科目"),
        ("预防科目", "预防科目"),
        ("预防科⽬", "预防科目"),
        ("临床科目", "临床科目"),
        ("临床科⽬", "临床科目"),
        ("综合科目", "综合科目"),
        ("综合科⽬", "综合科目"),
        ("综合应用科目", "综合科目"),
        ("综合应⽤科⽬", "综合科目"),
    ]
    for raw, category in normalized_pairs:
        for match in re.finditer(re.escape(raw), text):
            markers.append((match.start(), category))
    return sorted(markers, key=lambda item: item[0])


def category_at(markers: list[tuple[int, str]], position: int) -> str:
    current = markers[0][1]
    for marker_position, category in markers:
        if marker_position > position:
            break
        current = category
    return current


def normalize_choice_key(value: str) -> str:
    table = str.maketrans("ＡＢＣＤＥ", "ABCDE")
    return value.translate(table).upper()


def extract_answer(block: str) -> str:
    patterns = [
        r"(?:参考答案|正确答案|答案|【答案】|答案解析)[:：\s]*([A-EＡ-Ｅ])",
        r"\(([A-EＡ-Ｅ])\)\s*(?:【?答案|正确)",
    ]
    for pattern in patterns:
        match = re.search(pattern, block, flags=re.IGNORECASE)
        if match:
            return normalize_choice_key(match.group(1))
    return ""


def extract_explanation(block: str) -> str:
    match = re.search(r"(?:解析|答案解析|【解析】)[:：\s]*(.+)", block, flags=re.IGNORECASE | re.S)
    if not match:
        return ""
    explanation = match.group(1).strip()
    explanation = re.sub(r"^(?:正确答案|答案)[:：\s]*[A-E]\s*", "", explanation, flags=re.IGNORECASE)
    return explanation.strip()


def parse_block(block: str, category: str, source: str = "") -> dict[str, str] | None:
    block = normalize_text(block)
    marker = re.search(r"(?:^|\n)\s*([A-EＡ-Ｅ])[\.、．]\s*", block)
    if not marker:
        return None

    stem = block[: marker.start()].strip()
    stem = re.sub(r"^\s*(?:\d{1,4}|[一二三四五六七八九十百]+)[\.、．]\s*", "", stem).strip()
    option_part = block[marker.start() :].strip()
    answer = extract_answer(block)
    explanation = extract_explanation(block)

    cleanup_start = re.search(r"(?:参考答案|正确答案|答案|解析|答案解析|【答案】|【解析】)", option_part)
    if cleanup_start:
        option_part = option_part[: cleanup_start.start()].strip()

    option_pattern = re.compile(r"(?:^|\n)\s*([A-EＡ-Ｅ])[\.、．]\s*")
    matches = list(option_pattern.finditer(option_part))
    options = {key: "" for key in CHOICES}
    for index, match in enumerate(matches):
        key = normalize_choice_key(match.group(1))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(option_part)
        value = option_part[start:end].strip()
        options[key] = re.sub(r"\s+", " ", value)

    if not stem or not options["A"] or not options["B"]:
        return None

    explanation_parts = []
    if answer:
        explanation_parts.append(f"标准答案：{answer}")
    if source:
        explanation_parts.append(f"出处：{source}")
    if explanation:
        explanation_parts.append(f"解析：{explanation}")

    return {
        "分类": category,
        "题干": stem,
        "A": options["A"],
        "B": options["B"],
        "C": options["C"],
        "D": options["D"],
        "E": options["E"],
        "正确答案": answer,
        "解析": "\n".join(explanation_parts),
    }


def iter_files(input_dirs: Iterable[Path]) -> Iterable[Path]:
    for directory in input_dirs:
        if not directory.exists():
            continue
        yield from sorted(directory.glob("*.docx"))
        yield from sorted(directory.glob("*.pdf"))


def read_file(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return read_docx(path)
    if path.suffix.lower() == ".pdf":
        return read_pdf(path)
    return ""


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="提取兽医职业考试单选题为 PWA 可导入 CSV")
    parser.add_argument("--input", action="append", dest="inputs", help="输入目录，可重复传入")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="输出目录")
    args = parser.parse_args()

    input_dirs = [Path(value) for value in args.inputs] if args.inputs else DEFAULT_INPUTS
    output_dir = Path(args.output)
    questions: list[dict[str, str]] = []
    needs_review: list[dict[str, str]] = []

    files = list(iter_files(input_dirs))
    if not files:
        print("没有找到 .docx 或 .pdf 文件", file=sys.stderr)
        return 1

    for path in files:
        print(f"读取：{path}")
        try:
            text = read_file(path)
        except Exception as exc:
            print(f"跳过 {path}: {exc}", file=sys.stderr)
            continue
        fallback_category = category_from_name(path)
        markers = category_markers(text, fallback_category)
        for position, block in split_blocks_with_positions(text):
            row = parse_block(block, category_at(markers, position), path.name)
            if not row:
                continue
            if row["正确答案"]:
                questions.append(row)
            else:
                needs_review.append(row)

    write_csv(output_dir / "questions.csv", questions)
    write_csv(output_dir / "needs_review.csv", needs_review)
    print(f"已输出：{output_dir / 'questions.csv'} ({len(questions)} 题)")
    print(f"需复核：{output_dir / 'needs_review.csv'} ({len(needs_review)} 题)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
