const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

// ─── Upload Directory ─────────────────────────────────────────────────────────

const RESOURCES_DIR = path.join(__dirname, '../../uploads/resources');
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

// ─── Multer Setup ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RESOURCES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  }
});

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

    const { title, description } = req.body;
    if (!title || !String(title).trim()) {
      // Remove the orphaned file before rejecting – verify path stays within RESOURCES_DIR
      const safeOrphanPath = path.resolve(RESOURCES_DIR, path.basename(req.file.filename));
      if (safeOrphanPath.startsWith(RESOURCES_DIR + path.sep)) {
        try { fs.unlinkSync(safeOrphanPath); } catch (unlinkErr) {
          if (unlinkErr.code !== 'ENOENT') {
            console.error('Failed to delete orphaned upload:', unlinkErr.message);
          }
        }
      }
      return res.status(400).json({ error: 'Title is required.' });
    }

    try {
      const resources = await db.getResources();
      const now = new Date().toISOString();
      const record = {
        id: uuidv4(),
        title: String(title).trim().slice(0, MAX_TITLE_LENGTH),
        description: description ? String(description).trim().slice(0, MAX_DESCRIPTION_LENGTH) : '',
        origFilename: req.file.originalname,
        filename: req.file.filename,
        filePath: `/uploads/resources/${req.file.filename}`,
        size: req.file.size,
        uploadedBy: req.user ? req.user.name || req.user.email : 'admin',
        uploadedById: req.user ? req.user.id : null,
        uploadedAt: now,
        isDeleted: false
      };
      resources.push(record);
      await db.saveResources(resources);

      return res.status(201).json({ message: 'Resource uploaded successfully.', resource: record });
    } catch {
      return res.status(500).json({ error: 'Server error while saving resource.' });
    }
  });
});

// ─── GET /api/resources ───────────────────────────────────────────────────────
// Public (auth not required): list all active resources.
router.get('/', async (req, res) => {
  try {
    const resources = await db.getResources();
    const active = resources
      .filter(r => !r.isDeleted)
      .map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        origFilename: r.origFilename,
        size: r.size,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.uploadedAt
      }));
    return res.json(active);
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /api/resources/:id/download ─────────────────────────────────────────
// Public (auth not required): download a file by ID.
router.get('/:id/download', async (req, res) => {
  try {
    const resources = await db.getResources();
    const resource = resources.find(r => r.id === req.params.id && !r.isDeleted);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const filePath = path.join(__dirname, '../../uploads/resources', resource.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    const inline = req.query.inline === '1' || req.query.view === '1';

    if (inline) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(resource.origFilename)}"`
      );
      res.setHeader('Content-Type', 'application/pdf');
      return res.sendFile(filePath);
    }

    // Force browser download for Download button flows.
    return res.download(filePath, resource.origFilename);
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── GET /api/resources/:id/view ─────────────────────────────────────────────
// Public (auth not required): open a file inline in browser.
router.get('/:id/view', async (req, res) => {
  try {
    const resources = await db.getResources();
    const resource = resources.find(r => r.id === req.params.id && !r.isDeleted);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    const filePath = path.join(__dirname, '../../uploads/resources', resource.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(resource.origFilename)}"`
    );
    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(filePath);
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE /api/admin/resources/:id ─────────────────────────────────────────
// Admin-only: soft-delete a resource.
router.delete('/:id', async (req, res) => {
  try {
    const resources = await db.getResources();
    const idx = resources.findIndex(r => r.id === req.params.id && !r.isDeleted);
    if (idx === -1) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    resources[idx].isDeleted = true;
    resources[idx].deletedAt = new Date().toISOString();
    resources[idx].deletedBy = req.user ? req.user.id : null;
    await db.saveResources(resources);

    return res.json({ message: 'Resource deleted successfully.' });
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
