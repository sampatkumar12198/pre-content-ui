// Wires the cascading filters (exam -> subject -> concepts), reset, and pagination.

window.state = {
  examId: "",
  subjectId: "",
  search: "",
  includeInactive: false,
  page: 1,
  pageSize: 25,
};

document.addEventListener("DOMContentLoaded", async () => {
  EditModal.init();
  Teaching.init();
  Concepts.init();
  Micro.initPager();
  Admin.init();

  const examSel = document.getElementById("examSelect");
  const subjectSel = document.getElementById("subjectSelect");
  const searchInput = document.getElementById("searchInput");
  const includeInactive = document.getElementById("includeInactive");
  const pageSize = document.getElementById("pageSize");

  // Load exams.
  try {
    const exams = await API.get("/api/exams");
    examSel.insertAdjacentHTML(
      "beforeend",
      exams
        .map((e) => `<option value="${e.id}">${esc(e.name)}${e.code ? " (" + esc(e.code) + ")" : ""}</option>`)
        .join("")
    );
  } catch (err) {
    toast("Failed to load exams: " + err.message, "danger");
  }

  // Show all concepts by default (no filters required).
  searchInput.disabled = false;
  Concepts.reload();

  // Exam change -> load subjects, reset downstream.
  examSel.addEventListener("change", async () => {
    state.examId = examSel.value;
    state.subjectId = "";
    state.page = 1;
    subjectSel.innerHTML = '<option value="">Select subject…</option>';
    subjectSel.disabled = true;
    searchInput.value = "";
    state.search = "";
    Concepts.reload();
    if (!state.examId) return;
    try {
      const subs = await API.get(`/api/exams/${state.examId}/subjects`);
      if (!subs.length) {
        toast("No subjects found for this exam.", "warning");
      }
      subjectSel.insertAdjacentHTML(
        "beforeend",
        subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")
      );
      subjectSel.disabled = false;
    } catch (err) {
      toast("Failed to load subjects: " + err.message, "danger");
    }
  });

  // Subject change -> load concepts.
  subjectSel.addEventListener("change", () => {
    state.subjectId = subjectSel.value;
    state.page = 1;
    Concepts.reload();
  });

  // Search (debounced).
  let t;
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      Concepts.reload();
    }, 300);
  });

  includeInactive.addEventListener("change", () => {
    state.includeInactive = includeInactive.checked;
    state.page = 1;
    Concepts.reload();
  });

  pageSize.addEventListener("change", () => {
    state.pageSize = parseInt(pageSize.value, 10);
    state.page = 1;
    Concepts.reload();
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (state.page > 1) { state.page--; Concepts.reload(); }
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    state.page++; Concepts.reload();
  });

  // Clear -> full reset.
  document.getElementById("clearBtn").addEventListener("click", () => {
    examSel.value = "";
    subjectSel.innerHTML = '<option value="">Select subject…</option>';
    subjectSel.disabled = true;
    searchInput.value = "";
    includeInactive.checked = false;
    pageSize.value = "25";
    window.state = { examId: "", subjectId: "", search: "", includeInactive: false, page: 1, pageSize: 25 };
    Concepts.reload();
  });
});
