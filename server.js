const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 5500;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "contact-submissions.jsonl");
const CONTACT_TARGET_EMAIL = process.env.CONTACT_TARGET_EMAIL || "manokantparihar@gmail.com";
const FORMSUBMIT_ENDPOINT = `https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_TARGET_EMAIL)}`;
const FORMSUBMIT_FORM_ENDPOINT = `https://formsubmit.co/${CONTACT_TARGET_EMAIL}`;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const forwardViaAjaxEndpoint = async ({ name, email, message }) => {
  try {
    const response = await fetch(FORMSUBMIT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        message,
        _replyto: email,
        _subject: `New contact message from ${name}`,
        _template: "table",
        _captcha: "false",
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const ok = response.ok && (payload?.success === true || payload?.success === "true");
    if (!ok) {
      return {
        success: false,
        message: payload?.message || payload?.error || "AJAX forwarding failed",
      };
    }

    return { success: true, message: "Email forwarded (AJAX endpoint)" };
  } catch (error) {
    return { success: false, message: error.message || "AJAX forwarding failed" };
  }
};

const forwardViaFormEndpoint = async ({ name, email, message }) => {
  try {
    const body = new URLSearchParams({
      name,
      email,
      message,
      _replyto: email,
      _subject: `New contact message from ${name}`,
      _template: "table",
      _captcha: "false",
    });

    const response = await fetch(FORMSUBMIT_FORM_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const ok = response.ok && (payload?.success === true || payload?.success === "true");
    if (!ok) {
      return {
        success: false,
        message: payload?.message || payload?.error || "Form-endpoint forwarding failed",
      };
    }

    return { success: true, message: "Email forwarded (form endpoint)" };
  } catch (error) {
    return { success: false, message: error.message || "Form-endpoint forwarding failed" };
  }
};

const forwardToEmail = async ({ name, email, message }) => {
  const ajaxAttempt = await forwardViaAjaxEndpoint({ name, email, message });
  if (ajaxAttempt.success) {
    return ajaxAttempt;
  }

  const formAttempt = await forwardViaFormEndpoint({ name, email, message });
  if (formAttempt.success) {
    return formAttempt;
  }

  return {
    success: false,
    message: `AJAX: ${ajaxAttempt.message} | FORM: ${formAttempt.message}`,
  };
};

const handleContactPost = async (req, res) => {
  try {
    const rawBody = await readRequestBody(req);
    const parsed = JSON.parse(rawBody || "{}");

    const name = String(parsed.name || "").trim();
    const email = String(parsed.email || "").trim();
    const message = String(parsed.message || "").trim();

    if (!name || !email || !message) {
      return sendJson(res, 400, { success: false, message: "Missing required fields" });
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const record = {
      submittedAt: new Date().toISOString(),
      name,
      email,
      message,
    };

    fs.appendFileSync(SUBMISSIONS_FILE, `${JSON.stringify(record)}\n`, "utf8");
    const forwarded = await forwardToEmail({ name, email, message });

    return sendJson(res, 200, {
      success: true,
      message: forwarded.success ? "Message submitted and forwarded" : "Message submitted locally",
      emailForwarded: forwarded.success,
      emailStatus: forwarded.message,
    });
  } catch (error) {
    return sendJson(res, 500, { success: false, message: error.message || "Server error" });
  }
};

const safeResolve = (pathname) => {
  const normalizedPath = decodeURIComponent(pathname).replace(/\0/g, "");
  const requested = normalizedPath === "/" ? "/index.html" : normalizedPath;
  const filePath = path.normalize(path.join(ROOT_DIR, requested));

  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return filePath;
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/contact" && req.method === "POST") {
    return handleContactPost(req, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const filePath = safeResolve(requestUrl.pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`RPSC/REET prep server running on http://localhost:${PORT}`);
});
