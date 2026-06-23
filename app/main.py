"""Content Review Panel — FastAPI app.

Serves a single Bootstrap page (templates/index.html) plus a JSON API that talks
directly to Postgres. Access is gated by a simple session login backed by a
read-only Excel user list (see app/auth.py).
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from . import auth, db
from .config import SESSION_SECRET
from .routers import admin, concepts, meta, microconcepts, teaching

_BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(_BASE_DIR / "templates"))

# Paths reachable without a session.
_PUBLIC_PREFIXES = ("/login", "/logout", "/static", "/favicon")


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth.ensure_users_file()
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Content Review Panel", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(_BASE_DIR / "static")), name="static")


# Auth gate. Added before SessionMiddleware so that SessionMiddleware ends up
# outermost and request.session is populated by the time this runs.
@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if request.session.get("user") or any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return await call_next(request)
    if path.startswith("/api"):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return RedirectResponse("/login", status_code=303)


app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, max_age=60 * 60 * 12)

app.include_router(meta.router)
app.include_router(concepts.router)
app.include_router(microconcepts.router)
app.include_router(teaching.router)
app.include_router(admin.router)


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("user"):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/login", response_class=HTMLResponse)
async def login_submit(
    request: Request,
    user_id: str = Form(...),
    password: str = Form(...),
):
    user = auth.authenticate(user_id, password)
    if not user:
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Invalid user ID or password."},
            status_code=401,
        )
    request.session["user"] = user
    return RedirectResponse("/", status_code=303)


@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        "index.html", {"request": request, "user": request.session.get("user")}
    )
