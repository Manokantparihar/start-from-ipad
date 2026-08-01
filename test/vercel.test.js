const test = require('node:test');
const assert = require('node:assert/strict');

test('config uses /tmp paths on Vercel', async () => {
  const originalVercel = process.env.VERCEL;
  const originalDataDir = process.env.DATA_DIR;
  const originalUploadsDir = process.env.UPLOADS_DIR;

  try {
    process.env.VERCEL = '1';
    delete process.env.DATA_DIR;
    delete process.env.UPLOADS_DIR;

    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');

    assert.equal(config.isVercel, true);
    assert.equal(config.dataDir, '/tmp/data');
    assert.equal(config.uploadsDir, '/tmp/uploads');
  } finally {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = originalUploadsDir;

    delete require.cache[require.resolve('../src/config')];
  }
});
