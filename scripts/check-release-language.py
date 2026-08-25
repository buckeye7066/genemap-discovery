#!/usr/bin/env python3
"""Reject repository language that turns deployment into a manual approval ritual."""

from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
import unicodedata


THIS_FILE = pathlib.PurePosixPath("scripts/check-release-language.py")
ROLE = "review" + "er"
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
        "mandatory external review",
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
    ("manual completion phrase", re.compile(rf"\bsign(?:ed|ing)?{SEPARATOR_RUN}off\b", re.I)),
)


def normalize_text(text: str) -> str:
    """Normalize one complete file before matching separator-tolerant phrases."""

    normalized = unicodedata.normalize("NFKC", text)
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Cf")
    return re.sub(r"[\s_\-\u2010-\u2015]+", " ", normalized)


def prohibited_labels(text: str) -> list[str]:
    normalized = normalize_text(text)
    return [label for label, pattern in PATTERNS if pattern.search(normalized)]


def tracked_text_files() -> list[pathlib.Path]:
    raw_paths = subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0")
    return [
        pathlib.Path(raw.decode("utf-8", "surrogateescape"))
        for raw in raw_paths
        if raw
    ]


def scan_repository() -> list[tuple[str, list[str]]]:
    violations: list[tuple[str, list[str]]] = []
    for path in tracked_text_files():
        if pathlib.PurePosixPath(path.as_posix()) == THIS_FILE:
            continue
        try:
            data = path.read_bytes()
        except OSError:
            continue
        if b"\0" in data:
            continue
        labels = prohibited_labels(data.decode("utf-8", "ignore"))
        if labels:
            violations.append((path.as_posix(), labels))
    return violations


def run_self_test() -> None:
    positive_probes = {
        "line break": "owner sign" + "\n" + "off required",
        "underscore": "owner signed" + "_" + "off required",
        "hyphen and line break": "owner signing" + "-\n" + "off required",
        "unicode hyphen": "owner sign" + "\u2011" + "off required",
        "zero width control": "owner sign" + "\u200b" + "off required",
        "role separator": "required" + "_\n" + ROLE,
    }
    negative_probes = {
        "cryptographic signature": "The commit is cryptographically signed.",
        "evidence record": "The operator records deployment evidence.",
        "scientific review": "Review source design and uncertainty.",
    }

    missed = [name for name, probe in positive_probes.items() if not prohibited_labels(probe)]
    false_positives = [name for name, probe in negative_probes.items() if prohibited_labels(probe)]
    if missed or false_positives:
        details = []
        if missed:
            details.append("missed probes: " + ", ".join(missed))
        if false_positives:
            details.append("false positives: " + ", ".join(false_positives))
        raise AssertionError("; ".join(details))
    print("Release language scanner self-test passed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        run_self_test()
        return 0

    violations = scan_repository()
    if violations:
        print("Prohibited release-gate language found:")
        for path, labels in violations:
            print(f"{path}: {', '.join(labels)}")
        return 1

    print("Release language policy passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
