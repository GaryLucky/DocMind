from __future__ import annotations

import json
import re

from app.infra.llm.openai_compatible import OpenAICompatibleLLM

_CJK_RUN_RE = re.compile(r"[\u4e00-\u9fff]+")


def _strip_zh_question_suffix(text: str) -> str:
    q = text.strip()
    q = q.replace("？", "?").replace("。", ".").replace("，", ",").replace("！", "!")
    q = re.sub(r"[\s\?\.\!,，。！？]+$", "", q)
    suffixes = [
        "是谁",
        "是谁呢",
        "是什么",
        "是啥",
        "什么意思",
        "干什么的",
        "做什么的",
        "资料",
        "简介",
        "介绍",
    ]
    for s in suffixes:
        if q.endswith(s) and len(q) > len(s):
            return q[: -len(s)].strip()
    return q


def _fallback_term(query: str) -> str:
    q = _strip_zh_question_suffix(query)
    m = _CJK_RUN_RE.search(q)
    if m:
        return m.group(0)
    return q


def _parse_candidates(raw: str) -> list[str]:
    t = (raw or "").strip()
    if not t:
        return []
    try:
        data = json.loads(t)
    except Exception:
        data = None
    if isinstance(data, list):
        out: list[str] = []
        for x in data:
            if isinstance(x, str):
                s = x.strip()
                if s:
                    out.append(s)
        return out
    lines = [x.strip("-• \t\r\n") for x in t.splitlines()]
    return [x for x in lines if x]


def _parse_query_plan(raw: str) -> tuple[list[str], str]:
    t = (raw or "").strip()
    if not t:
        return [], ""
    try:
        data = json.loads(t)
    except Exception:
        return _parse_candidates(t), ""
    if not isinstance(data, dict):
        if isinstance(data, list):
            return _parse_candidates(t), ""
        return [], ""
    queries_raw = data.get("queries")
    hyde_raw = data.get("hyde")
    queries: list[str] = []
    if isinstance(queries_raw, list):
        for x in queries_raw:
            if isinstance(x, str) and x.strip():
                queries.append(x.strip())
    hyde = hyde_raw.strip() if isinstance(hyde_raw, str) else ""
    return queries, hyde


def _dedupe_keep_order(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for x in items:
        s = str(x).strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

async def expand_query(*, llm: OpenAICompatibleLLM, query: str, n: int) -> list[str]:
    q = query.strip()
    if not q:
        return []

    system = "你是检索查询扩展器。输出严格的 JSON 数组，元素是字符串，不要输出任何解释。"
    user = (
        "给定用户问题，生成更可能命中文档的同义/等价查询短语，用于召回。\n"
        f"要求：输出 {max(1, int(n))} 条；尽量保留专有名词；可以做近义词替换或更常见表达；每条尽量短。\n"
        f"用户问题：{q}"
    )
    raw = await llm.chat(system=system, user=user)
    candidates = _parse_candidates(raw)

    base = _fallback_term(q)
    out: list[str] = []
    seen: set[str] = set()
    for x in [q, base, *candidates]:
        s = str(x).strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max(1, int(n)) + 2:
            break
    return out


async def build_retrieval_queries(
    *,
    llm: OpenAICompatibleLLM,
    query: str,
    expand_n: int,
    hyde_enabled: bool,
    hyde_max_chars: int,
) -> list[str]:
    q = query.strip()
    if not q:
        return []

    base = _fallback_term(q)

    if not hyde_enabled and expand_n <= 0:
        return _dedupe_keep_order([q, base])

    system = "你是检索查询规划器。输出严格 JSON 对象：{queries: string[], hyde: string}，不要输出任何解释。"
    user = (
        "给定用户问题，生成用于召回的查询短语，以及一段用于语义检索的“假想答案/摘要”(HyDE)。\n"
        f"queries 要求：输出 {max(0, int(expand_n))} 条；尽量保留专有名词；可做近义词替换；每条尽量短。\n"
        f"hyde 要求：{max(60, int(hyde_max_chars))} 字以内；用更可能出现在文档中的表述；不要编造具体数字/事实。\n"
        f"用户问题：{q}"
    )
    raw = await llm.chat(system=system, user=user)
    queries, hyde = _parse_query_plan(raw)

    out = [q, base, *queries]
    if hyde_enabled and hyde:
        out.append(hyde[: max(1, int(hyde_max_chars))].strip())
    return _dedupe_keep_order(out)
