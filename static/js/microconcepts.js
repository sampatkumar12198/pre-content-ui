// Microconcept table inside the concept modal + edit/soft-delete + drill to content.

const Micro = {
  conceptId: null,
  page: 1,
  pageSize: 10,

  load(conceptId) {
    this.conceptId = conceptId;
    this.page = 1;
    return this.reload();
  },

  async reload() {
    const hint = document.getElementById("microHint");
    const wrap = document.getElementById("microTableWrap");
    const pager = document.getElementById("microPager");
    hint.classList.remove("d-none");
    hint.textContent = "Loading…";
    wrap.classList.add("d-none");
    pager.classList.add("d-none");

    const inc = document.getElementById("includeInactive").checked;
    const qs = new URLSearchParams({
      include_inactive: inc,
      page: this.page,
      page_size: this.pageSize,
    });
    let data;
    try {
      data = await API.get(`/api/concepts/${this.conceptId}/microconcepts?${qs}`);
    } catch (err) {
      hint.textContent = "Failed: " + err.message;
      return;
    }

    document.getElementById("cmMicroCount").textContent = data.total;
    if (!data.total) {
      hint.innerHTML = '<i class="bi bi-inbox fs-4 d-block mb-1"></i>No microconcepts linked to this concept.';
      return;
    }
    hint.classList.add("d-none");
    wrap.classList.remove("d-none");

    document.getElementById("microTbody").innerHTML = data.rows
      .map(
        (m) => `
      <tr class="${m.is_active ? "" : "table-secondary"}">
        <td class="fw-semibold">${esc(m.canonical_name)}<div class="small text-muted">${esc(m.slug || "")}</div></td>
        <td class="small">${truncate(m.description, 70)}</td>
        <td class="text-center">${m.tu_count}</td>
        <td class="text-center">${statusBadge(m.is_active)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" title="View content"
              onclick="Micro.view('${m.id}', this.dataset.n)" data-n="${esc(m.canonical_name)}"><i class="bi bi-eye"></i></button>
            <button class="btn btn-outline-secondary" title="Edit"
              onclick='Micro.edit(${JSON.stringify(JSON.stringify(m))})'><i class="bi bi-pencil"></i></button>
            <button class="btn ${m.is_active ? "btn-outline-danger" : "btn-outline-success"}"
              title="${m.is_active ? "Soft-delete" : "Restore"}"
              onclick="Micro.toggle('${m.id}', ${m.is_active})">
              <i class="bi ${m.is_active ? "bi-trash" : "bi-arrow-counterclockwise"}"></i></button>
          </div>
        </td>
      </tr>`
      )
      .join("");

    // pager
    const pages = Math.max(1, Math.ceil(data.total / data.page_size));
    document.getElementById("microPageInfo").textContent = `Page ${data.page} of ${pages} · ${data.total} total`;
    document.getElementById("microPrev").disabled = data.page <= 1;
    document.getElementById("microNext").disabled = data.page >= pages;
    pager.classList.remove("d-none");
  },

  view(mcId, name) {
    Teaching.openModal(mcId, "Microconcept · " + name);
  },

  edit(mJson) {
    const m = JSON.parse(mJson);
    EditModal.open({
      title: "Edit microconcept",
      fields: [
        { name: "canonical_name", label: "Name", value: m.canonical_name, required: true },
        { name: "description", label: "Description", value: m.description, type: "textarea" },
      ],
      onSave: async (v) => {
        await API.send("PUT", `/api/microconcepts/${m.id}`, v);
        this.reload();
      },
    });
  },

  async toggle(id, isActive) {
    const restoring = !isActive;
    if (isActive && !confirm("Soft-delete this microconcept?")) return;
    try {
      await API.send("PATCH", `/api/microconcepts/${id}/active`, { is_active: restoring });
      toast(restoring ? "Restored" : "Soft-deleted", "success");
      this.reload();
    } catch (err) {
      toast("Failed: " + err.message, "danger");
    }
  },

  initPager() {
    document.getElementById("microPrev").addEventListener("click", () => {
      if (this.page > 1) { this.page--; this.reload(); }
    });
    document.getElementById("microNext").addEventListener("click", () => {
      this.page++; this.reload();
    });
  },
};
