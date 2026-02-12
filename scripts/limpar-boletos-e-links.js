/**
 * Limpa os dados das tabelas boletos e links_consultor.
 * Usa DATABASE_URL do .env (configure com a URL de produção para limpar produção).
 * Uso: node scripts/limpar-boletos-e-links.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
    await pool.query('TRUNCATE TABLE links_consultor RESTART IDENTITY CASCADE');
    console.log('✅ Dados de links_consultor apagados.');

    await pool.query('TRUNCATE TABLE boletos RESTART IDENTITY CASCADE');
    console.log('✅ Dados de boletos apagados.');

    console.log('\n✅ Concluído. As tabelas estão vazias.');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
