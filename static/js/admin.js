// Admin "Users & Access" panel: assign exams to non-admin users.
//
// Master–detail layout: a searchable user list (left) drives a per-user exam
// editor (right). Only one user's exams are shown at a time, and both lists are
// filterable — so the page stays usable with many users and many exams.

const Admin = {
  _modal: null,
  _exams: [],
  _users: [],
  _selected: null, // selected user id
  _mode: "none", // "none" | "user" | "create"
  _pending: new Map(), // userId -> Set(examId): working copy, edited live
  _saved: new Map(), // userId -> Set(examId): last persisted state
  _userQuery: "",
  _examQuery: "",

  init() {
    if (!window.IS_ADMIN) return;
    this._modal = new bootstrap.Modal(document.getElementById("adminModal"));
    const btn = document.getElementById("adminBtn");
    if (btn) btn.addEventListener("click", () => this.open());
  },

  async open() {
    this._modal.show();
    await this._load();
  },

  async _load(selectId) {
    const hint = document.getElementById("adminHint");
    const content = document.getElementById("adminContent");
    hint.classList.remove("d-none");
    hint.textContent = "Loading…";
    content.classList.add("d-none");
    try {
      const [users, exams] = await Promise.all([
        API.get("/api/admin/users"),
        API.get("/api/admin/exams"),
      ]);
      this._exams = exams;
      this._loadState(users);
      this._pickSelection(selectId);
      this._render();
      hint.classList.add("d-none");
      content.classList.remove("d-none");
    } catch (err) {
      hint.textContent = "Failed to load: " + err.message;
    }
  },

  _loadState(users) {
    // Non-admins first (they're the editable ones), then by name.
    this._users = users
      .slice()
      .sort(
        (a, b) =>
          a.is_admin - b.is_admin ||
          (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
    this._pending = new Map();
    this._saved = new Map();
    for (const u of this._users) {
      if (u.is_admin) continue;
      this._pending.set(u.id, new Set(u.exam_ids || []));
      this._saved.set(u.id, new Set(u.exam_ids || []));
    }
  },

  _pickSelection(selectId) {
    const has = (id) => this._users.some((u) => u.id === id);
    if (selectId && has(selectId)) {
      this._selected = selectId;
      this._mode = "user";
    } else if (!has(this._selected)) {
      const first = this._users.find((u) => !u.is_admin) || this._users[0];
      this._selected = first ? first.id : null;
      this._mode = first ? "user" : "none";
    }
    this._examQuery = "";
  },

  // ---- rendering ------------------------------------------------------------

  _render() {
    const content = document.getElementById("adminContent");
    content.innerHTML = `
      <div class="admin-pane-wrap d-flex flex-column">
        <div class="row g-0 flex-grow-1" style="min-height:0">
          <div class="col-12 col-md-4 admin-col d-flex flex-column border-end">
            <div class="p-2 border-bottom">
              <button class="btn btn-sm btn-primary w-100 mb-2" onclick="Admin.showCreate()">
                <i class="bi bi-person-plus me-1"></i>Add user</button>
              <div class="input-group input-group-sm">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input id="admUserSearch" class="form-control" placeholder="Search users…"
                       autocomplete="off" value="${esc(this._userQuery)}"
                       oninput="Admin.onUserSearch(this.value)">
              </div>
            </div>
            <div id="admUserList" class="admin-userlist list-group list-group-flush overflow-auto flex-grow-1"></div>
          </div>
          <div class="col-12 col-md-8 admin-col admin-detail-col d-flex flex-column">
            <div id="admDetail" class="d-flex flex-column flex-grow-1" style="min-height:0"></div>
          </div>
        </div>
      </div>`;
    this._renderUserList();
    this._renderDetail();
  },

  _renderUserList() {
    const box = document.getElementById("admUserList");
    if (!box) return;
    const users = this._filteredUsers();
    if (!users.length) {
      box.innerHTML = `<div class="text-muted small p-3 text-center">No users match.</div>`;
      return;
    }
    box.innerHTML = users.map((u) => this._userRow(u)).join("");
  },

  _userRow(u) {
    const active = u.id === this._selected && this._mode === "user";
    let right;
    if (u.is_admin) {
      right = `<span class="badge text-bg-warning">admin</span>`;
    } else {
      const pend = this._pending.get(u.id) || new Set();
      const dirty = !this._setsEqual(pend, this._saved.get(u.id) || new Set());
      const tone = active ? "text-bg-light" : pend.size ? "text-bg-primary" : "text-bg-secondary";
      right =
        `<span class="badge ${tone} rounded-pill" title="${pend.size} exams assigned">${pend.size}</span>` +
        (dirty ? `<span class="text-warning ms-1" title="Unsaved changes">●</span>` : "");
    }
    return `
      <button type="button"
        class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 ${active ? "active" : ""}"
        onclick="Admin.select('${esc(u.id)}')">
        <span class="text-truncate me-2">
          <span class="fw-semibold">${esc(u.name)}</span>
          <span class="small ${active ? "" : "text-muted"}">${esc(u.id)}</span>
        </span>
        <span class="text-nowrap flex-shrink-0">${right}</span>
      </button>`;
  },

  _renderDetail() {
    const box = document.getElementById("admDetail");
    if (!box) return;
    if (this._mode === "create") {
      box.innerHTML = this._createForm();
      return;
    }
    const u = this._users.find((x) => x.id === this._selected);
    if (!u) {
      box.innerHTML = this._placeholder();
      return;
    }
    if (u.is_admin) {
      box.innerHTML = this._adminDetail(u);
      return;
    }
    box.innerHTML = this._userDetail(u);
    this._renderExamList();
  },

  _placeholder() {
    return `
      <div class="d-flex flex-column align-items-center justify-content-center text-muted h-100 p-4 text-center">
        <i class="bi bi-arrow-left-circle fs-2 mb-2"></i>
        <div>Select a user to manage their exam access,<br>
          or <button class="btn btn-link p-0 align-baseline" onclick="Admin.showCreate()">add a new user</button>.</div>
      </div>`;
  },

  _adminDetail(u) {
    return `
      <div class="p-3">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div class="text-truncate">
            <span class="fw-semibold fs-5">${esc(u.name)}</span>
            <span class="text-muted">(${esc(u.id)})</span>
            <span class="badge text-bg-warning ms-1">admin</span>
          </div>
          <button class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="Admin.remove('${esc(u.id)}')">
            <i class="bi bi-trash me-1"></i>Delete</button>
        </div>
        <div class="alert alert-warning mb-0">
          <i class="bi bi-shield-check me-1"></i>Admins have access to every exam. No per-exam settings needed.
        </div>
      </div>`;
  },

  _userDetail(u) {
    return `
      <div class="p-3 border-bottom">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div class="text-truncate">
            <span class="fw-semibold fs-5">${esc(u.name)}</span>
            <span class="text-muted">(${esc(u.id)})</span>
          </div>
          <div class="btn-group btn-group-sm flex-shrink-0">
            <button class="btn btn-success" onclick="Admin.save('${esc(u.id)}')">
              <i class="bi bi-save me-1"></i>Save</button>
            <button class="btn btn-outline-danger" title="Delete user" onclick="Admin.remove('${esc(u.id)}')">
              <i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="input-group input-group-sm">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input id="admExamSearch" class="form-control" placeholder="Search exams…" autocomplete="off"
                 value="${esc(this._examQuery)}" oninput="Admin.onExamSearch(this.value)">
          <button class="btn btn-outline-secondary" onclick="Admin.toggleAll(true)" title="Select all shown">All</button>
          <button class="btn btn-outline-secondary" onclick="Admin.toggleAll(false)" title="Clear all shown">None</button>
        </div>
        <div class="small mt-1" id="admCount"></div>
      </div>
      <div id="admExamList" class="admin-examlist overflow-auto flex-grow-1 p-2"></div>`;
  },

  _renderExamList() {
    const box = document.getElementById("admExamList");
    if (!box) return;
    const set = this._pending.get(this._selected) || new Set();
    const exams = this._filteredExams();
    if (!this._exams.length) {
      box.innerHTML = `<div class="text-muted small p-3 text-center">No exams exist yet.</div>`;
    } else if (!exams.length) {
      box.innerHTML = `<div class="text-muted small p-3 text-center">No exams match “${esc(this._examQuery)}”.</div>`;
    } else {
      box.innerHTML =
        `<div class="row g-1">` +
        exams
          .map((e) => {
            const checked = set.has(e.id) ? "checked" : "";
            const code = e.code ? ` <span class="text-muted">(${esc(e.code)})</span>` : "";
            return `
              <div class="col-12 col-lg-6">
                <label class="admin-exam-item d-flex align-items-center gap-2 px-2 py-1 rounded mb-0">
                  <input class="form-check-input flex-shrink-0 mt-0" type="checkbox" ${checked}
                         onchange="Admin.toggleExam(${e.id}, this.checked)">
                  <span class="small text-truncate">${esc(e.name)}${code}</span>
                </label>
              </div>`;
          })
          .join("") +
        `</div>`;
    }
    this._updateCount();
  },

  _updateCount() {
    const el = document.getElementById("admCount");
    if (!el) return;
    const set = this._pending.get(this._selected) || new Set();
    const dirty = !this._setsEqual(set, this._saved.get(this._selected) || new Set());
    const state = dirty
      ? `<span class="text-warning">unsaved changes</span>`
      : `<span class="text-success">saved</span>`;
    el.innerHTML = `<strong>${set.size}</strong> of ${this._exams.length} exams selected · ${state}`;
  },

  _createForm() {
    return `
      <div class="p-3">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h6 class="mb-0"><i class="bi bi-person-plus me-1"></i>Create user</h6>
          <button class="btn btn-sm btn-outline-secondary" onclick="Admin.cancelCreate()">Cancel</button>
        </div>
        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label small mb-0">User ID</label>
            <input id="nuId" class="form-control form-control-sm" autocomplete="off"></div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Name</label>
            <input id="nuName" class="form-control form-control-sm" autocomplete="off"></div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Password</label>
            <input id="nuPass" type="text" class="form-control form-control-sm" autocomplete="new-password"></div>
          <div class="col-md-6">
            <label class="form-label small mb-0">Role</label>
            <select id="nuRole" class="form-select form-select-sm">
              <option value="user" selected>user</option>
              <option value="admin">admin</option>
            </select></div>
        </div>
        <div class="d-flex justify-content-end mt-3">
          <button class="btn btn-sm btn-primary" onclick="Admin.create()">
            <i class="bi bi-plus-lg me-1"></i>Create user</button>
        </div>
        <div class="small text-muted mt-2">
          Create a <strong>user</strong>, then tick their exams and Save. Admins get all exams automatically.
        </div>
      </div>`;
  },

  // ---- filtering helpers ----------------------------------------------------

  _filteredUsers() {
    const q = this._userQuery.trim().toLowerCase();
    if (!q) return this._users;
    return this._users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) || (u.id || "").toLowerCase().includes(q)
    );
  },

  _filteredExams() {
    const q = this._examQuery.trim().toLowerCase();
    if (!q) return this._exams;
    return this._exams.filter(
      (e) =>
        (e.name || "").toLowerCase().includes(q) || (e.code || "").toLowerCase().includes(q)
    );
  },

  _setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  },

  // ---- interactions ---------------------------------------------------------

  onUserSearch(v) {
    this._userQuery = v;
    this._renderUserList();
  },

  onExamSearch(v) {
    this._examQuery = v;
    this._renderExamList();
  },

  select(userId) {
    this._selected = userId;
    this._mode = "user";
    this._examQuery = "";
    this._renderUserList();
    this._renderDetail();
  },

  showCreate() {
    this._mode = "create";
    this._renderUserList();
    this._renderDetail();
  },

  cancelCreate() {
    this._mode = this._selected ? "user" : "none";
    this._renderUserList();
    this._renderDetail();
  },

  toggleExam(examId, checked) {
    const set = this._pending.get(this._selected);
    if (!set) return;
    if (checked) set.add(examId);
    else set.delete(examId);
    this._updateCount();
    this._renderUserList(); // refresh count badge + unsaved dot
  },

  toggleAll(state) {
    const set = this._pending.get(this._selected);
    if (!set) return;
    // Operate on the exams currently shown (respects the exam search filter).
    this._filteredExams().forEach((e) => (state ? set.add(e.id) : set.delete(e.id)));
    this._renderExamList();
    this._renderUserList();
  },

  async save(userId) {
    const set = this._pending.get(userId) || new Set();
    const exam_ids = Array.from(set);
    try {
      await API.send("POST", `/api/admin/users/${encodeURIComponent(userId)}/exams`, { exam_ids });
      this._saved.set(userId, new Set(set));
      toast(`Saved access for ${userId} (${exam_ids.length} exams)`, "success");
      this._updateCount();
      this._renderUserList();
    } catch (err) {
      toast("Save failed: " + err.message, "danger");
    }
  },

  async create() {
    const get = (id) => document.getElementById(id).value;
    const id = get("nuId").trim();
    const name = get("nuName").trim();
    const password = get("nuPass");
    const role = get("nuRole");
    if (!id || !password) {
      toast("User ID and password are required", "warning");
      return;
    }
    try {
      await API.send("POST", "/api/admin/users", { id, name, password, role });
      toast(`Created ${role} "${id}"`, "success");
      await this._load(id); // reload and select the new user
    } catch (err) {
      toast("Create failed: " + err.message, "danger");
    }
  },

  async remove(userId) {
    if (!confirm(`Delete user "${userId}"? Removes their login and exam access.`)) return;
    try {
      await API.send("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`);
      toast(`Deleted ${userId}`, "success");
      if (this._selected === userId) {
        this._selected = null;
        this._mode = "none";
      }
      await this._load();
    } catch (err) {
      toast("Delete failed: " + err.message, "danger");
    }
  },
};
