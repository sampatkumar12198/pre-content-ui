// Concepts grid (server-side pagination) + view (opens concept modal) / edit / soft-delete.

const Concepts = {
  _modal: null,
  init() {
    this._modal = new bootstrap.Modal(document.getElementById("conceptModal"));
  },

  async reload() {
    const s = window.state;
    const hint = document.getElementById("conceptHint");
    const wrap = document.getElementById("conceptTableWrap");
    const pager = document.getElementById("conceptPager");

    hint.classList.remove("d-none");
    hint.textContent = "Loading…";
    wrap.classList.add("d-none");

    // All filters are optional — no exam/subject means "all concepts".
    const qs = new URLSearchParams({
      search: s.search || "",
      include_inactive: s.includeInactive,
      page: s.page,
      page_size: s.pageSize,
    });
    if (s.examId) qs.set("exam_id", s.examId);
    if (s.subjectId) qs.set("subject_id", s.subjectId);
    let data;
    try {
      data = await API.get(`/api/concepts?${qs}`);
    } catch (err) {
      hint.textContent = "Failed: " + err.message;
      return;
    }

    document.getElementById("conceptCount").textContent = `${data.total} total`;
    if (!data.total) {
      hint.innerHTML = '<i class="bi bi-search fs-4 d-block mb-1"></i>No concepts match.';
      pager.classList.add("d-none");
      return;
    }
    hint.classList.add("d-none");
    wrap.classList.remove("d-none");

    document.getElementById("conceptTbody").innerHTML = data.rows
      .map(
        (c) => `
      <tr class="${c.is_active ? "" : "table-secondary"}">
        <td class="fw-semibold">${esc(c.canonical_name)}<div class="small text-muted">${esc(c.slug || "")}</div></td>
        <td class="small">${truncate(c.description, 80)}</td>
        <td class="text-center">${fmtImportance(c.importance)}</td>
        <td class="text-center"><span class="badge text-bg-light text-dark border">${c.micro_count}</span></td>
        <td class="text-center"><span class="badge ${c.tu_count ? "text-bg-light text-dark border" : "text-bg-warning"}">${c.tu_count}</span></td>
        <td class="text-center">${statusBadge(c.is_active)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" title="View"
              onclick='Concepts.view(${JSON.stringify(JSON.stringify(c))})'><i class="bi bi-eye"></i></button>
            <button class="btn btn-outline-secondary" title="Edit"
              onclick='Concepts.edit(${JSON.stringify(JSON.stringify(c))})'><i class="bi bi-pencil"></i></button>
            <button class="btn ${c.is_active ? "btn-outline-danger" : "btn-outline-success"}"
              title="${c.is_active ? "Soft-delete" : "Restore"}"
              onclick="Concepts.toggle('${c.id}', ${c.is_active})">
              <i class="bi ${c.is_active ? "bi-trash" : "bi-arrow-counterclockwise"}"></i></button>
          </div>
        </td>
      </tr>`
      )
      .join("");

    const pages = Math.max(1, Math.ceil(data.total / data.page_size));
    const from = (data.page - 1) * data.page_size + 1;
    const to = Math.min(data.page * data.page_size, data.total);
    document.getElementById("pageInfo").textContent =
      `Showing ${from}–${to} of ${data.total} · page ${data.page}/${pages}`;
    document.getElementById("prevBtn").disabled = data.page <= 1;
    document.getElementById("nextBtn").disabled = data.page >= pages;
    pager.classList.remove("d-none");
  },

  view(cJson) {
    const c = JSON.parse(cJson);
    document.getElementById("cmTitle").textContent = c.canonical_name;
    document.getElementById("cmTuCount").textContent = c.tu_count;
    document.getElementById("cmMicroCount").textContent = c.micro_count;
    // reset to first tab
    bootstrap.Tab.getOrCreateInstance(document.querySelector('[data-bs-target="#tabMicro"]')).show();
    this._modal.show();
    Micro.load(c.id);
    Teaching.render(document.getElementById("conceptTuContainer"), c.id);
  },

  edit(cJson) {
    const c = JSON.parse(cJson);
    EditModal.open({
      title: "Edit concept",
      fields: [
        { name: "canonical_name", label: "Name", value: c.canonical_name, required: true },
        { name: "description", label: "Description", value: c.description, type: "textarea" },
      ],
      onSave: async (v) => {
        await API.send("PUT", `/api/concepts/${c.id}`, v);
        this.reload();
      },
    });
  },

  async toggle(id, isActive) {
    const restoring = !isActive;
    if (isActive && !confirm("Soft-delete this concept?")) return;
    try {
      await API.send("PATCH", `/api/concepts/${id}/active`, { is_active: restoring });
      toast(restoring ? "Restored" : "Soft-deleted", "success");
      this.reload();
    } catch (err) {
      toast("Failed: " + err.message, "danger");
    }
  },
};
