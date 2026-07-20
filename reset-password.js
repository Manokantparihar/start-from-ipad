const pool = require('./src/utils/db.pg.js');
const bcrypt = require('bcryptjs');
const EMAIL = 'manokant2002@gmail.com';
const NEW_HASH = '$2b$10$kwL9hRTO1a8dFxuZbRa0o..AMFCvnHC2IOb99S9jAv95KOVkV9zp6';
(async () => {
  try {
    const r = await pool.query('SELECT data FROM users WHERE email=$1', [EMAIL]);
    if (!r.rows.length) throw new Error('User nahi mila: ' + EMAIL);
    const data = r.rows[0].data;
    data.password = NEW_HASH;
    await pool.query('UPDATE users SET data=$1 WHERE email=$2', [JSON.stringify(data), EMAIL]);
    const v = await pool.query("SELECT data->>'password' AS p FROM users WHERE email=$1", [EMAIL]);
    const ok = bcrypt.compareSync('Merafoundation', v.rows[0].p);
    console.log(ok ? 'PASSWORD UPDATED & VERIFIED ✅' : 'UPDATE HUA PAR VERIFY FAIL ❌');
    process.exit(0);
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
})();
