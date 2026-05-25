const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const state = {
  projectType: "Residence",
  mood: "Quiet Luxe",
  services: []
};

const projectMultipliers = {
  Residence: 1,
  Penthouse: 1.34,
  Workspace: 0.88
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setText(selector, value) {
  const element = $(selector);
  if (element && value) element.textContent = value;
}

function sortItems(items) {
  return [...(items || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function normalizeCategory(value) {
  return String(value || "uncategorized").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function renderSettings(settings = {}) {
  document.title = settings.brandName || "Veloura Spaces";
  setText("[data-brand-name]", settings.brandName);
  setText("[data-hero-eyebrow]", settings.heroEyebrow);
  setText("[data-hero-title]", settings.heroTitle);
  setText("[data-hero-copy]", settings.heroCopy);
  setText("[data-hero-primary]", settings.heroPrimaryCta);
  setText("[data-hero-secondary]", settings.heroSecondaryCta);
  setText("[data-vision-eyebrow]", settings.visionEyebrow);
  setText("[data-vision-title]", settings.visionTitle);
  setText("[data-vision-copy]", settings.visionCopy);
  setText("[data-services-title]", settings.servicesTitle);
  setText("[data-services-copy]", settings.servicesCopy);
  setText("[data-projects-title]", settings.projectsTitle);
  setText("[data-projects-copy]", settings.projectsCopy);
  setText("[data-testimonials-title]", settings.testimonialsTitle);
  setText("[data-contact-title]", settings.contactTitle);
  setText("[data-contact-copy]", settings.contactCopy);
}

function renderMetrics(metrics) {
  const container = $("[data-metrics]");
  if (!container || !metrics?.length) return;

  container.replaceChildren();
  sortItems(metrics).forEach((metric) => {
    const wrapper = document.createElement("div");
    const value = document.createElement("dt");
    const label = document.createElement("dd");

    value.textContent = metric.value || "";
    label.textContent = metric.label || "";
    wrapper.append(value, label);
    container.append(wrapper);
  });
}

function renderServices(services) {
  const container = $("[data-services]");
  const select = $("[data-service-select]");
  if (!container) return;

  state.services = sortItems(services);
  container.replaceChildren();
  if (select) {
    select.replaceChildren(new Option("Select a service", ""));
  }

  state.services.forEach((service, index) => {
    const card = document.createElement("article");
    card.className = "service-card";

    const count = document.createElement("span");
    count.className = "service-index";
    count.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("h3");
    title.textContent = service.title || "Untitled service";

    const copy = document.createElement("p");
    copy.textContent = service.description || "";

    const link = document.createElement("a");
    link.href = "#consult";
    link.textContent = service.cta || "Discuss this service";

    card.append(count, title, copy, link);
    container.append(card);

    if (select) {
      select.append(new Option(service.title, service.title));
    }
  });
}

function renderProjectFilters(projects) {
  const filterBar = $("[data-project-filters]");
  if (!filterBar) return;

  const categories = [...new Set(sortItems(projects).map((project) => project.category).filter(Boolean))];
  filterBar.replaceChildren();

  const all = document.createElement("button");
  all.className = "filter is-active";
  all.type = "button";
  all.dataset.filter = "all";
  all.textContent = "All";
  filterBar.append(all);

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "filter";
    button.type = "button";
    button.dataset.filter = normalizeCategory(category);
    button.textContent = category;
    filterBar.append(button);
  });

  setupFilters();
}

function renderProjects(projects) {
  const container = $("[data-projects]");
  if (!container) return;

  const sorted = sortItems(projects);
  container.replaceChildren();
  renderProjectFilters(sorted);

  sorted.forEach((project) => {
    const card = document.createElement("article");
    card.className = "portfolio-card";
    card.dataset.category = normalizeCategory(project.category);

    const image = document.createElement("img");
    image.className = "project-image";
    image.src = project.image || "assets/veloura-hero.png";
    image.alt = `${project.title || "Project"} - ${project.category || "interior design"} project`;
    image.loading = "lazy";
    image.decoding = "async";

    const copy = document.createElement("div");
    copy.className = "project-copy";

    const category = document.createElement("span");
    category.textContent = project.category || "Project";

    const title = document.createElement("h3");
    title.textContent = project.title || "Untitled project";

    const description = document.createElement("p");
    description.textContent = project.description || "";

    const scope = document.createElement("small");
    scope.textContent = project.scope || project.location || "";

    copy.append(category, title, description, scope);
    card.append(image, copy);
    container.append(card);
  });
}

function renderTestimonials(testimonials) {
  const container = $("[data-testimonials]");
  if (!container) return;

  container.replaceChildren();
  sortItems(testimonials).forEach((testimonial) => {
    const figure = document.createElement("figure");
    figure.className = "quote-card";

    const quote = document.createElement("blockquote");
    quote.textContent = testimonial.quote || "";

    const caption = document.createElement("figcaption");
    const name = document.createElement("strong");
    const role = document.createElement("span");

    name.textContent = testimonial.name || "Client";
    role.textContent = testimonial.role || "";
    caption.append(name, role);
    figure.append(quote, caption);
    container.append(figure);
  });
}

async function loadSiteData() {
  try {
    const response = await fetch("/api/site");
    if (!response.ok) throw new Error("Could not load site data");
    const site = await response.json();

    renderSettings(site.settings);
    renderMetrics(site.metrics);
    renderServices(site.services);
    renderProjects(site.projects);
    renderTestimonials(site.testimonials);
  } catch (error) {
    console.warn(error.message);
  }
}

function selectedRooms() {
  return $$("[data-room]").filter((button) => button.classList.contains("is-selected"));
}

function formatRooms(rooms) {
  return rooms.map((button) => button.dataset.room).join(", ");
}

function calculateEstimate(rooms, budget, timeline) {
  const selectedCost = rooms.reduce((total, button) => total + Number(button.dataset.cost), 0);
  const speedPremium = timeline <= 10 ? 1.18 : timeline <= 14 ? 1.08 : 1;
  const projectPremium = projectMultipliers[state.projectType] || 1;
  const sourcingFee = Math.max(budget * 1000 * 0.08, 9000);

  return Math.round((selectedCost * projectPremium * speedPremium + sourcingFee) / 100) * 100;
}

function budgetFit(estimate, budget) {
  const target = budget * 1000;
  const ratio = estimate / target;

  if (ratio < 0.42) return "Flexible";
  if (ratio < 0.68) return "Comfortable";
  if (ratio < 0.86) return "Tight";
  return "Needs Review";
}

function currentBrief() {
  const budgetRange = $("#budgetRange");
  const timelineRange = $("#timelineRange");
  const rooms = selectedRooms();

  return {
    projectType: state.projectType,
    mood: state.mood,
    rooms: rooms.map((room) => room.dataset.room),
    budget: budgetRange ? `$${budgetRange.value}k` : "",
    timeline: timelineRange ? `${timelineRange.value} weeks` : ""
  };
}

function updateSummary() {
  const roomButtons = $$("[data-room]");
  const budgetRange = $("#budgetRange");
  const timelineRange = $("#timelineRange");
  if (!roomButtons.length || !budgetRange || !timelineRange) return;

  const rooms = selectedRooms();

  if (rooms.length === 0) {
    roomButtons[0].classList.add("is-selected");
    return updateSummary();
  }

  const budget = Number(budgetRange.value);
  const timeline = Number(timelineRange.value);
  const estimate = calculateEstimate(rooms, budget, timeline);
  const roomLabel = rooms.length === 1 ? "room" : "rooms";

  setText("[data-budget-output]", `$${budget}k`);
  setText("[data-timeline-output]", `${timeline} weeks`);
  setText("[data-summary-title]", `${state.projectType} in ${state.mood}`);
  setText("[data-summary-price]", currency.format(estimate));
  setText("[data-summary-copy]", `Includes concept direction, sourcing, procurement coordination, and install styling for ${rooms.length} ${roomLabel}.`);
  setText("[data-summary-rooms]", formatRooms(rooms));
  setText("[data-summary-timeline]", `${timeline} weeks`);
  setText("[data-summary-fit]", budgetFit(estimate, budget));
}

function setupBriefBuilder() {
  $$("[data-project-type]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-project-type]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.projectType = button.dataset.projectType;
      updateSummary();
    });
  });

  $$("[data-room]").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-selected");
      updateSummary();
    });
  });

  ["#budgetRange", "#timelineRange"].forEach((selector) => {
    const range = $(selector);
    if (range) range.addEventListener("input", updateSummary);
  });

  updateSummary();
}

function setupFilters() {
  $$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;

      $$("[data-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");

      $$("[data-category]").forEach((card) => {
        card.classList.toggle("is-hidden", filter !== "all" && card.dataset.category !== filter);
      });
    });
  });
}

function setupReveal() {
  const revealRange = $(".reveal-range");
  const afterLayer = $("[data-after-layer]");
  const revealDivider = $("[data-reveal-divider]");
  if (!revealRange || !afterLayer || !revealDivider) return;

  function updateReveal() {
    const value = Number(revealRange.value);
    afterLayer.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    revealDivider.style.left = `${value}%`;
  }

  revealRange.addEventListener("input", updateReveal);
  updateReveal();
}

function setupTheme() {
  const themeToggle = $("[data-theme-toggle]");
  if (!themeToggle) return;

  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    themeToggle.setAttribute("aria-label", nextTheme ? "Use light color theme" : "Use dark color theme");
  });
}

function setupLeadForm() {
  const form = $("[data-consult-form]");
  const formStatus = $("[data-form-status]");
  if (!form || !formStatus) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());
    payload.brief = currentBrief();
    formStatus.textContent = "Sending consultation request...";

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send request");

      const firstName = payload.name.trim().split(" ")[0] || "there";
      formStatus.textContent = `${firstName}, your consultation request has been saved.`;
      form.reset();
    } catch (error) {
      formStatus.textContent = error.message;
    }
  });
}

loadSiteData();
setupBriefBuilder();
setupFilters();
setupReveal();
setupTheme();
setupLeadForm();
