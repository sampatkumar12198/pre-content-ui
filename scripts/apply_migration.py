"""Apply SQL files in migrations/ (idempotent; all use IF NOT EXISTS).

Usage:  python scripts/apply_migration.py
Reads DATABASE_URL from .env (strips any +asyncpg driver suffix).
"""
from __future__ import annotations

import sys
from pathlib import Path

import asyncpg
import asyncio

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import DATABASE_URL  # noqa: E402

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


async def main() -> None:
    conn = await asyncpg.connect(dsn=DATABASE_URL)
    try:
        for sql_file in sorted(MIGRATIONS.glob("*.sql")):
            print(f"Applying {sql_file.name} …")
            await conn.execute(sql_file.read_text())
        print("Done.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
