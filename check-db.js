const pool = require('./src/utils/db.pg.js');
(async () => {
  try {
    const t = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    console.log('TABLES:', t.rows.map(r => r.table_name).join(', '));

    const guess = t.rows.map(r => r.table_name).find(n => n.includes('user'));
    if (guess) {
      const c = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name=$1", [guess]
      );
      console.log('COLUMNS of ' + guess + ':', c.rows.map(r => r.column_name).join(', '));

      const u = await pool.query('SELECT * FROM "' + guess + '" LIMIT 5');
      u.rows.forEach(r => {
        const copy = { ...r };
        for (const k in copy) if (/pass|hash/i.test(k)) copy[k] = '(hidden)';
        console.log('USER:', JSON.stringify(copy));
      });
    }
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
