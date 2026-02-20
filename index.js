const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const sections = document.querySelectorAll("section[id]");

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