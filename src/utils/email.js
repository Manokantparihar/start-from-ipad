/**
 * Email utility – sends transactional emails via Nodemailer + SMTP.
 * Credentials are read from environment variables (see .env.example).
 *
 * Required env vars:
 *   SMTP_HOST     - e.g. smtp.gmail.com
 *   SMTP_PORT     - e.g. 587
 *   SMTP_SECURE   - true for port 465, false otherwise
 *   SMTP_USER     - SMTP username / email address
 *   SMTP_PASS     - SMTP password or app password
 *   SMTP_FROM     - "From" display name + address, e.g. "RPSC/REET Prep <no-reply@example.com>"
 *
 * If SMTP_HOST is not set the module logs a warning and sendEmail() resolves
 * immediately without error so the rest of the platform keeps working.
 */

const nodemailer = require('nodemailer');

const SITE_NAME = process.env.SITE_NAME || 'RPSC/REET Prep';

let _transporter = null;

/**
 * Strip HTML tags from a string without using backtracking-heavy regexes.
 * Iterates character-by-character, which is safe against ReDoS.
 */
function stripHtml(html) {
  let result = '';
  let insideTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<') { insideTag = true; result += ' '; }
    else if (ch === '>') { insideTag = false; }
    else if (!insideTag) { result += ch; }
  }
  // Collapse runs of whitespace to a single space
  return result.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST) return null;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return _transporter;
}

/**
 * Send a transactional email.
 * @param {object} opts
 * @param {string}   opts.to      - Recipient email address
 * @param {string}   opts.subject - Email subject
 * @param {string}   opts.html    - HTML body
 * @param {string}  [opts.text]   - Plain-text fallback (auto-generated if omitted)
 * @returns {Promise<{sent: boolean, error?: string}>}
 */
async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured – skipping email to', to);
    return { sent: false, error: 'SMTP not configured' };
  }

  const from = process.env.SMTP_FROM || `"${SITE_NAME}" <no-reply@example.com>`;
  // Build a safe plain-text fallback by stripping HTML tags without using
  // a complex regex that could exhibit ReDoS behaviour.
  const plainText = text || stripHtml(html);

  try {
    await transporter.sendMail({ from, to, subject, html, text: plainText });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
    return { sent: false, error: err.message };
  }
}

// ─── Template Builders ────────────────────────────────────────────────────────

function _wrap(body) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #2563eb; color: #fff; padding: 24px 30px; }
    .header h1 { margin: 0; font-size: 22px; }
    .content { padding: 28px 30px; color: #374151; font-size: 15px; line-height: 1.7; }
    .footer { padding: 18px 30px; background: #f9fafb; font-size: 12px; color: #9ca3af; text-align: center; }
    .btn { display: inline-block; margin-top: 18px; padding: 10px 22px; background: #2563eb; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${SITE_NAME}</h1></div>
    <div class="content">${body}</div>
    <div class="footer">You received this email because you are a registered member of ${SITE_NAME}.<br>To manage email preferences, visit your profile settings.</div>
  </div>
</body>
</html>`;
}

/** Quiz / assignment published notification */
function buildNewContentEmail({ userName, contentTitle, contentType, url }) {
  const label = contentType === 'quiz' ? 'new quiz' : 'new resource';
  return {
    subject: `${SITE_NAME}: New ${contentType} published – "${contentTitle}"`,
    html: _wrap(`
      <p>Hi ${userName || 'there'},</p>
      <p>A <strong>${label}</strong> has been published on ${SITE_NAME}:</p>
      <p><strong>${contentTitle}</strong></p>
      ${url ? `<a href="${url}" class="btn">View now</a>` : ''}
    `)
  };
}

/** Score / result available notification */
function buildResultEmail({ userName, quizTitle, score, percent }) {
  return {
    subject: `${SITE_NAME}: Your result for "${quizTitle}" is ready`,
    html: _wrap(`
      <p>Hi ${userName || 'there'},</p>
      <p>Your result for <strong>${quizTitle}</strong> is now available.</p>
      <p>Score: <strong>${score}</strong> &nbsp;·&nbsp; Percentage: <strong>${percent}%</strong></p>
      <a href="/dashboard.html" class="btn">View my dashboard</a>
    `)
  };
}

/** Admin announcement email */
function buildAnnouncementEmail({ userName, title, message }) {
  return {
    subject: `${SITE_NAME}: ${title}`,
    html: _wrap(`
      <p>Hi ${userName || 'there'},</p>
      <p><strong>${title}</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `)
  };
}

/** Password reset email */
function buildPasswordResetEmail({ userName, resetUrl }) {
  return {
    subject: `${SITE_NAME}: Password reset request`,
    html: _wrap(`
      <p>Hi ${userName || 'there'},</p>
      <p>We received a request to reset your password on ${SITE_NAME}.</p>
      <a href="${resetUrl}" class="btn">Reset password</a>
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
    `)
  };
}

module.exports = {
  sendEmail,
  buildNewContentEmail,
  buildResultEmail,
  buildAnnouncementEmail,
  buildPasswordResetEmail
};
