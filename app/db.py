"""asyncpg connection pool lifecycle + small query helpers."""
from __future__ import annotations

import json
from typing import Any

import asyncpg

from .config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    """Decode json/jsonb columns into Python objects (e.g. the `images` array)."""
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename, encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
        )


async def connect() -> None:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=1,
            max_size=10,
            command_timeout=60,
            init=_init_conn,
        )


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised. Did startup run?")
    return _pool


async def fetch(sql: str, *args: Any) -> list[dict]:
    rows = await pool().fetch(sql, *args)
    return [dict(r) for r in rows]


async def fetchrow(sql: str, *args: Any) -> dict | None:
    row = await pool().fetchrow(sql, *args)
    return dict(row) if row is not None else None


async def fetchval(sql: str, *args: Any) -> Any:
    return await pool().fetchval(sql, *args)


async def execute(sql: str, *args: Any) -> str:
    return await pool().execute(sql, *args)
