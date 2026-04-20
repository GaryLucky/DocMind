from __future__ import annotations

import io
import os

import httpx
from dotenv import dotenv_values


def load_remote_env_if_configured() -> None:
    url = (os.getenv("REMOTE_ENV_URL") or "").strip()
    if not url:
        return

    token = (os.getenv("REMOTE_ENV_TOKEN") or "").strip()
    override = (os.getenv("REMOTE_ENV_OVERRIDE") or "1").strip().lower() in {"1", "true", "yes", "y", "on"}
    required = (os.getenv("REMOTE_ENV_REQUIRED") or "0").strip().lower() in {"1", "true", "yes", "y", "on"}
    timeout_s = float((os.getenv("REMOTE_ENV_TIMEOUT_S") or "10").strip())

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = httpx.get(url, headers=headers, timeout=timeout_s)
        resp.raise_for_status()
        content = resp.text
    except Exception as e:
        if required:
            raise RuntimeError("remote_env_fetch_failed") from e
        return

    values = dotenv_values(stream=io.StringIO(content))
    for k, v in values.items():
        if k is None or k == "":
            continue
        if v is None:
            continue
        if override or os.getenv(k) is None:
            os.environ[k] = v
