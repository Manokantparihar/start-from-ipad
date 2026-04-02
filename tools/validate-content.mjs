import fs from "node:fs";
import path from "node:path";

const contentPath = path.resolve(process.cwd(), "data/content.json");
const REQUIRED_SECTIONS = ["resources", "maths", "updates", "guides"];
const REQUIRED_FIELDS = [
  "slug",
  "title",
  "summary",
  "type",
  "buttonLabel",
  "category",
  "readTime",
  "difficulty",
  "resourceTip",
  "fullContent",
  "nextSteps",
];

const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_TYPE_MAP = {
  resources: "pdf",
  maths: "practice",
  updates: "update",
  guides: "guide",
};

const fail = (issues) => {
  console.error("❌ Content validation failed:\n");
  issues.forEach((issue, index) => {
    console.error(`${index + 1}. ${issue}`);
  });
  process.exit(1);
};

const ok = (message) => {
  console.log(`✅ ${message}`);
};

if (!fs.existsSync(contentPath)) {
  fail([`Missing file: ${contentPath}`]);
}

const raw = fs.readFileSync(contentPath, "utf8");
let parsed;

try {
  parsed = JSON.parse(raw);
} catch (error) {
  fail([`Invalid JSON format: ${error.message}`]);
}

const issues = [];
const sections = parsed?.sections;

if (!sections || typeof sections !== "object") {
  issues.push("Top-level `sections` object is required.");
}

const slugSet = new Set();

for (const sectionName of REQUIRED_SECTIONS) {
  const list = sections?.[sectionName];

  if (!Array.isArray(list)) {
    issues.push(`Section \`${sectionName}\` must be an array.`);
    continue;
  }

  list.forEach((item, index) => {
    const pointer = `${sectionName}[${index}]`;

    if (!item || typeof item !== "object") {
      issues.push(`${pointer} must be an object.`);
      return;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in item)) {
        issues.push(`${pointer} missing required field: \`${field}\`.`);
      }
    }

    if (typeof item.slug !== "string" || !item.slug.trim()) {
      issues.push(`${pointer}.slug must be a non-empty string.`);
    } else {
      if (!kebabCaseRegex.test(item.slug)) {
        issues.push(`${pointer}.slug must be kebab-case. Found: \`${item.slug}\`.`);
      }
      if (slugSet.has(item.slug)) {
        issues.push(`Duplicate slug found: \`${item.slug}\`.`);
      }
      slugSet.add(item.slug);
    }

    if (!Array.isArray(item.fullContent) || item.fullContent.length === 0) {
      issues.push(`${pointer}.fullContent must be a non-empty array.`);
    }

    if (!Array.isArray(item.nextSteps) || item.nextSteps.length < 2) {
      issues.push(`${pointer}.nextSteps must contain at least 2 items.`);
    }

    const expectedType = SECTION_TYPE_MAP[sectionName];
    if (item.type !== expectedType) {
      issues.push(`${pointer}.type must be \`${expectedType}\` for section \`${sectionName}\`.`);
    }

    if (sectionName === "resources" && typeof item.pdfUrl !== "string") {
      issues.push(`${pointer}.pdfUrl should be provided for PDF resources.`);
    }
  });
}

if (issues.length > 0) {
  fail(issues);
}

ok("data/content.json passed schema and quality checks.");