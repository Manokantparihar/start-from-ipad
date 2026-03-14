const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const themeToggle = document.getElementById("themeToggle");
const contactForm = document.getElementById("contactForm");
const contactSubmit = document.getElementById("contactSubmit");
const formStatus = document.getElementById("formStatus");
const resourcesGrid = document.getElementById("resourcesGrid");
const mathsGrid = document.getElementById("mathsGrid");
const updatesGrid = document.getElementById("updatesGrid");
const guidesGrid = document.getElementById("guidesGrid");
const sections = document.querySelectorAll("section[id]");
const searchInput = document.getElementById("searchInput");
const filterChips = document.getElementById("filterChips");

let allSearchableItems = [];
let activeFilter = "all";

const STORAGE_KEY = "helpHubTheme";

const setHomepageSeoMeta = () => {
  const canonicalTag = document.getElementById("canonicalUrl");
  const ogUrlTag = document.getElementById("ogUrl");
  const ogImageTag = document.getElementById("ogImage");
  const twitterImageTag = document.getElementById("twitterImage");

  const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
  const ogImageUrl = `${window.location.origin}/og-image.svg`;

  if (canonicalTag) canonicalTag.setAttribute("href", canonicalUrl);
  if (ogUrlTag) ogUrlTag.setAttribute("content", canonicalUrl);
  if (ogImageTag) ogImageTag.setAttribute("content", ogImageUrl);
  if (twitterImageTag) twitterImageTag.setAttribute("content", ogImageUrl);
};

const renderStandardCards = (container, items) => {
  if (!container || !Array.isArray(items)) return;

  container.innerHTML = items
    .map(
      (item) => `
      <div class="card" data-slug="${item.slug}" data-title="${item.title.toLowerCase()}" data-difficulty="${item.difficulty || ""}">
        <h3>${item.title}</h3>
        <div class="badge-row">
          ${item.readTime ? `<span class="badge badge-time">${item.readTime}</span>` : ""}
          ${item.difficulty ? `<span class="badge badge-${item.difficulty.toLowerCase()}">${item.difficulty}</span>` : ""}
        </div>
        <p>${item.summary}</p>
        <a class="btn" href="details.html?item=${item.slug}">${item.buttonLabel}</a>
      </div>
    `,
    )
    .join("");
};

const renderUpdateCards = (container, items) => {
  if (!container || !Array.isArray(items)) return;

  container.innerHTML = items
    .map(
      (item) => `
      <article class="post-card" data-slug="${item.slug}" data-title="${item.title.toLowerCase()}" data-difficulty="${item.difficulty || ""}">
        <div class="thumb" aria-hidden="true"></div>
        <h3>${item.title}</h3>
        <div class="badge-row">
          ${item.readTime ? `<span class="badge badge-time">${item.readTime}</span>` : ""}
          ${item.difficulty ? `<span class="badge badge-${item.difficulty.toLowerCase()}">${item.difficulty}</span>` : ""}
        </div>
        <p>${item.summary}</p>
        <a class="btn" href="details.html?item=${item.slug}">${item.buttonLabel}</a>
      </article>
    `,
    )
    .join("");
};

const loadHomepageContent = async () => {
  try {
    const response = await fetch("data/content.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load content data");
    const data = await response.json();
    const sectionData = data.sections || {};

    renderStandardCards(resourcesGrid, sectionData.resources);
    renderStandardCards(mathsGrid, sectionData.maths);
    renderUpdateCards(updatesGrid, sectionData.updates);
    renderStandardCards(guidesGrid, sectionData.guides);

      allSearchableItems = [
        ...(sectionData.resources || []),
        ...(sectionData.maths || []),
        ...(sectionData.updates || []),
        ...(sectionData.guides || []),
      ];
      setupSearch();
    } catch (error) {
    console.error("Content load failed:", error);
  }
};

const applyTheme = (theme) => {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-theme", isDark);

  if (themeToggle) {
    themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
    themeToggle.setAttribute("aria-pressed", String(isDark));
  }
};

const savedTheme = localStorage.getItem(STORAGE_KEY);
if (savedTheme === "dark" || savedTheme === "light") {
  applyTheme(savedTheme);
} else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
  applyTheme("dark");
} else {
  applyTheme("light");
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("dark-theme") ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
  });
}

if (contactForm && contactSubmit && formStatus) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const endpoint = contactForm.dataset.endpoint;
    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!name || !email || !message) {
      formStatus.textContent = "Please fill out all fields.";
      formStatus.className = "form-status error";
      return;
    }

    if (!endpoint) {
      formStatus.textContent = "Submission endpoint is missing.";
      formStatus.className = "form-status error";
      return;
    }

    try {
      contactSubmit.disabled = true;
      contactSubmit.textContent = "Sending...";
      formStatus.textContent = "";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          _subject: `New contact message from ${name}`,
          _template: "table",
          _captcha: "false",
        }),
      });

      if (!response.ok) {
        throw new Error("Submission failed");
      }

      contactForm.reset();
      formStatus.textContent = "Message sent successfully.";
      formStatus.className = "form-status success";
    } catch {
      formStatus.textContent = "Could not send message. Please try again.";
      formStatus.className = "form-status error";
    } finally {
      contactSubmit.disabled = false;
      contactSubmit.textContent = "Send Message";
    }
  });
}

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    menuToggle.classList.toggle("open");
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

const highlightNav = () => {
  const scrollY = window.scrollY + 140;
  sections.forEach((section) => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute("id");
    const link = document.querySelector(`.nav a[href="#${id}"]`);

    if (!link) return;

    if (scrollY >= top && scrollY < top + height) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
};

window.addEventListener("scroll", highlightNav, { passive: true });
window.addEventListener("load", highlightNav);
window.addEventListener("load", setHomepageSeoMeta);
window.addEventListener("load", loadHomepageContent);

const setupSearch = () => {
  if (!searchInput || !filterChips) return;

  searchInput.addEventListener("input", filterAllCards);

  filterChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      filterAllCards();
    });
  });
};

const filterAllCards = () => {
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const allCards = document.querySelectorAll(".card[data-slug], .post-card[data-slug]");
  const grids = new Set();

  allCards.forEach((card) => {
    const title = card.dataset.title || "";
    const difficulty = card.dataset.difficulty || "";
    const matchesSearch = !query || title.includes(query);
    const matchesFilter = activeFilter === "all" || difficulty === activeFilter;
    const show = matchesSearch && matchesFilter;
    card.style.display = show ? "" : "none";
    if (card.parentElement) grids.add(card.parentElement);
  });

  grids.forEach((grid) => {
    const hasVisible = Array.from(grid.children).some(
      (child) => child.style.display !== "none" && !child.classList.contains("no-results"),
    );
    const existing = grid.querySelector(".no-results");
    if (!hasVisible) {
      if (!existing) {
        const msg = document.createElement("p");
        msg.className = "no-results";
        msg.textContent = "No matching resources found.";
        grid.appendChild(msg);
      }
    } else if (existing) {
      existing.remove();
    }
  });
};