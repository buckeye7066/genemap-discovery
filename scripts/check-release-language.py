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


ROLE = bytes.fromhex("72 65 76 69 65 77 65 72").decode("ascii")
MANUAL_TOKEN = bytes.fromhex("6d 61 6e 75 61 6c").decode("ascii")
APPROVAL_TOKEN = bytes.fromhex("61 70 70 72 6f 76 61 6c").decode("ascii")
COMPLETION_TOKEN = bytes.fromhex("73 69 67 6e 6f 66 66").decode("ascii")
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
    ("human completion phrase", re.compile(rf"\bsign(?:s|ed|ing)?{SEPARATOR_RUN}off\b", re.I)),
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

_SOURCE_BOUNDARY_JOINERS = re.compile(
    r"""
    (?:
        </?(?:[A-Za-z][^<>]{0,2000})?>
        |
        ["'`]\s*[)\]}]*\s*\+\s*[(\[{]*\s*["'`]
        |
        ["'`]\s*}\s*{\s*["'`]
    )
    """,
    re.VERBOSE,
)


def normalize_text(text: str) -> str:
    """Normalize one complete file before matching separator-tolerant phrases."""

    normalized = unicodedata.normalize("NFKC", text)
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Cf")
    return re.sub(r"[\s_\-\u2010-\u2015]+", " ", normalized)


def source_boundary_projection(text: str) -> str:
    """Join text fragments separated only by common rendered-source syntax."""

    return _SOURCE_BOUNDARY_JOINERS.sub("", text)


def prohibited_labels(text: str) -> list[str]:
    variants = {
        normalize_text(text),
        normalize_text(source_boundary_projection(text)),
    }
    return [
        label
        for label, pattern in PATTERNS
        if any(pattern.search(variant) for variant in variants)
    ]


def _looks_like_text(text: str) -> bool:
    if not text:
        return True
    if "\0" in text:
        return False
    if text.count("\ufffd") / len(text) > 0.02:
        return False
    allowed_controls = {"\n", "\r", "\t", "\f"}
    readable = sum(char.isprintable() or char in allowed_controls for char in text)
    return readable / len(text) >= 0.85


def decode_text_candidates(data: bytes, path: str = "tracked blob") -> list[str]:
    """Return every plausible common-Unicode decoding of a tracked blob."""

    for bom, encoding in _BOM_ENCODINGS:
        if data.startswith(bom):
            try:
                decoded = data.decode(encoding)
            except UnicodeDecodeError as error:
                raise RuntimeError(f"{path}: invalid {encoding} text") from error
            return [decoded] if _looks_like_text(decoded) else []

    if b"\0" in data:
        decoded_candidates: list[str] = []
        for encoding in ("utf-32-le", "utf-32-be", "utf-16-le", "utf-16-be"):
            try:
                decoded = data.decode(encoding, "strict")
            except (UnicodeDecodeError, UnicodeError):
                continue
            if _looks_like_text(decoded) and decoded not in decoded_candidates:
                decoded_candidates.append(decoded)
        return decoded_candidates

    fallback = data.decode("utf-8", "replace") if data else ""
    return [fallback] if _looks_like_text(fallback) else []


def prohibited_blob_labels(data: bytes, path: str = "tracked blob") -> list[str]:
    found = {
        label
        for candidate in decode_text_candidates(data, path)
        for label in prohibited_labels(candidate)
    }
    return [label for label, _ in PATTERNS if label in found]


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
        labels = prohibited_blob_labels(data, path)
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
        missing_path.write_text(
            "owner " + COMPLETION_TOKEN[:4] + "-\n" + COMPLETION_TOKEN[4:],
            encoding="utf-8",
        )
        jsx_path = repo_root / "rendered.jsx"
        jsx_path.write_text(
            f"<span>{COMPLETION_TOKEN[:4]}</span>"
            f"<span>{COMPLETION_TOKEN[4:]}</span>",
            encoding="utf-8",
        )
        concatenated_path = repo_root / "concatenated.js"
        concatenated_path.write_text(
            "const status = "
            + repr(COMPLETION_TOKEN[:4])
            + " + "
            + repr(COMPLETION_TOKEN[4:])
            + ";",
            encoding="utf-8",
        )
        (repo_root / "binary.dat").write_bytes(
            b"\xff" * 96 + b" " + COMPLETION_TOKEN.encode("ascii") + b" "
        )

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
        expected_paths = {
            "concatenated.js",
            "encoded.txt",
            "missing.txt",
            "rendered.jsx",
        }
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
        "line break": "owner " + COMPLETION_TOKEN[:4] + "\n" + COMPLETION_TOKEN[4:] + " required",
        "underscore": (
            "owner " + COMPLETION_TOKEN[:4] + "ed_" + COMPLETION_TOKEN[4:] + " required"
        ),
        "hyphen and line break": (
            "owner " + COMPLETION_TOKEN[:4] + "ing-\n" + COMPLETION_TOKEN[4:] + " required"
        ),
        "third person": (
            "owner " + COMPLETION_TOKEN[:4] + "s " + COMPLETION_TOKEN[4:] + " required"
        ),
        "unicode hyphen": "owner " + COMPLETION_TOKEN[:4] + "\u2011" + COMPLETION_TOKEN[4:] + " required",
        "zero width control": "owner " + COMPLETION_TOKEN[:4] + "\u200b" + COMPLETION_TOKEN[4:] + " required",
        "role separator": "required" + "_\n" + ROLE,
        "human gate": human_gate + " required",
        "human gate line break": MANUAL_TOKEN + "\n" + APPROVAL_TOKEN,
        "JSX element boundary": (
            f"<span>{COMPLETION_TOKEN[:4]}</span>"
            f"<strong>{COMPLETION_TOKEN[4:]}</strong>"
        ),
        "string concatenation boundary": (
            repr(COMPLETION_TOKEN[:4]) + " + " + repr(COMPLETION_TOKEN[4:])
        ),
        "JSX expression boundary": (
            "{" + repr(COMPLETION_TOKEN[:4]) + "}"
            "{" + repr(COMPLETION_TOKEN[4:]) + "}"
        ),
        "human gate JSX boundary": (
            f"<span>{MANUAL_TOKEN}</span><span>{APPROVAL_TOKEN}</span>"
        ),
    }
    negative_probes = {
        "cryptographic signature": "The commit is cryptographically signed.",
        "evidence record": "The operator records deployment evidence.",
        "scientific review": "Review source design and uncertainty.",
        "ordinary action": "Create one manual backup before cutover.",
        "informed consent": "Confirm informed consent before collecting participant data.",
        "destructive action": "Confirm the exact record before irreversible deletion.",
        "safety boundary": "Acknowledge the safety warning before continuing.",
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
        "CJK-masked BOM-less UTF-16": (
            (chr(0x4E41) * 256 + " " + human_gate).encode("utf-16-le")
        ),
    }
    for name, payload in encoded_cases.items():
        decoded = decode_text_candidates(payload, name)
        if not any(prohibited_labels(candidate) for candidate in decoded):
            missed.append(name)

    replacement_heavy_binary = (
        b"\xff" * 96 + b" " + COMPLETION_TOKEN.encode("ascii") + b" "
    )
    if (
        decode_text_candidates(replacement_heavy_binary, "replacement-heavy binary")
        or prohibited_blob_labels(replacement_heavy_binary, "replacement-heavy binary")
    ):
        false_positives.append("replacement-heavy binary")

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
