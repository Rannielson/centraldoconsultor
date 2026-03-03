/**
 * GET em um boleto na Hinova e exibe o retorno bruto (para inspeção).
 * Uso: node scripts/get-boleto-hinova-raw.js
 *      NOSSO_NUMERO=5991243 node scripts/get-boleto-hinova-raw.js
 */
import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';

const nossoNumero = process.env.NOSSO_NUMERO || null;

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
    let boletoRow;
    if (nossoNumero) {
      const r = await pool.query(
        'SELECT nosso_numero, cliente_id FROM boletos WHERE nosso_numero = $1 LIMIT 1',
        [nossoNumero]
      );
      boletoRow = r.rows[0];
      if (!boletoRow) {
        console.error('❌ Boleto nosso_numero', nossoNumero, 'não encontrado no banco.');
        process.exit(1);
      }
    } else {
      const r = await pool.query(
        'SELECT nosso_numero, cliente_id FROM boletos ORDER BY updated_at DESC NULLS LAST LIMIT 1'
      );
      boletoRow = r.rows[0];
      if (!boletoRow) {
        console.error('❌ Nenhum boleto no banco.');
        process.exit(1);
      }
      console.log('📌 Usando primeiro boleto encontrado: nosso_numero =', boletoRow.nosso_numero);
    }

    const clienteRes = await pool.query(
      'SELECT token_bearer, url_base_api FROM clientes WHERE id = $1 AND ativo = true',
      [boletoRow.cliente_id]
    );
    if (clienteRes.rows.length === 0) {
      console.error('❌ Cliente não encontrado ou inativo.');
      process.exit(1);
    }
    const { token_bearer, url_base_api } = clienteRes.rows[0];
    const url = `${url_base_api.replace(/\/$/, '')}/buscar/boleto/${encodeURIComponent(boletoRow.nosso_numero)}`;

    console.log('📡 GET', url);
    console.log('');

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token_bearer}` },
      timeout: 30000,
      validateStatus: () => true
    });

    console.log('Status HTTP:', res.status);
    console.log('Retorno (bruto):');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ Erro:', err.message);
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Body:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
