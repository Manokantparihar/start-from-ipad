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

// Wish List functionality
const wishList = {
  items: JSON.parse(localStorage.getItem("helpHubWishList") || "[]"),

  add(title) {
    if (!this.items.includes(title)) {
      this.items.push(title);
      this.save();
      return true;
    }
    return false;
  },

  remove(title) {
    this.items = this.items.filter(item => item !== title);
    this.save();
  },

  has(title) {
    return this.items.includes(title);
  },

  save() {
    localStorage.setItem("helpHubWishList", JSON.stringify(this.items));
    this.updateUI();
  },

  updateUI() {
    document.querySelectorAll(".card").forEach(card => {
      const title = card.querySelector("h3")?.textContent;
      const wishBtn = card.querySelector(".wish-btn");
      if (title && wishBtn) {
        wishBtn.classList.toggle("active", this.has(title));
        wishBtn.setAttribute("aria-pressed", this.has(title));
      }
    });
    this.updateWishListSection();
  },

  updateWishListSection() {
    const wishListContent = document.getElementById("wishListContent");
    const emptyMessage = document.getElementById("emptyWishList");

    if (!wishListContent) return;

    if (this.items.length === 0) {
      if (emptyMessage) emptyMessage.style.display = "block";
      // Remove all wish list cards
      wishListContent.querySelectorAll(".wish-list-card").forEach(card => card.remove());
    } else {
      if (emptyMessage) emptyMessage.style.display = "none";

      // Clear existing wish list cards
      wishListContent.querySelectorAll(".wish-list-card").forEach(card => card.remove());

      // Add cards for each wish list item
      this.items.forEach(title => {
        const card = document.createElement("div");
        card.className = "card wish-list-card";
        card.innerHTML = `
          <h3>${title}</h3>
          <button class="btn remove-wish-btn" data-title="${title}">Remove</button>
        `;
        wishListContent.appendChild(card);
      });

      // Add event listeners to remove buttons
      wishListContent.querySelectorAll(".remove-wish-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const title = btn.getAttribute("data-title");
          this.remove(title);
        });
      });
    }
  }
};

// Initialize wish list on page load
document.addEventListener("DOMContentLoaded", () => {
  // Add wish list buttons to all cards
  document.querySelectorAll(".card").forEach(card => {
    const title = card.querySelector("h3")?.textContent;
    if (!title) return;

    const wishBtn = document.createElement("button");
    wishBtn.className = "wish-btn";
    wishBtn.innerHTML = "&#9825;"; // Heart symbol
    wishBtn.setAttribute("aria-label", "Add to wish list");
    wishBtn.setAttribute("aria-pressed", "false");

    wishBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (wishList.has(title)) {
        wishList.remove(title);
      } else {
        wishList.add(title);
      }
    });

    card.style.position = "relative";
    card.insertBefore(wishBtn, card.firstChild);
  });

  wishList.updateUI();
});