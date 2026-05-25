const state = {
  data: null,
  user: null
};

const collections = {
  metrics: [
    { name: "value", label: "Value", type: "text", required: true },
    { name: "label", label: "Label", type: "text", required: true },
    { name: "sortOrder", label: "Sort Order", type: "number" }
  ],
  services: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "category", label: "Category", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea", required: true, wide: true },
    { name: "cta", label: "CTA Label", type: "text" },
    { name: "sortOrder", label: "Sort Order", type: "number" },
    { name: "featured", label: "Featured", type: "checkbox" }
  ],
  projects: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "category", label: "Category", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea", required: true, wide: true },
    { name: "image", label: "Image URL or Asset Path", type: "text", uploadImage: true, wide: true },
    { name: "scope", label: "Scope", type: "text" },
    { name: "location", label: "Location", type: "text" },
    { name: "sortOrder", label: "Sort Order", type: "number" },
    { name: "featured", label: "Featured", type: "checkbox" }
  ],
  testimonials: [
    { name: "quote", label: "Quote", type: "textarea", required: true, wide: true },
    { name: "name", label: "Client Name", type: "text", required: true },
    { name: "role", label: "Client Role", type: "text" },
    { name: "sortOrder", label: "Sort Order", type: "number" },
    { name: "featured", label: "Featured", type: "checkbox" }
  ]
};

const settingsFields = [
  ["brandName", "Brand Name"],
  ["heroEyebrow", "Hero Eyebrow"],
  ["heroTitle", "Hero Title"],
  ["heroCopy", "Hero Copy", "textarea"],
  ["heroPrimaryCta", "Primary CTA"],
  ["heroSecondaryCta", "Secondary CTA"],
  ["visionEyebrow", "Vision Eyebrow"],
  ["visionTitle", "Vision Title"],
  ["visionCopy", "Vision Copy", "textarea"],
  ["servicesTitle", "Services Title"],
  ["servicesCopy", "Services Copy", "textarea"],
  ["projectsTitle", "Projects Title"],
  ["projectsCopy", "Projects Copy", "textarea"],
  ["testimonialsTitle", "Testimonials Title"],
  ["contactTitle", "Contact Title"],
  ["contactCopy", "Contact Copy", "textarea"]
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setStatus(message, tone = "normal") {
  const status = $("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function sortItems(items) {
  return [...(items || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/api/admin/login" &&
      path !== "/api/admin/session"
    ) {
      showLogin("Your session has expired. Sign in again.");
    }

    throw new Error(data.error || "Request failed");
  }

  return data;
}

function fieldElement(field, item = {}) {
  const label = document.createElement("label");
  if (field.wide) label.classList.add("wide");

  const text = document.createElement("span");
  text.textContent = field.label;

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 4;
  } else {
    input = document.createElement("input");
    input.type = field.type || "text";
  }

  input.name = field.name;
  input.required = Boolean(field.required);

  if (field.type === "checkbox") {
    label.className = "checkbox-field";
    input.checked = Boolean(item[field.name]);
    label.append(input, text);
    return label;
  }

  input.value = item[field.name] ?? "";
  label.append(text, input);

  if (field.uploadImage) {
    const uploader = document.createElement("div");
    uploader.className = "upload-control";

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp,image/gif";

    const status = document.createElement("small");
    status.textContent = "Upload an image to Cloudinary or paste an existing image URL above.";

    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;

      if (selected.size > 3_000_000) {
        status.textContent = "Choose an image under 3 MB.";
        file.value = "";
        return;
      }

      status.textContent = "Uploading image...";

      try {
        const dataUrl = await fileToDataUrl(selected);
        const result = await api("/api/admin/upload-image", {
          method: "POST",
          body: JSON.stringify({
            filename: selected.name,
            dataUrl
          })
        });
        input.value = result.upload.url;
        status.textContent = `Uploaded ${result.upload.width}x${result.upload.height} image.`;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        file.value = "";
      }
    });

    uploader.append(file, status);
    label.append(uploader);
  }

  return label;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
  });
}

function formPayload(form, fields) {
  const data = new FormData(form);
  const payload = {};

  fields.forEach((field) => {
    if (field.type === "checkbox") {
      payload[field.name] = form.elements[field.name].checked;
      return;
    }

    payload[field.name] = data.get(field.name);
  });

  return payload;
}

function renderDashboard() {
  const dashboard = $("[data-dashboard]");
  if (!dashboard || !state.data) return;

  const stats = [
    ["Services", state.data.services?.length || 0],
    ["Projects", state.data.projects?.length || 0],
    ["Testimonials", state.data.testimonials?.length || 0],
    ["Leads", state.data.leads?.length || 0]
  ];

  dashboard.replaceChildren();
  stats.forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "stat-card";

    const strong = document.createElement("strong");
    strong.textContent = value;

    const span = document.createElement("span");
    span.textContent = label;

    card.append(strong, span);
    dashboard.append(card);
  });
}

function renderSettings() {
  const form = $("[data-settings-form]");
  if (!form || !state.data) return;

  form.replaceChildren();
  settingsFields.forEach(([name, label, type]) => {
    form.append(
      fieldElement(
        {
          name,
          label,
          type: type || "text",
          wide: type === "textarea"
        },
        state.data.settings || {}
      )
    );
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Save Site Copy";
  actions.append(button);
  form.append(actions);

  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      state.data = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      setStatus("Site copy saved.");
      renderAll();
    } catch (error) {
      setStatus(error.message, "error");
    }
  };
}

function itemSummary(collection, item) {
  if (collection === "metrics") return `${item.value || ""} - ${item.label || ""}`;
  if (collection === "testimonials") return item.quote || "";
  return item.description || "";
}

function renderCollection(collection) {
  const root = $(`[data-editor="${collection}"]`);
  if (!root || !state.data) return;

  const fields = collections[collection];
  root.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "collection-layout";

  const form = document.createElement("form");
  form.className = "editor-form";
  form.dataset.editingId = "";

  const list = document.createElement("div");
  list.className = "collection-list";

  function fillForm(item = {}) {
    form.replaceChildren();
    fields.forEach((field) => form.append(fieldElement(field, item)));

    const actions = document.createElement("div");
    actions.className = "form-actions";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = item.id ? "Save Changes" : "Add Item";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "secondary";
    reset.textContent = "Clear";
    reset.addEventListener("click", () => {
      form.dataset.editingId = "";
      fillForm();
    });

    actions.append(submit, reset);
    form.append(actions);
  }

  function fillList() {
    list.replaceChildren();
    sortItems(state.data[collection]).forEach((item) => {
      const row = document.createElement("article");
      row.className = "collection-item";

      const copy = document.createElement("div");
      const meta = document.createElement("span");
      const title = document.createElement("h3");
      const summary = document.createElement("p");

      meta.className = "collection-meta";
      meta.textContent = item.category || item.role || `Order ${item.sortOrder || 0}`;
      title.textContent = item.title || item.name || item.label || "Untitled";
      summary.textContent = itemSummary(collection, item);
      copy.append(meta, title, summary);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        form.dataset.editingId = item.id;
        fillForm(item);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!confirm(`Delete "${title.textContent}"?`)) return;
        try {
          await api(`/api/admin/${collection}/${item.id}`, { method: "DELETE" });
          await loadData();
          setStatus("Item deleted.");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      actions.append(edit, remove);
      row.append(copy, actions);
      list.append(row);
    });
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const id = form.dataset.editingId;
    const path = id ? `/api/admin/${collection}/${id}` : `/api/admin/${collection}`;
    const method = id ? "PUT" : "POST";

    try {
      await api(path, {
        method,
        body: JSON.stringify(formPayload(form, fields))
      });
      await loadData();
      setStatus(id ? "Item updated." : "Item added.");
    } catch (error) {
      setStatus(error.message, "error");
    }
  };

  fillForm();
  fillList();
  layout.append(form, list);
  root.append(layout);
}

function renderLeads() {
  const list = $("[data-leads]");
  if (!list || !state.data) return;

  const leads = state.data.leads || [];
  list.replaceChildren();

  if (!leads.length) {
    const empty = document.createElement("p");
    empty.textContent = "No consultation requests yet.";
    list.append(empty);
    return;
  }

  leads.forEach((lead) => {
    const card = document.createElement("article");
    card.className = "lead-card";

    const title = document.createElement("h3");
    title.textContent = lead.name || "Unnamed lead";

    const dl = document.createElement("dl");
    [
      ["Email", lead.email],
      ["Phone", lead.phone || "Not provided"],
      ["Location", lead.location],
      ["Service", lead.service || "Not selected"],
      ["Budget", lead.budget || "Not selected"],
      ["Notification", lead.notification?.sent ? "Sent" : lead.notification?.reason || "Not sent"],
      ["Submitted", new Date(lead.createdAt).toLocaleString()]
    ].forEach(([label, value]) => {
      const wrapper = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value || "";
      wrapper.append(dt, dd);
      dl.append(wrapper);
    });

    const message = document.createElement("p");
    message.textContent = lead.message || "";

    const actions = document.createElement("div");
    actions.className = "form-actions";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Delete Lead";
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete lead from ${lead.name || "this contact"}?`)) return;

      try {
        await api(`/api/admin/leads/${lead.id}`, { method: "DELETE" });
        await loadData();
        setStatus("Lead deleted.");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    actions.append(remove);
    card.append(title, dl, message, actions);
    list.append(card);
  });
}

function renderAll() {
  renderDashboard();
  renderSettings();
  Object.keys(collections).forEach(renderCollection);
  renderLeads();
}

async function loadData() {
  try {
    state.data = await api("/api/admin/data");
    renderAll();
    setStatus("Admin data loaded.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function setupPanels() {
  $$("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.panelTarget;
      $$("[data-panel-target]").forEach((item) => item.classList.remove("is-active"));
      $$("[data-panel]").forEach((item) => item.classList.toggle("is-active", item.dataset.panel === panel));
      button.classList.add("is-active");
    });
  });
}

function setLoginStatus(message = "") {
  const status = $("[data-login-status]");
  if (status) status.textContent = message;
}

function showLogin(message = "") {
  state.data = null;
  state.user = null;
  $("[data-login-view]").hidden = false;
  $("[data-admin-shell]").hidden = true;
  setLoginStatus(message);
}

function showAdmin(user) {
  state.user = user;
  $("[data-login-view]").hidden = true;
  $("[data-admin-shell]").hidden = false;
  const identity = $("[data-admin-user]");
  if (identity) identity.textContent = user.email || "Administrator";
}

function setupAuthentication() {
  const form = $("[data-login-form]");
  const logout = $("[data-logout]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("");

    const submit = $("[data-login-submit]");
    submit.disabled = true;
    submit.textContent = "Signing In...";

    try {
      const result = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      showAdmin(result.user);
      await loadData();
    } catch (error) {
      setLoginStatus(error.message);
    } finally {
      submit.disabled = false;
      submit.textContent = "Sign In";
    }
  });

  logout.addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } finally {
      showLogin("You have signed out.");
    }
  });
}

async function initialize() {
  localStorage.removeItem("velouraAdminToken");
  setupPanels();
  setupAuthentication();

  try {
    const session = await api("/api/admin/session");
    showAdmin(session.user);
    await loadData();
  } catch {
    showLogin();
  }
}

initialize();
