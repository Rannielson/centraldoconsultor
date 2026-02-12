/**
 * Gera arquivo MD com todos os links short dos consultores.
 * Uso: node scripts/gerar-links-consultores-md.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = (process.env.APP_BASE_URL || 'https://centralconsultor.atomos.tech').replace(/\/$/, '');
const OUT_FILE = path.join(__dirname, '..', 'links-consultores-central.md');

function formatTelefone(contato) {
  if (!contato) return '—';
  const s = String(contato).trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return s;
}

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
    // Um link por consultor (competência mais recente)
    const res = await pool.query(
      `SELECT DISTINCT ON (c.id) c.nome AS consultor, c.contato AS telefone, l.short_code, l.competencia
       FROM links_consultor l
       INNER JOIN consultores c ON c.id = l.consultor_id
       WHERE l.short_code IS NOT NULL
       ORDER BY c.id, l.competencia DESC, c.nome`
    );

    const rows = res.rows.sort((a, b) => (a.consultor || '').localeCompare(b.consultor || '', 'pt-BR'));

    const lines = [
      '*Links da Central do Consultor*',
      '',
      `Base: ${BASE_URL}`,
      ''
    ];

    rows.forEach((row, i) => {
      const link = `${BASE_URL}/app/s/${row.short_code}`;
      const nome = (row.consultor || '').trim();
      const tel = formatTelefone(row.telefone);
      lines.push(`${i + 1}. ${nome} - ${tel}`);
      lines.push(link);
      lines.push('');
    });

    lines.push(`_Gerado em ${new Date().toLocaleString('pt-BR')} - ${rows.length} consultor(es)_`);

    fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
    console.log('✅ Arquivo gerado:', OUT_FILE);
    console.log('   Consultores:', rows.length);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
