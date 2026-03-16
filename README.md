# start-from-ipad
My developer journey starts today 🚀

## Platform execution plan

- Full A-to-Z roadmap: `ROADMAP.md`
- Current sprint board: `SPRINT-1-TASKS.md`
- Next sprint board (Phase 3): `SPRINT-2-TASKS.md`
- Start here every day: complete Day-wise plan from Sprint 1.

## SEO / OG preview

- Social preview image file: `og-image.svg`
- Homepage and details page now use canonical + Open Graph + Twitter meta tags.
- To export JPG: open `tools/og-image-export.html` from local server and click **Download og-image.jpg**.

## Run locally

```bash
npm run start
```

Open: `http://localhost:5500`

## Phase 2 (Content Engine) commands

```bash
npm run validate:content
```

- Validates `data/content.json` schema, required fields, slug format, duplicate slugs, and minimum quality checks.

```bash
npm run phase2:start
```

- Runs Phase 2 content engine validation pipeline.

```bash
npm run phase2:serve
```

- Validates content first, then starts the local site on port `5500`.

## Contact form submission

- Contact form now submits on-site via local API endpoint: `/api/contact`.
- Submitted records are stored in: `data/contact-submissions.jsonl`
- Server also attempts inbox forwarding via FormSubmit (`manokantparihar@gmail.com`).
- Run the app with `npm run start` before testing contact submit.

If API submit fails for any reason, fallback button opens your default email app with prefilled message.

## PDF / print-ready notes

- Open any resource from the homepage (it opens `details.html?item=...`).
- Click **Print / Save PDF** on the details page.
- In browser print dialog, choose **Save as PDF**.

## Content update workflow

All visible content (resources, maths, updates, guides) is driven from one file: `data/content.json`.

### Browser content editor

- Open `content-manager.html` from the local site.
- Click **Load Current Content** to fetch the current JSON.
- Use form section to add item quickly or click **Fill Item Template**.
- Edit JSON if needed, run **Validate JSON**, then use **Download Updated JSON**.
- Replace the project file `data/content.json` with the downloaded file.
- Run `npm run validate:content` once before publish.

### Adding a new item

1. Open `data/content.json`.
2. Find the correct section key: `resources`, `maths`, `updates`, or `guides`.
3. Append a new object following this schema:

```json
{
	"slug": "unique-kebab-case-id",
	"title": "Display Title",
	"summary": "One-line description shown on the homepage card.",
	"buttonLabel": "Open Resource",
	"category": "Learning Resources",
	"readTime": "5 min read",
	"difficulty": "Medium",
	"resourceTip": "Quick tip shown on the details page.",
	"fullContent": [
		"Point 1",
		"Point 2"
	],
	"nextSteps": [
		"Do this first.",
		"Then do this."
	]
}
```

4. Save the file. The homepage and details page will automatically reflect the change (no code edits needed).

### Editing an existing item

- Find the item by its `slug` in `data/content.json` and update any field directly.
- The `slug` must remain unchanged — it is used in URLs (`details.html?item=slug`).

### Removing an item

- Delete the item's JSON object from its section array in `data/content.json`.
- The homepage and details page will no longer show it.

## Content publishing checklist

Use this quick checklist before publishing any content changes:

- [ ] `slug` is unique and in kebab-case.
- [ ] `title`, `summary`, and `buttonLabel` are present.
- [ ] `category`, `readTime`, and `difficulty` are filled.
- [ ] `fullContent` has clear, learner-friendly bullet points.
- [ ] `nextSteps` has actionable steps (minimum 2 items).
- [ ] Resource opens via `details.html?item=<slug>` without fallback.
- [ ] Search/filter visibility is correct on homepage cards.
- [ ] Print view on details page still works for the new/updated item.