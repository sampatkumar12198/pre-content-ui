// Teaching content viewer for a node (concept or microconcept) + TU edit/soft-delete.

const Teaching = {
  _modal: null,
  _imgModal: null,
  _last: null, // { container, nodeId } -> what to re-render after a mutation
  _unitsById: {}, // tu_id -> unit, so edit() needn't inline data into HTML attrs

  _currentImageUrl: null,

  init() {
    this._modal = new bootstrap.Modal(document.getElementById("teachingModal"));
    this._imgModal = new bootstrap.Modal(document.getElementById("imageModal"));
    document
      .getElementById("imgCopy")
      .addEventListener("click", () => this.copyImage(this._currentImageUrl));
  },

  // Render teaching units for a node into a container element.
  async render(container, nodeId) {
    this._last = { container, nodeId };
    container.innerHTML = '<div class="text-muted py-3 text-center">Loading…</div>';
    let units;
    try {
      units = await API.get(`/api/nodes/${nodeId}/teaching-content`);
    } catch (err) {
      container.innerHTML = `<div class="text-danger py-3">Failed to load: ${esc(err.message)}</div>`;
      return;
    }
    if (!units.length) {
      container.innerHTML =
        '<div class="text-muted text-center py-4"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No teaching content for this item.</div>';
      return;
    }
    units.forEach((u) => { this._unitsById[u.id] = u; });
    container.innerHTML = units.map((u) => this._card(u)).join("");
  },

  // Open the standalone teaching modal for a node (used from microconcept "view").
  async openModal(nodeId, title) {
    document.getElementById("tmTitle").textContent = title || "Teaching content";
    const container = document.getElementById("teachingContainer");
    this._modal.show();
    await this.render(container, nodeId);
  },

  _refresh() {
    if (this._last) this.render(this._last.container, this._last.nodeId);
  },

  _card(u) {
    const badges = [
      u.angle ? `<span class="badge text-bg-info">${esc(u.angle)}</span>` : "",
      u.intrinsic_depth ? `<span class="badge text-bg-light text-dark border">${esc(u.intrinsic_depth)}</span>` : "",
      u.status ? `<span class="badge text-bg-primary">${esc(u.status)}</span>` : "",
      statusBadge(u.is_active),
    ].join(" ");
    const speech = u.speech_text
      ? `<details class="mt-2"><summary class="small text-primary" style="cursor:pointer">
           Show lesson text${u.variant_count > 1 ? ` (${u.variant_count} variants)` : ""}</summary>
         <div class="speech-text border rounded p-2 mt-2">${esc(u.speech_text)}</div></details>`
      : '<div class="small text-muted mt-2">No lesson text variant.</div>';
    const images = this._imageStrip(u.images);
    return `
      <div class="card mb-2 ${u.is_active ? "" : "opacity-75"}">
        <div class="card-body py-2">
          <div class="d-flex justify-content-between align-items-start">
            <div class="pe-2">
              <div class="fw-semibold">${esc(u.title)}</div>
              <div class="small text-muted">${badges}</div>
            </div>
            <div class="btn-group btn-group-sm flex-shrink-0">
              <button class="btn btn-outline-secondary" title="Copy lesson text"
                onclick="Teaching.copyText('${u.id}')"><i class="bi bi-clipboard"></i></button>
              <button class="btn btn-outline-secondary" title="Edit"
                onclick="Teaching.edit('${u.id}')"><i class="bi bi-pencil"></i></button>
              <button class="btn ${u.is_active ? "btn-outline-danger" : "btn-outline-success"}"
                title="${u.is_active ? "Soft-delete" : "Restore"}"
                onclick="Teaching.toggle('${u.id}', ${u.is_active})">
                <i class="bi ${u.is_active ? "bi-trash" : "bi-arrow-counterclockwise"}"></i></button>
            </div>
          </div>
          ${u.objective ? `<div class="small mt-1"><strong>Objective:</strong> ${esc(u.objective)}</div>` : ""}
          ${u.scope_note ? `<div class="small text-muted mt-1"><strong>Scope:</strong> ${esc(u.scope_note)}</div>` : ""}
          ${images}
          ${speech}
        </div>
      </div>`;
  },

  // Thumbnail strip for a teaching unit's associated images; click to enlarge.
  _imageStrip(images) {
    const list = Array.isArray(images) ? images : [];
    if (!list.length) return "";
    const thumbs = list
      .map((im) => {
        const url = `/api/assets/${im.artifact_id}/image`;
        const alt = im.alt_text || "Teaching image";
        return `<div class="tu-thumb" title="${esc(alt)}">
            <img src="${url}" alt="${esc(alt)}" loading="lazy"
                 onclick="Teaching.viewImage('${url}', this.alt)"
                 onerror="this.closest('.tu-thumb').classList.add('tu-thumb-failed')"/>
            <button type="button" class="tu-thumb-copy" title="Copy image"
                    onclick="Teaching.copyImage('${url}')"><i class="bi bi-clipboard"></i></button>
            <span class="tu-thumb-zoom"><i class="bi bi-zoom-in"></i></span>
          </div>`;
      })
      .join("");
    return `<div class="mt-2">
        <div class="small text-muted mb-1"><i class="bi bi-image me-1"></i>Image${list.length > 1 ? "s" : ""} (${list.length})</div>
        <div class="tu-images d-flex flex-wrap gap-2">${thumbs}</div>
      </div>`;
  },

  // Open the lightbox for a single image.
  viewImage(url, alt) {
    this._currentImageUrl = url;
    document.getElementById("imgFull").src = url;
    document.getElementById("imgFull").alt = alt || "";
    document.getElementById("imgCaption").textContent = alt || "";
    document.getElementById("imgOpenNew").href = url;
    this._imgModal.show();
  },

  // Copy a teaching unit's lesson text to the clipboard.
  async copyText(tuId) {
    const u = this._unitsById[tuId];
    const text = u && u.speech_text;
    if (!text) { toast("No lesson text to copy.", "warning"); return; }
    await copyTextToClipboard(text);
  },

  // Copy an image to the clipboard (as PNG for broad browser support).
  async copyImage(url) {
    if (!url) return;
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url; // same-origin proxy -> canvas won't be tainted
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Image copied to clipboard", "success");
    } catch (err) {
      try {
        await navigator.clipboard.writeText(new URL(url, location.href).href);
        toast("Image copy unsupported — copied image link instead", "warning");
      } catch {
        toast("Copy failed", "danger");
      }
    }
  },

  edit(tuId) {
    const u = this._unitsById[tuId];
    if (!u) { toast("Could not load this unit.", "danger"); return; }
    EditModal.open({
      title: "Edit teaching unit",
      fields: [
        { name: "title", label: "Title", value: u.title, required: true },
        { name: "objective", label: "Objective", value: u.objective, type: "textarea" },
        { name: "scope_note", label: "Scope note", value: u.scope_note, type: "textarea" },
        { name: "speech_text", label: "Lesson text", value: u.speech_text, type: "textarea", rows: 12 },
      ],
      onSave: async (v) => {
        await API.send("PUT", `/api/teaching-units/${u.id}`, { ...v, variant_id: u.variant_id || null });
        // keep the in-memory copy fresh so re-opening edit shows the new text
        u.speech_text = v.speech_text;
        this._refresh();
      },
    });
  },

  async toggle(tuId, isActive) {
    const restoring = !isActive;
    if (isActive && !confirm("Soft-delete this teaching unit?")) return;
    try {
      await API.send("PATCH", `/api/teaching-units/${tuId}/active`, { is_active: restoring });
      toast(restoring ? "Restored" : "Soft-deleted", "success");
      this._refresh();
    } catch (err) {
      toast("Failed: " + err.message, "danger");
    }
  },
};
