/**
 * Executa a migration 007 (logo_url em clientes) e define a logo da Proseg.
 * Uso: node scripts/run-migration-and-proseg-logo.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PROSEG_LOGO_URL = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-19/624229176_18377962120089002_5408149581179277978_n.jpg?efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2QHL-ihc7CIs_tJ3IY2w9KIjEfdbEvHor_cW5Y5zGWqUtq2cV2p-_fHMfgSrKaLUgH4vhGA9lLrKtNBOIVVdi1bh&_nc_ohc=PBznIvrsCSMQ7kNvwHBrBAR&_nc_gid=O38X0aLhk-3xJLq_K4OVrA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfsGe1u03MYD3bQ6Mv0QMDL6yr4YhOYTWpIiySSi5j1Qlw&oe=6993020F&_nc_sid=10d13b';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida no .env');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Migrations 007 e 008
    const migration007 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '007_clientes_logo_url.sql'), 'utf8');
    await pool.query(migration007);
    console.log('✅ Migration 007_clientes_logo_url.sql executada.');
    const migration008 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '008_clientes_logo_url_text.sql'), 'utf8');
    await pool.query(migration008);
    console.log('✅ Migration 008_clientes_logo_url_text.sql executada.');

    // 2. Atualizar logo do cliente Proseg
    const res = await pool.query(
      `UPDATE clientes SET logo_url = $1 WHERE nome ILIKE '%Proseg%' RETURNING id, nome, logo_url`,
      [PROSEG_LOGO_URL]
    );
    if (res.rowCount === 0) {
      console.warn('⚠️ Nenhum cliente com nome contendo "Proseg" foi encontrado. Verifique o nome na tabela clientes.');
    } else {
      console.log('✅ Logo da Proseg atualizada:', res.rows[0]);
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
