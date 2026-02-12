/**
 * Reconfigura os dados para produção:
 * 1. Faz backup dos consultores atuais
 * 2. Limpa links_consultor e boletos
 * 3. Limpa consultores e re-insere os mesmos dados (backup)
 * 4. Reconfigura api_keys: deixa apenas a Master Key de produção ativa
 *
 * Uso: node scripts/reconfigurar-dados-producao.js
 * Requer DATABASE_URL no .env (banco de produção).
 *
 * Master Key de produção (inserida em api_keys):
 * ck_c74217154e89bfb317673c69578b14d47ef2f6789c9c1bc3a65e2e760be5ec32
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MASTER_KEY_PRODUCAO = 'ck_c74217154e89bfb317673c69578b14d47ef2f6789c9c1bc3a65e2e760be5ec32';

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
    // 1. Backup consultores (todos os campos necessários para re-inserir)
    console.log('1️⃣ Backup dos consultores atuais...');
    const backup = await pool.query(
      `SELECT id, cliente_id, nome, id_consultor_sga, contato, ativo FROM consultores ORDER BY id`
    );
    const consultores = backup.rows;
    console.log(`   ${consultores.length} consultores salvos.`);

    // 2. Limpar links_consultor e boletos (dependem de consultores)
    console.log('2️⃣ Limpando links_consultor e boletos...');
    await pool.query('TRUNCATE TABLE links_consultor RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE boletos RESTART IDENTITY CASCADE');
    console.log('   OK.');

    // 3. Limpar consultores e re-inserir com os mesmos dados (mesmos IDs)
    console.log('3️⃣ Re-inserindo consultores (mesmos dados)...');
    await pool.query('TRUNCATE TABLE consultores RESTART IDENTITY CASCADE');

    for (const c of consultores) {
      await pool.query(
        `INSERT INTO consultores (id, cliente_id, nome, id_consultor_sga, contato, ativo)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.cliente_id, c.nome, c.id_consultor_sga, c.contato ?? null, c.ativo ?? true]
      );
    }
    console.log(`   ${consultores.length} consultores re-inseridos.`);

    // 4. Reconfigurar api_keys: deixar apenas a Master Key de produção
    console.log('4️⃣ Reconfigurando api_keys (apenas Master Key de produção)...');
    await pool.query('DELETE FROM api_keys');
    await pool.query(
      `INSERT INTO api_keys (key, descricao, ativo) VALUES ($1, $2, $3)`,
      [MASTER_KEY_PRODUCAO, 'API Key Master (produção)', true]
    );
    console.log('   Master Key de produção ativa.');

    console.log('\n✅ Reconfiguração concluída.');
    console.log('   - Consultores: mesmos dados preservados');
    console.log('   - links_consultor e boletos: vazios (rode sincronização depois)');
    console.log('   - api_keys: apenas a chave de produção');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
