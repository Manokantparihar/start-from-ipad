const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const themeToggle = document.getElementById("themeToggle");
const contactForm = document.getElementById("contactForm");
const contactSubmit = document.getElementById("contactSubmit");
const contactFallbackBtn = document.getElementById("contactFallbackBtn");
const formStatus = document.getElementById("formStatus");
const resourcesGrid = document.getElementById("resourcesGrid");
const mathsGrid = document.getElementById("mathsGrid");
const updatesGrid = document.getElementById("updatesGrid");
const guidesGrid = document.getElementById("guidesGrid");
const sections = document.querySelectorAll("section[id]");
const searchInput = document.getElementById("searchInput");
const filterChips = document.getElementById("filterChips");

const loginModal = document.getElementById('loginModal');
const signupModal = document.getElementById('signupModal');

const openSignupBtn = document.getElementById('openSignupBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
const closeSignupModalBtn = document.getElementById('closeSignupModalBtn');
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

document.getElementById("showSignup")?.addEventListener("click", () => {
  loginForm?.classList.add("hidden");
  signupForm?.classList.remove("hidden");
});

document.getElementById("showLogin")?.addEventListener("click", () => {
  signupForm?.classList.add("hidden");
  loginForm?.classList.remove("hidden");
});

function showLoginModal() {
  if (!loginModal) return;
  loginModal.classList.remove('hidden');
  loginModal.classList.add('flex');
}

function hideLoginModal() {
  if (!loginModal) return;
  loginModal.classList.add('hidden');
  loginModal.classList.remove('flex');
}

function showSignupModal() {
  if (!signupModal) return;
  signupModal.classList.remove('hidden');
  signupModal.classList.add('flex');
}

function hideSignupModal() {
  if (!signupModal) return;
  signupModal.classList.add('hidden');
  signupModal.classList.remove('flex');
}

openSignupBtn?.addEventListener('click', () => {
  hideLoginModal();
  showSignupModal();
});

backToLoginBtn?.addEventListener('click', () => {
  hideSignupModal();
  showLoginModal();
});

closeLoginModalBtn?.addEventListener('click', hideLoginModal);
closeSignupModalBtn?.addEventListener('click', hideSignupModal);

let allSearchableItems = [];
let activeFilter = "all";

const STORAGE_KEY = "helpHubTheme";
const SECTION_TYPE_MAP = {
  resources: "pdf",
  maths: "practice",
  updates: "update",
  guides: "guide",
};

const TYPE_CTA_MAP = {
  pdf: "View PDF",
  practice: "Start Practice",
  update: "Read More",
  guide: "Follow Plan",
};

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

const trackEvent = (eventType, label = "") => {
  if (window.gtag) {
    window.gtag("event", eventType, { event_label: label });
  }
  console.info(`[track] ${eventType}${label ? ` | ${label}` : ""}`);
};

const getResolvedType = (item, section) => item?.type || SECTION_TYPE_MAP[section] || "guide";

const getActionLabel = (item, section) => {
  const type = getResolvedType(item, section);
  return item?.buttonLabel || TYPE_CTA_MAP[type] || "Open";
};

const getTypeMeta = (item, section) => {
  const type = getResolvedType(item, section);

  if (type === "pdf") {
    return "PDF Notes";
  }

  if (type === "practice") {
    const count = Number(item?.practiceCount) || 10;
    return `${count} practice questions`;
  }

  if (type === "update") {
    return item?.updateDate || "Latest update";
  }

  if (type === "guide") {
    const steps = Number(item?.stepsCount) || (Array.isArray(item?.nextSteps) ? item.nextSteps.length : 0);
    return steps > 0 ? `${steps} action steps` : "Strategy guide";
  }

  return section;
};

const renderStandardCards = (container, items) => {
  if (!container || !Array.isArray(items)) return;
  const section = container.id.replace("Grid", "").toLowerCase();

  container.innerHTML = items
    .map(
      (item) => `
      <div class="card" data-slug="${item.slug}" data-title="${item.title.toLowerCase()}" data-difficulty="${item.difficulty || ""}" data-section="${section}">
        <h3>${item.title}</h3>
        <div class="badge-row">
          ${item.readTime ? `<span class="badge badge-time">${item.readTime}</span>` : ""}
          ${item.difficulty ? `<span class="badge badge-${item.difficulty.toLowerCase()}">${item.difficulty}</span>` : ""}
        </div>
        <p><strong>${getTypeMeta(item, section)}</strong></p>
        <p>${item.summary}</p>
        <a class="btn" href="details.html?item=${item.slug}">${getActionLabel(item, section)}</a>
      </div>
    `,
    )
    .join("");
};

const renderUpdateCards = (container, items) => {
  if (!container || !Array.isArray(items)) return;
  const section = container.id.replace("Grid", "").toLowerCase();

  container.innerHTML = items
    .map(
      (item) => `
      <article class="post-card" data-slug="${item.slug}" data-title="${item.title.toLowerCase()}" data-difficulty="${item.difficulty || ""}" data-section="${section}">
        <div class="thumb" aria-hidden="true"></div>
        <h3>${item.title}</h3>
        <div class="badge-row">
          ${item.readTime ? `<span class="badge badge-time">${item.readTime}</span>` : ""}
          ${item.difficulty ? `<span class="badge badge-${item.difficulty.toLowerCase()}">${item.difficulty}</span>` : ""}
        </div>
        <p><strong>${getTypeMeta(item, section)}</strong></p>
        <p>${item.summary}</p>
        <a class="btn" href="details.html?item=${item.slug}">${getActionLabel(item, section)}</a>
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
  const submitFallbackForm = ({ name, email, message }) => {
    const subject = encodeURIComponent(`Contact Form: ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    );
    const mailtoUrl = `mailto:manokantparihar@gmail.com?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
  };

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const isHttpProtocol = window.location.protocol === "http:" || window.location.protocol === "https:";
    if (!isHttpProtocol) {
      formStatus.textContent = `This page is running on ${window.location.protocol}. Open via web server: run npm run start and use http://localhost:5500`;
      formStatus.className = "form-status error";
      return;
    }

    const endpoint = contactForm.dataset.endpoint;
    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!name || !email || !message) {
      formStatus.textContent = "Please fill out all fields.";
      formStatus.className = "form-status error";
      if (contactFallbackBtn) contactFallbackBtn.hidden = true;
      return;
    }

    if (!endpoint) {
      formStatus.textContent = "Submission endpoint is missing.";
      formStatus.className = "form-status error";
      if (contactFallbackBtn) contactFallbackBtn.hidden = true;
      return;
    }

    if (contactFallbackBtn) {
      contactFallbackBtn.hidden = true;
      contactFallbackBtn.onclick = () => submitFallbackForm({ name, email, message });
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
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const responseSuccess = payload?.success === true || payload?.success === "true";
      if (!response.ok || !responseSuccess) {
        const messageFromApi = payload?.message || payload?.error || "Submission failed";
        throw new Error(messageFromApi);
      }

      contactForm.reset();
      if (payload?.emailForwarded) {
        formStatus.textContent = "Message submitted and forwarded to inbox successfully.";
        formStatus.className = "form-status success";
      } else {
        formStatus.textContent = `Message saved on site, but email forwarding failed: ${payload?.emailStatus || "Check FormSubmit activation"}. Opening Email App fallback...`;
        formStatus.className = "form-status error";
        if (contactFallbackBtn) {
          contactFallbackBtn.hidden = false;
        }
        submitFallbackForm({ name, email, message });
      }
      if (payload?.emailForwarded && contactFallbackBtn) contactFallbackBtn.hidden = true;
    } catch (error) {
      const isWebServerError = String(error.message || "").toLowerCase().includes("web server");
      if (isWebServerError) {
        formStatus.textContent = "Message service blocked. Opening your email app fallback now...";
        formStatus.className = "form-status success";
        submitFallbackForm({ name, email, message });
        return;
      }

      const helpText = isWebServerError
        ? ` Open this exact URL in browser: http://localhost:5500 (current: ${window.location.href})`
        : "";
      formStatus.textContent = `Could not deliver message: ${error.message}${helpText}`;
      formStatus.className = "form-status error";
      if (contactFallbackBtn) {
        contactFallbackBtn.hidden = false;
      }
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

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".card .btn, .post-card .btn");
  if (!btn) return;
  const card = btn.closest("[data-slug]");
  const slug = card?.dataset.slug || "";
  trackEvent("resource_open", slug);
});
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
    const section = card.dataset.section || "";
    const matchesSearch = !query || title.includes(query);
    const matchesFilter = activeFilter === "all" || section === activeFilter;
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

async function setupNavbar() {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include'
    });

    const data = await res.json();
    const user = data.user;

    // Username set karo
    const nameEl = document.getElementById('navUserName');
    if (nameEl) nameEl.textContent = user.name;

    // Admin link control
    const adminLink = document.getElementById('adminNavLink');
    if (adminLink) {
      if (user.role === 'admin') {
        adminLink.style.display = 'inline-flex';
      } else {
        adminLink.style.display = 'none';
      }
    }

  } catch (err) {
    console.error('Navbar error:', err);
  }
}

setupNavbar();