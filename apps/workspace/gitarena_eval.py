"""Lightweight GitArena evaluator helper library."""

from __future__ import annotations

from typing import List, Tuple

import pygit2

_assertions: List[Tuple[str, bool, str]] = []


def repo(path: str = "/workspace") -> pygit2.Repository:
    """Open a git repository for evaluation checks."""
    return pygit2.Repository(path)


def assert_pass(check_id: str, condition: bool, explanation: str) -> bool:
    """Emit PASS/FAIL output and record assertion status."""
    passed = bool(condition)
    status = "PASS" if passed else "FAIL"
    print(f"{status}:{check_id}:{explanation}")
    _assertions.append((check_id, passed, explanation))
    return passed


def score() -> None:
    """Emit SCORE line based on recorded assertions."""
    total = len(_assertions)
    passed = sum(1 for _, ok, _ in _assertions if ok)
    print(f"SCORE:{passed}/{total}")
