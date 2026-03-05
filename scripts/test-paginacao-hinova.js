/**
 * Testa a paginação da API Hinova (500 por página).
 * Busca boletos do mês atual e exibe os logs de cada página.
 *
 * Uso: node scripts/test-paginacao-hinova.js
 *      DATA_INICIAL=01/03/2025 DATA_FINAL=31/03/2025 node scripts/test-paginacao-hinova.js
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { buscarTodosBoletosPeriodo, obterPeriodoMesAtual } from '../src/services/sgaService.js';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida no .env');
    process.exit(1);
  }

  // Pegar credenciais de um cliente ativo
  const clienteRes = await query(
    'SELECT token_bearer, url_base_api FROM clientes WHERE ativo = true LIMIT 1'
  );
  if (clienteRes.rows.length === 0) {
    console.error('❌ Nenhum cliente ativo no banco.');
    process.exit(1);
  }

  const { token_bearer, url_base_api } = clienteRes.rows[0];
  const { data_inicial, data_final } = process.env.DATA_INICIAL && process.env.DATA_FINAL
    ? { data_inicial: process.env.DATA_INICIAL, data_final: process.env.DATA_FINAL }
    : obterPeriodoMesAtual();

  console.log('\n🧪 Teste de paginação Hinova (500 por página)\n');
  console.log(`📅 Período: ${data_inicial} a ${data_final}\n`);

  const boletos = await buscarTodosBoletosPeriodo(token_bearer, url_base_api, {
    codigo_situacao_boleto: '2',
    data_vencimento_inicial: data_inicial,
    data_vencimento_final: data_final
  });

  console.log('\n📊 Resultado final:', boletos.length, 'boletos no total\n');
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
