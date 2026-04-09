const path = require('path');
const crypto = require('crypto');

const rawNodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
const nodeEnv = rawNodeEnv || 'development';
const isLocalDevelopment = nodeEnv === 'development' || nodeEnv === 'local';

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAllowedCorsOrigins() {
  const configured = splitCsv(process.env.CORS_ALLOWED_ORIGINS);

  if (configured.length > 0) {
    return configured;
  }

  if (isLocalDevelopment) {
    return [
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
  }

  return [];
}

const localDevJwtSecret = isLocalDevelopment
  ? crypto
      .createHash('sha256')
      .update(`${process.cwd()}-${process.pid}`)
      .digest('hex')
  : undefined;

const config = {
  nodeEnv,
  isLocalDevelopment,
  port: Number(process.env.PORT) || 5500,
  dataDir: path.join(__dirname, '../data'),
  jwtSecret: process.env.JWT_SECRET || localDevJwtSecret,
  corsAllowedOrigins: getAllowedCorsOrigins(),
  contactTargetEmail: process.env.CONTACT_TARGET_EMAIL || 'manokantparihar@gmail.com',
  payloadLimit: process.env.PAYLOAD_LIMIT || '100kb',
  authRateLimitWindowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  authRateLimitMaxRequests: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 25),
  contactRateLimitWindowMs: parsePositiveInt(process.env.CONTACT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  contactRateLimitMaxRequests: parsePositiveInt(process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS, 5),
  importRateLimitWindowMs: parsePositiveInt(process.env.IMPORT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  importRateLimitMaxRequests: parsePositiveInt(process.env.IMPORT_RATE_LIMIT_MAX_REQUESTS, 20)
};

if (!config.jwtSecret && !isLocalDevelopment) {
  throw new Error('Missing required environment variable JWT_SECRET for non-local environments.');
}

if (!process.env.JWT_SECRET && isLocalDevelopment) {
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is not set; using an ephemeral local-development secret.');
}

module.exports = config;
