// Admin "Users & Access" panel: assign exams to non-admin users.

const Admin = {
  _modal: null,
  _exams: [],

  init() {
    if (!window.IS_ADMIN) return;
    this._modal = new bootstrap.Modal(document.getElementById("adminModal"));
    const btn = document.getElementById("adminBtn");
    if (btn) btn.addEventListener("click", () => this.open());
  },

  async open() {
    this._modal.show();
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
      this._render(users);
      hint.classList.add("d-none");
      content.classList.remove("d-none");
    } catch (err) {
      hint.textContent = "Failed to load: " + err.message;
    }
  },

  _render(users) {
    const content = document.getElementById("adminContent");
    content.innerHTML =
      this._createForm() +
      users.map((u) => (u.is_admin ? this._adminCard(u) : this._userCard(u))).join("");
  },

  _createForm() {
    return `
      <div class="card mb-3 border-primary">
        <div class="card-header py-2 fw-semibold bg-primary-subtle">
          <i class="bi bi-person-plus me-1"></i>Create user</div>
        <div class="card-body py-2">
          <div class="row g-2 align-items-end">
            <div class="col-md-2">
              <label class="form-label small mb-0">User ID</label>
              <input id="nuId" class="form-control form-control-sm" autocomplete="off"></div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Name</label>
              <input id="nuName" class="form-control form-control-sm" autocomplete="off"></div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Password</label>
              <input id="nuPass" class="form-control form-control-sm" autocomplete="new-password"></div>
            <div class="col-md-2">
              <label class="form-label small mb-0">Role</label>
              <select id="nuRole" class="form-select form-select-sm">
                <option value="user" selected>user</option>
                <option value="admin">admin</option>
              </select></div>
            <div class="col-md-2">
              <button class="btn btn-sm btn-primary w-100" onclick="Admin.create()">
                <i class="bi bi-plus-lg me-1"></i>Create</button></div>
          </div>
          <div class="small text-muted mt-1">
            Create a <strong>user</strong>, then tick their exams below and Save. Admins get all exams.
          </div>
        </div>
      </div>`;
  },

  _adminCard(u) {
    return `
      <div class="card mb-2">
        <div class="card-body py-2 d-flex align-items-center justify-content-between">
          <div><span class="fw-semibold">${esc(u.name)}</span>
            <span class="text-muted small">(${esc(u.id)})</span>
            <span class="badge text-bg-warning ms-1">admin</span></div>
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted">Access to all exams</span>
            <button class="btn btn-sm btn-outline-danger" title="Delete user"
              onclick="Admin.remove('${esc(u.id)}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>`;
  },

  _userCard(u) {
    const assigned = new Set(u.exam_ids || []);
    const checks = this._exams
      .map(
        (e) => `
        <div class="col-md-4 col-sm-6">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${e.id}"
                   id="ex_${esc(u.id)}_${e.id}" ${assigned.has(e.id) ? "checked" : ""}>
            <label class="form-check-label small" for="ex_${esc(u.id)}_${e.id}">
              ${esc(e.name)}${e.code ? ` <span class="text-muted">(${esc(e.code)})</span>` : ""}
            </label>
          </div>
        </div>`
      )
      .join("");
    return `
      <div class="card mb-3" data-user="${esc(u.id)}">
        <div class="card-header d-flex align-items-center justify-content-between py-2">
          <div><span class="fw-semibold">${esc(u.name)}</span>
            <span class="text-muted small">(${esc(u.id)})</span></div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" onclick="Admin.toggleAll('${esc(u.id)}', true)">All</button>
            <button class="btn btn-outline-secondary" onclick="Admin.toggleAll('${esc(u.id)}', false)">None</button>
            <button class="btn btn-primary" onclick="Admin.save('${esc(u.id)}')">
              <i class="bi bi-save me-1"></i>Save</button>
            <button class="btn btn-outline-danger" title="Delete user"
              onclick="Admin.remove('${esc(u.id)}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="card-body py-2">
          <div class="row g-1">${checks}</div>
        </div>
      </div>`;
  },

  _boxes(userId) {
    const card = document.querySelector(`[data-user="${CSS.escape(userId)}"]`);
    return card ? Array.from(card.querySelectorAll('input[type="checkbox"]')) : [];
  },

  toggleAll(userId, state) {
    this._boxes(userId).forEach((b) => (b.checked = state));
  },

  async save(userId) {
    const exam_ids = this._boxes(userId)
      .filter((b) => b.checked)
      .map((b) => parseInt(b.value, 10));
    try {
      await API.send("POST", `/api/admin/users/${encodeURIComponent(userId)}/exams`, { exam_ids });
      toast(`Saved access for ${userId} (${exam_ids.length} exams)`, "success");
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
      await this.open(); // reload so the new user appears with exam checkboxes
    } catch (err) {
      toast("Create failed: " + err.message, "danger");
    }
  },

  async remove(userId) {
    if (!confirm(`Delete user "${userId}"? Removes their login and exam access.`)) return;
    try {
      await API.send("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`);
      toast(`Deleted ${userId}`, "success");
      await this.open();
    } catch (err) {
      toast("Delete failed: " + err.message, "danger");
    }
  },
};
