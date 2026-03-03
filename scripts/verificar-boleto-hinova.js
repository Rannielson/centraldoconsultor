/**
 * Verifica se os dados de um boleto estão carregando na API Hinova (SGA).
 * Busca o boleto no banco por placa/vencimento/valor e consulta o detalhe na SGA.
 * Uso: node scripts/verificar-boleto-hinova.js
 *      PLACA=QFV2D29 VENCIMENTO=05/03/2026 VALOR=142.97 node scripts/verificar-boleto-hinova.js
 */
import 'dotenv/config';
import pg from 'pg';
import { buscarBoletoPorNossoNumero } from '../src/services/sgaService.js';

const placa = (process.env.PLACA || 'QFV2D29').replace(/\s/g, '').toUpperCase();
const vencimento = process.env.VENCIMENTO || '05/03/2026'; // DD/MM/YYYY
const valor = parseFloat(process.env.VALOR || '142.97');

function parseVencimento(ddmmYYYY) {
  const [d, m, y] = ddmmYYYY.split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

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
    const dataVenc = parseVencimento(vencimento);
    console.log('🔍 Buscando boleto no banco:', { placa, vencimento: dataVenc, valor });
    const boletoRes = await pool.query(
      `SELECT b.nosso_numero, b.placa_veiculo, b.data_vencimento, b.valor_boleto, b.modelo_veiculo, b.cliente_id, b.nome_associado
       FROM boletos b
       WHERE UPPER(REPLACE(b.placa_veiculo, ' ', '')) = $1
         AND b.data_vencimento = $2::date
         AND ABS(b.valor_boleto - $3) < 0.02
       LIMIT 1`,
      [placa, dataVenc, valor]
    );

    if (boletoRes.rows.length === 0) {
      console.log('⚠️ Nenhum boleto encontrado no banco com esses dados. Tentando só placa + vencimento...');
      const fallback = await pool.query(
        `SELECT b.nosso_numero, b.placa_veiculo, b.data_vencimento, b.valor_boleto, b.modelo_veiculo, b.cliente_id, b.nome_associado
         FROM boletos b
         WHERE UPPER(REPLACE(b.placa_veiculo, ' ', '')) = $1 AND b.data_vencimento = $2::date
         LIMIT 1`,
        [placa, dataVenc]
      );
      if (fallback.rows.length === 0) {
        console.error('❌ Boleto não encontrado no banco (placa', placa, 'vencimento', vencimento, '). Rode a sincronização de março.');
        process.exit(1);
      }
      boletoRes.rows = fallback.rows;
    }

    const b = boletoRes.rows[0];
    console.log('✅ Boleto no banco:', b.nosso_numero, '|', b.placa_veiculo, '|', b.data_vencimento, '| R$', b.valor_boleto);

    const clienteRes = await pool.query(
      'SELECT token_bearer, url_base_api, nome FROM clientes WHERE id = $1 AND ativo = true',
      [b.cliente_id]
    );
    if (clienteRes.rows.length === 0) {
      console.error('❌ Cliente não encontrado ou inativo.');
      process.exit(1);
    }
    const cliente = clienteRes.rows[0];
    console.log('📡 Consultando detalhe na Hinova (SGA)...');
    const resposta = await buscarBoletoPorNossoNumero(cliente.token_bearer, cliente.url_base_api, b.nosso_numero);

    if (!resposta || resposta.length === 0) {
      console.error('❌ Hinova não retornou dados para este boleto (nosso_numero:', b.nosso_numero, ').');
      process.exit(1);
    }

    const item = resposta[0];
    const linha = item.linha_digitavel || item.linhaDigitavel || '';
    const pix = item.pix && (item.pix.copia_cola || item.pix.copiaCola);
    const link = item.link_boleto || item.linkBoleto || item.short_link || item.shortLink || '';

    console.log('\n✅ Dados carregando na Hinova:');
    console.log('   Nome associado:', item.nome_associado || item.nomeAssociado || '-');
    console.log('   Vencimento:', item.data_vencimento || item.dataVencimento || '-');
    console.log('   Valor:', item.valor_boleto ?? item.valorBoleto ?? '-');
    console.log('   Linha digitável:', linha ? `${linha.substring(0, 30)}...` : '(vazio)');
    console.log('   PIX copia e cola:', pix ? 'sim' : 'não');
    console.log('   Link do boleto/PDF:', link ? 'sim' : 'não');
    if (item.veiculos && item.veiculos.length) {
      const v = item.veiculos[0];
      console.log('   Placa (SGA):', v.placa || '-');
      console.log('   Modelo (SGA):', v.modelo || '-');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
