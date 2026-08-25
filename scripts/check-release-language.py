#!/usr/bin/env python3
"""Reject repository language that turns deployment into a human ceremony."""

from __future__ import annotations

import argparse
import codecs
import pathlib
import re
import subprocess
import sys
import tempfile
import unicodedata


ROLE = "review" + "er"
MANUAL_TOKEN = "man" + "ual"
APPROVAL_TOKEN = "approv" + "al"
SEPARATOR_RUN = r"[\s_\-\u2010-\u2015]*"
PATTERNS = (
    (
        "authenticated release role",
        re.compile(rf"\bauthenticated\s+(?:release{SEPARATOR_RUN})?{ROLE}s?\b", re.I),
    ),
    (
        "required external role",
        re.compile(
            rf"\b(?:independent|external)\s+(?:release{SEPARATOR_RUN})?{ROLE}s?\s+(?:are\s+)?required\b",
            re.I,
        ),
    ),
    (
        "compelled outside review",
        re.compile(r"\bmandatory\s+(?:independent|external)\s+review\b", re.I),
    ),
    (
        "fixed role count",
        re.compile(
            rf"\b(?:five|5)\s+(?:distinct\s+)?(?:authenticated\s+)?(?:exact{SEPARATOR_RUN}head\s+)?{ROLE}s?\b",
            re.I,
        ),
    ),
    (
        "fixed approval count",
        re.compile(
            rf"\b(?:five|5)\s+(?:exact{SEPARATOR_RUN}head\s+)?(?:independent\s+)?approvals?\b",
            re.I,
        ),
    ),
    ("required role", re.compile(rf"\brequired{SEPARATOR_RUN}{ROLE}s?\b", re.I)),
    ("authenticated role", re.compile(rf"\b{ROLE}{SEPARATOR_RUN}authenticated\b", re.I)),
    ("human completion phrase", re.compile(rf"\bsign(?:ed|ing)?{SEPARATOR_RUN}off\b", re.I)),
    (
        "human approval phrase",
        re.compile(
            rf"\b{MANUAL_TOKEN}{SEPARATOR_RUN}(?:release{SEPARATOR_RUN})?{APPROVAL_TOKEN}s?\b",
            re.I,
        ),
    ),
)

_BOM_ENCODINGS = (
    (codecs.BOM_UTF32_LE, "utf-32"),
    (codecs.BOM_UTF32_BE, "utf-32"),
    (codecs.BOM_UTF8, "utf-8-sig"),
    (codecs.BOM_UTF16_LE, "utf-16"),
    (codecs.BOM_UTF16_BE, "utf-16"),
)


def normalize_text(text: str) -> str:
    """Normalize one complete file before matching separator-tolerant phrases."""

    normalized = unicodedata.normalize("NFKC", text)
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Cf")
    return re.sub(r"[\s_\-\u2010-\u2015]+", " ", normalized)


def prohibited_labels(text: str) -> list[str]:
    normalized = normalize_text(text)
    return [label for label, pattern in PATTERNS if pattern.search(normalized)]


def _looks_like_text(text: str) -> bool:
    if not text:
        return True
    allowed_controls = {"\n", "\r", "\t", "\f"}
    readable = sum(char.isprintable() or char in allowed_controls for char in text)
    return readable / len(text) >= 0.85


def _zero_fraction(data: bytes, offset: int, stride: int) -> float:
    values = data[offset::stride]
    if not values:
        return 0.0
    return sum(value == 0 for value in values) / len(values)


def decode_text_blob(data: bytes, path: str = "tracked blob") -> str | None:
    """Decode common Unicode text first; return None only for likely binary data."""

    for bom, encoding in _BOM_ENCODINGS:
        if data.startswith(bom):
            try:
                return data.decode(encoding)
            except UnicodeDecodeError as error:
                raise RuntimeError(f"{path}: invalid {encoding} text") from error

    try:
        utf8 = data.decode("utf-8")
    except UnicodeDecodeError:
        utf8 = None
    if utf8 is not None and _looks_like_text(utf8):
        return utf8

    candidates: list[tuple[float, str]] = []
    if len(data) % 4 == 0 and data:
        candidates.extend([
            (
                sum(_zero_fraction(data, offset, 4) for offset in (1, 2, 3)) / 3,
                "utf-32-le",
            ),
            (
                sum(_zero_fraction(data, offset, 4) for offset in (0, 1, 2)) / 3,
                "utf-32-be",
            ),
        ])
    if len(data) % 2 == 0 and data:
        candidates.extend([
            (_zero_fraction(data, 1, 2), "utf-16-le"),
            (_zero_fraction(data, 0, 2), "utf-16-be"),
        ])

    for confidence, encoding in sorted(candidates, reverse=True):
        if confidence < 0.2:
            continue
        try:
            decoded = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        if _looks_like_text(decoded):
            return decoded

    if b"\0" in data:
        return None

    fallback = data.decode("utf-8", "replace")
    return fallback if _looks_like_text(fallback) else None


def tracked_index_entries(repo_root: pathlib.Path | str = ".") -> list[tuple[str, str, str]]:
    """Return path, mode, and blob id for every stage-zero tracked index entry."""

    raw_entries = subprocess.check_output(
        ["git", "ls-files", "--stage", "-z"],
        cwd=repo_root,
    ).split(b"\0")
    entries: list[tuple[str, str, str]] = []
    for raw_entry in raw_entries:
        if not raw_entry:
            continue
        try:
            metadata, raw_path = raw_entry.split(b"\t", 1)
            mode, object_id, stage = metadata.decode("ascii").split()
        except (ValueError, UnicodeDecodeError) as error:
            raise RuntimeError("Unable to parse a tracked index entry") from error
        if stage != "0":
            raise RuntimeError("Repository index contains an unresolved staged entry")
        path = raw_path.decode("utf-8", "surrogateescape")
        entries.append((path, mode, object_id))
    return entries


def read_index_blob(
    path: str,
    mode: str,
    object_id: str,
    repo_root: pathlib.Path | str = ".",
) -> bytes | None:
    if mode == "160000":
        return None
    if mode not in {"100644", "100755", "120000"}:
        raise RuntimeError(f"{path}: unsupported tracked mode {mode}")
    try:
        return subprocess.check_output(
            ["git", "cat-file", "blob", object_id],
            cwd=repo_root,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"{path}: unable to read tracked blob ({detail})") from error


def scan_repository(repo_root: pathlib.Path | str = ".") -> list[tuple[str, list[str]]]:
    violations: list[tuple[str, list[str]]] = []
    blob_cache: dict[str, bytes | None] = {}
    for path, mode, object_id in tracked_index_entries(repo_root):
        cache_key = f"{mode}:{object_id}"
        if cache_key not in blob_cache:
            blob_cache[cache_key] = read_index_blob(path, mode, object_id, repo_root)
        data = blob_cache[cache_key]
        if data is None:
            continue
        text = decode_text_blob(data, path)
        if text is None:
            continue
        labels = prohibited_labels(text)
        if labels:
            violations.append((path, labels))
    return violations


def _run_index_self_test(scanner_source: str) -> None:
    with tempfile.TemporaryDirectory(prefix="release-language-scanner-") as temp_dir:
        repo_root = pathlib.Path(temp_dir)
        subprocess.run(
            ["git", "init", "--quiet"],
            cwd=repo_root,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        scanner_path = repo_root / "scripts" / "check-release-language.py"
        scanner_path.parent.mkdir(parents=True)
        scanner_path.write_text(scanner_source, encoding="utf-8")

        encoded_path = repo_root / "encoded.txt"
        encoded_path.write_bytes(
            ("owner " + MANUAL_TOKEN + "\n" + APPROVAL_TOKEN).encode("utf-16")
        )
        missing_path = repo_root / "missing.txt"
        missing_path.write_text("owner sign" + "-\n" + "off", encoding="utf-8")
        (repo_root / "binary.dat").write_bytes(b"\x89PNG\r\n\x1a\n\xff\xd8\xff\xe0")

        subprocess.run(
            ["git", "add", "--all"],
            cwd=repo_root,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        missing_path.unlink()

        tracked_paths = {path for path, _, _ in tracked_index_entries(repo_root)}
        violations = dict(scan_repository(repo_root))
        expected_paths = {"encoded.txt", "missing.txt"}
        if not expected_paths.issubset(violations):
            missing = sorted(expected_paths - violations.keys())
            raise AssertionError("index scan missed: " + ", ".join(missing))
        if "scripts/check-release-language.py" not in tracked_paths:
            raise AssertionError("scanner source was not included in tracked index entries")
        if "scripts/check-release-language.py" in violations or "binary.dat" in violations:
            raise AssertionError("index scan misclassified scanner source or binary fixture")


def run_self_test() -> None:
    human_gate = MANUAL_TOKEN + "_" + APPROVAL_TOKEN
    positive_probes = {
        "line break": "owner sign" + "\n" + "off required",
        "underscore": "owner signed" + "_" + "off required",
        "hyphen and line break": "owner signing" + "-\n" + "off required",
        "unicode hyphen": "owner sign" + "\u2011" + "off required",
        "zero width control": "owner sign" + "\u200b" + "off required",
        "role separator": "required" + "_\n" + ROLE,
        "human gate": human_gate + " required",
        "human gate line break": MANUAL_TOKEN + "\n" + APPROVAL_TOKEN,
    }
    negative_probes = {
        "cryptographic signature": "The commit is cryptographically signed.",
        "evidence record": "The operator records deployment evidence.",
        "scientific review": "Review source design and uncertainty.",
        "ordinary action": "Create one manual backup before cutover.",
    }

    missed = [name for name, probe in positive_probes.items() if not prohibited_labels(probe)]
    false_positives = [name for name, probe in negative_probes.items() if prohibited_labels(probe)]

    encoded_probe = ("owner " + human_gate).encode("utf-8")
    encoded_cases = {
        "utf-8 BOM": codecs.BOM_UTF8 + encoded_probe,
        "utf-16 LE BOM": ("owner " + human_gate).encode("utf-16"),
        "utf-16 BE BOM": codecs.BOM_UTF16_BE
        + ("owner " + human_gate).encode("utf-16-be"),
        "utf-16 LE": ("owner " + human_gate).encode("utf-16-le"),
        "utf-16 BE": ("owner " + human_gate).encode("utf-16-be"),
        "utf-32 LE BOM": ("owner " + human_gate).encode("utf-32"),
        "utf-32 BE BOM": codecs.BOM_UTF32_BE
        + ("owner " + human_gate).encode("utf-32-be"),
        "utf-32 LE": ("owner " + human_gate).encode("utf-32-le"),
        "utf-32 BE": ("owner " + human_gate).encode("utf-32-be"),
    }
    for name, payload in encoded_cases.items():
        decoded = decode_text_blob(payload, name)
        if decoded is None or not prohibited_labels(decoded):
            missed.append(name)

    source = pathlib.Path(__file__).read_text(encoding="utf-8")
    if prohibited_labels(source):
        false_positives.append("scanner source")

    if missed or false_positives:
        details = []
        if missed:
            details.append("missed probes: " + ", ".join(missed))
        if false_positives:
            details.append("false positives: " + ", ".join(false_positives))
        raise AssertionError("; ".join(details))
    _run_index_self_test(source)
    print("Release language scanner self-test passed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        run_self_test()
        return 0

    try:
        violations = scan_repository()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Release language scan failed: {error}")
        return 2
    if violations:
        print("Prohibited release-gate language found:")
        for path, labels in violations:
            print(f"{path}: {', '.join(labels)}")
        return 1

    print("Release language policy passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
