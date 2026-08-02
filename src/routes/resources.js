const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const VALID_ACCESS_TIERS = ['free', 'premium'];
const VALID_VISIBILITY = ['public', 'private'];
const SUPABASE_BUCKET = process.env.SUPABASE_RESOURCES_BUCKET || 'Resources';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ─── Multer Setup ─────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  }
});

function normalizeAccessTier(value) {
  const tier = String(value || 'free').trim().toLowerCase();
  return VALID_ACCESS_TIERS.includes(tier) ? tier : 'free';
}

function normalizeVisibility(value) {
  const visibility = String(value || 'public').trim().toLowerCase();
  return VALID_VISIBILITY.includes(visibility) ? visibility : 'public';
}

function assertSupabaseReady() {
  if (!supabase) {
    const error = new Error('Supabase storage is not configured.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
}

function getStoragePath(resource) {
  const pathCandidate =
    resource?.storagePath || resource?.filename || resource?.fileName || resource?.filePath || '';
  return String(pathCandidate).trim();
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function getPublicUrlForStoragePath(storagePath) {
  const normalizedPath = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!normalizedPath) return null;

  if (supabase) {
    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(normalizedPath);
    if (data && data.publicUrl) {
      return data.publicUrl;
    }
  }

  if (!SUPABASE_URL) {
    return null;
  }

  const encodedBucket = encodeURIComponent(SUPABASE_BUCKET);
  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

function resolveResourceUrl(resource) {
  if (!resource) return null;

  if (isHttpUrl(resource.fileUrl)) return resource.fileUrl.trim();
  if (isHttpUrl(resource.url)) return resource.url.trim();
  if (isHttpUrl(resource.filePath)) return resource.filePath.trim();

  const storagePath = getStoragePath(resource);
  if (!storagePath) return null;

  return getPublicUrlForStoragePath(storagePath);
}

function getLegacyLocalPath(resource) {
  if (process.env.VERCEL) return null;

  const legacyName = getStoragePath(resource);
  if (!legacyName) return null;

  const candidate = path.resolve(__dirname, '../../uploads/resources', path.basename(legacyName));
  return fs.existsSync(candidate) ? candidate : null;
}

function safeDispositionName(name) {
  return String(name || 'resource.pdf').replace(/[\r\n"]/g, '_');
}

async function streamResourceResponse(res, resource, { inline }) {
  const localPath = getLegacyLocalPath(resource);
  if (localPath) {
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeDispositionName(resource.origFilename || resource.title || 'resource.pdf')}"`
    );
    if (inline) {
      res.setHeader('Content-Type', 'application/pdf');
      return res.sendFile(localPath);
    }
    return res.download(localPath, resource.origFilename || resource.title || 'resource.pdf');
  }

  const fileUrl = resolveResourceUrl(resource);
  if (!fileUrl) {
    return res.status(404).json({ error: 'File not available.' });
  }

  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) {
    return res.status(404).json({ error: 'File not available.' });
  }

  res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safeDispositionName(resource.origFilename || resource.title || 'resource.pdf')}"`
  );

  await pipeline(Readable.fromWeb(response.body), res);
  return null;
}

// ─── POST /api/admin/resources ────────────────────────────────────────────────
// Admin-only: upload a new PDF/note/assignment.
// authMiddleware + isAdmin are applied in server.js when mounting this router.
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum size is 10 MB.'
          : err.message || 'Upload failed.';
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    const { title, description, accessTier, visibility } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const storagePath = `${uuidv4()}.pdf`;
    let uploadedToStorage = false;

    try {
      assertSupabaseReady();

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype || 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedToStorage = true;

      const now = new Date().toISOString();
      const publicUrl = getPublicUrlForStoragePath(storagePath);
      const record = {
        id: uuidv4(),
        title: String(title).trim().slice(0, MAX_TITLE_LENGTH),
        description: description ? String(description).trim().slice(0, MAX_DESCRIPTION_LENGTH) : '',
        accessTier: normalizeAccessTier(accessTier),
        visibility: normalizeVisibility(visibility),
        origFilename: req.file.originalname,
        filename: storagePath,
        storagePath,
        storageBucket: SUPABASE_BUCKET,
        storageProvider: 'supabase',
        fileUrl: publicUrl,
        filePath: publicUrl,
        size: req.file.size,
        uploadedBy: req.user ? req.user.name || req.user.email : 'admin',
        uploadedById: req.user ? req.user.id : null,
        uploadedAt: now,
        isDeleted: false
      };

      const resources = await db.getResources();
      resources.push(record);
      await db.saveResources(resources);

      return res.status(201).json({
        message: 'Resource uploaded successfully.',
        resource: record
      });
    } catch (error) {
      if (uploadedToStorage) {
        await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath]).catch((removeErr) => {
          console.warn('[POST /api/admin/resources] rollback failed:', removeErr?.message || removeErr);
        });
      }

      console.error('[POST /api/admin/resources] error:', error);
      return res.status(500).json({
        error: error?.message || 'Server error while saving resource.'
      });
    }
  });
});

// ─── GET /api/resources ───────────────────────────────────────────────────────
// Public (auth not required): list all active resources.
router.get('/', async (_req, res) => {
  try {
    const resources = await db.getResources();
    const active = resources
      .filter((r) => !r.isDeleted)
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        accessTier: normalizeAccessTier(r.accessTier),
        visibility: normalizeVisibility(r.visibility),
        origFilename: r.origFilename,
        filename: r.filename || r.storagePath || '',
        storagePath: r.storagePath || r.filename || '',
        storageBucket: r.storageBucket || SUPABASE_BUCKET,
        fileUrl: resolveResourceUrl(r) || '',
        filePath: resolveResourceUrl(r) || r.filePath || '',
        size: r.size,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.uploadedAt
      }));
    return res.json(active);
  } catch (error) {
    console.error('[GET /api/resources] error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /api/resources/:id/download ─────────────────────────────────────────
// Public (auth not required): download a file by ID.
router.get('/:id/download', async (req, res) => {
  try {
    const resources = await db.getResources();
    const resource = resources.find((r) => r.id === req.params.id && !r.isDeleted);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const inline = req.query.inline === '1' || req.query.view === '1';
    return await streamResourceResponse(res, resource, { inline });
  } catch (error) {
    console.error('[GET /api/resources/:id/download] error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /api/resources/:id/view ─────────────────────────────────────────────
// Public (auth not required): open a file inline in browser.
router.get('/:id/view', async (req, res) => {
  try {
    const resources = await db.getResources();
    const resource = resources.find((r) => r.id === req.params.id && !r.isDeleted);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    return await streamResourceResponse(res, resource, { inline: true });
  } catch (error) {
    console.error('[GET /api/resources/:id/view] error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /api/admin/resources/:id ─────────────────────────────────────────
// Admin-only: soft-delete a resource and remove the object from Supabase storage.
router.delete('/:id', async (req, res) => {
  try {
    const resources = await db.getResources();
    const idx = resources.findIndex((r) => r.id === req.params.id && !r.isDeleted);
    if (idx === -1) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const resource = resources[idx];
    const storagePath = getStoragePath(resource);

    if (storagePath && supabase) {
      const { error: removeError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([storagePath]);

      if (removeError) {
        console.warn('[DELETE /api/admin/resources/:id] storage delete warning:', removeError);
      }
    }

    resources[idx] = {
      ...resource,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: req.user ? req.user.id : null
    };
    await db.saveResources(resources);

    return res.json({ message: 'Resource deleted successfully.' });
  } catch (error) {
    console.error('[DELETE /api/admin/resources/:id] error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;