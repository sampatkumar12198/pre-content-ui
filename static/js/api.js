// Shared helpers: HTTP, toast, escaping, and a reusable edit modal.

const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error((await safeErr(r)) || r.statusText);
    return r.json();
  },
  async send(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error((await safeErr(r)) || r.statusText);
    return r.json();
  },
};

async function safeErr(r) {
  try {
    const j = await r.json();
    return j.detail || null;
  } catch {
    return null;
  }
}

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s, n = 90) {
  if (!s) return '<span class="text-muted fst-italic">—</span>';
  s = String(s);
  return esc(s.length > n ? s.slice(0, n) + "…" : s);
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard", "success");
  } catch {
    // Fallback for older/insecure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Copy failed", "danger");
    }
  }
}

function statusBadge(isActive) {
  return isActive
    ? '<span class="badge text-bg-success">Active</span>'
    : '<span class="badge text-bg-secondary">Inactive</span>';
}

function fmtImportance(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(2);
}

let _toast;
function toast(msg, kind = "dark") {
  const el = document.getElementById("toast");
  el.className = `toast align-items-center border-0 text-bg-${kind}`;
  document.getElementById("toastBody").textContent = msg;
  _toast = _toast || new bootstrap.Toast(el, { delay: 2500 });
  _toast.show();
}

// Reusable edit modal -------------------------------------------------------
const EditModal = {
  _modal: null,
  _onSave: null,
  init() {
    this._modal = new bootstrap.Modal(document.getElementById("editModal"));
    document.getElementById("editForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const values = Object.fromEntries(fd.entries());
      try {
        await this._onSave(values);
        this._modal.hide();
        toast("Saved", "success");
      } catch (err) {
        toast("Save failed: " + err.message, "danger");
      }
    });
  },
  open({ title, fields, onSave }) {
    document.getElementById("editTitle").textContent = title;
    document.getElementById("editFields").innerHTML = fields
      .map((f) => {
        const v = esc(f.value);
        if (f.type === "textarea") {
          return `<div class="mb-3"><label class="form-label">${esc(f.label)}</label>
            <textarea class="form-control" name="${f.name}" rows="${f.rows || 3}">${v}</textarea></div>`;
        }
        return `<div class="mb-3"><label class="form-label">${esc(f.label)}</label>
          <input class="form-control" name="${f.name}" value="${v}" ${f.required ? "required" : ""}/></div>`;
      })
      .join("");
    this._onSave = onSave;
    this._modal.show();
  },
};
