/**
 * Atualiza url_completa em links_consultor para a URL de produção.
 * Uso: APP_BASE_URL=https://centraldoconsultor-production.up.railway.app node scripts/atualizar-urls-producao.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = (process.env.APP_BASE_URL || 'https://centraldoconsultor-production.up.railway.app').replace(/\/$/, '');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(
      `UPDATE links_consultor
       SET url_completa = $1 || '/app/?token=' || slug
       WHERE slug IS NOT NULL
       RETURNING id, slug, url_completa`,
      [BASE_URL]
    );
    console.log('✅ URLs atualizadas para:', BASE_URL);
    console.log('   Registros atualizados:', res.rowCount);
    if (res.rows.length > 0) {
      res.rows.slice(0, 3).forEach(r => console.log('   -', r.url_completa));
      if (res.rows.length > 3) console.log('   ...');
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
