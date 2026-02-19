const templates = {
  sunrise: {
    label: "Skill Sprint",
    badge: "Popular program",
    image:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=80",
  },
  garden: {
    label: "Study Ritual",
    badge: "Top rated",
    image:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1400&q=80",
  },
  studio: {
    label: "Portfolio Lab",
    badge: "New release",
    image:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80",
  },
  dusk: {
    label: "Exam Ready",
    badge: "Cohort open",
    image:
      "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1400&q=80",
  },
};

const suggestedMessages = {
  course: {
    beginner: "A guided course that builds core skills with short lessons and weekly practice.",
    intermediate: "A structured course with projects, feedback loops, and clear milestones.",
    advanced: "An advanced series with deep dives, case studies, and portfolio-ready work.",
    exam: "A focused prep course with mock tests, strategy sessions, and revision plans.",
  },
  workshop: {
    beginner: "A live workshop with hands-on demos and simple take-home exercises.",
    intermediate: "An interactive workshop designed for applied practice and live critique.",
    advanced: "A deep-dive workshop focused on real-world scenarios and expert tactics.",
    exam: "A high-impact workshop for mastering exam formats and timing strategy.",
  },
  guide: {
    beginner: "A starter guide with key concepts, checklists, and starter templates.",
    intermediate: "A field guide with frameworks, examples, and practical worksheets.",
    advanced: "A master guide with advanced workflows, resources, and expert notes.",
    exam: "A revision guide with summaries, past papers, and study plans.",
  },
  mentorship: {
    beginner: "A friendly mentorship track with weekly check-ins and focused practice.",
    intermediate: "A mentorship plan focused on growth projects and personalized feedback.",
    advanced: "An expert mentorship with portfolio review and career positioning.",
    exam: "A mentorship plan to align study strategy with exam milestones.",
  },
  bundle: {
    beginner: "A bundle of starter lessons, cheat sheets, and guided exercises.",
    intermediate: "A bundle with projects, templates, and feedback prompts.",
    advanced: "An advanced bundle with toolkits, workflows, and case studies.",
    exam: "A bundle with timed drills, solutions, and revision trackers.",
  },
};

const previewCard = document.getElementById("previewCard");
const previewHeadline = document.getElementById("previewHeadline");
const previewMessage = document.getElementById("previewMessage");
const previewBadge = document.getElementById("previewBadge");
const previewMeta = document.getElementById("previewMeta");

const livePreview = document.getElementById("livePreview");
const liveHeadline = document.getElementById("liveHeadline");
const liveMessage = document.getElementById("liveMessage");
const liveBadge = document.getElementById("liveBadge");
const liveMeta = document.getElementById("liveMeta");
const liveSign = document.getElementById("liveSign");

const nameInput = document.getElementById("nameInput");
const occasionSelect = document.getElementById("occasionSelect");
const toneSelect = document.getElementById("toneSelect");
const messageInput = document.getElementById("messageInput");
const signInput = document.getElementById("signInput");

const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const scrollBuilder = document.getElementById("scrollBuilder");
const randomTemplate = document.getElementById("randomTemplate");
const ctaStart = document.getElementById("ctaStart");

const templateCards = Array.from(document.querySelectorAll(".template"));

const getPreviewMessage = (occasion, tone, manualText) => {
  if (manualText && manualText.trim().length > 0) {
    return manualText.trim();
  }
  return suggestedMessages[occasion]?.[tone] ||
    "Outline the learning kit and let Manomaya format it into a clean storefront.";
};

const updateTemplate = (templateKey) => {
  const template = templates[templateKey];
  if (!template) return;

  templateCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.template === templateKey);
  });

  [previewCard, livePreview].forEach((card) => {
    card.style.backgroundImage =
      `linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.45)), url("${template.image}")`;
  });

  previewMeta.textContent = template.label;
  liveMeta.textContent = template.label;
  previewBadge.textContent = template.badge;
  liveBadge.textContent = template.badge;
};

const updateGreeting = () => {
  const name = nameInput.value.trim() || "Friend";
  const occasion = occasionSelect.value;
  const tone = toneSelect.value;
  const message = getPreviewMessage(occasion, tone, messageInput.value);
  const sign = signInput.value.trim() || "Instructor: Manomaya";

  previewHeadline.textContent = `Learning kit for ${name}`;
  previewMessage.textContent = message;
  liveHeadline.textContent = `Learning kit for ${name}`;
  liveMessage.textContent = message;
  liveSign.textContent = sign;

  livePreview.classList.remove("pulse");
  void livePreview.offsetWidth;
  livePreview.classList.add("pulse");
};

const copyMessage = async () => {
  const copyText = `${liveHeadline.textContent}\n\n${liveMessage.textContent}\n\n${liveSign.textContent}`;
  try {
    await navigator.clipboard.writeText(copyText);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy outline";
    }, 1600);
  } catch (error) {
    copyBtn.textContent = "Copy failed";
    setTimeout(() => {
      copyBtn.textContent = "Copy outline";
    }, 1600);
  }
};

const scrollToBuilder = () => {
  document.getElementById("builder")?.scrollIntoView({
    behavior: "smooth",
  });
};

const pickRandomTemplate = () => {
  const keys = Object.keys(templates);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  updateTemplate(randomKey);
};

templateCards.forEach((card) => {
  card.addEventListener("click", () => {
    updateTemplate(card.dataset.template);
  });
});

[nameInput, occasionSelect, toneSelect, messageInput, signInput].forEach((field) => {
  field.addEventListener("input", updateGreeting);
});

generateBtn.addEventListener("click", updateGreeting);
copyBtn.addEventListener("click", copyMessage);
randomTemplate.addEventListener("click", pickRandomTemplate);
scrollBuilder.addEventListener("click", scrollToBuilder);
ctaStart.addEventListener("click", scrollToBuilder);

updateTemplate("sunrise");
updateGreeting();