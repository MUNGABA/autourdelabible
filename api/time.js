import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  const result = await pool.query('SELECT NOW()');
  res.status(200).json({ time: result.rows[0] });
}
