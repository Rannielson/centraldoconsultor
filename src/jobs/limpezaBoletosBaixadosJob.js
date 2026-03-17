import { query } from '../config/database.js';
import { removerBoletosBaixados } from '../services/boletoService.js';

/**
 * Remove do banco os boletos que já foram baixados (pagos) na API SGA.
 * Compara nosso_numero dos baixados do mês (até D-1) e deleta da tabela boletos.
 * Roda às 23h via node-cron (America/Sao_Paulo).
 */
export async function executarLimpezaBoletosBaixados() {
  const inicio = new Date();
  console.log(`\n🧹 [Cron 23h] Limpeza de boletos baixados iniciada em ${inicio.toISOString()}`);

  try {
    const clientesResult = await query(
      'SELECT id, nome FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('⚠️ [Cron 23h] Nenhum cliente ativo');
      return;
    }

    for (const cliente of clientes) {
      try {
        console.log(`   --- ${cliente.nome} ---`);
        const resultado = await removerBoletosBaixados(cliente.id);
        console.log(`   ${cliente.nome}: ${resultado.totalRemovidos} removidos (${resultado.totalBaixadosApi} baixados na API)`);
      } catch (err) {
        console.error(`   ❌ Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n✅ [Cron 23h] Limpeza concluída em ${duracao}s\n`);
  } catch (err) {
    console.error('❌ [Cron 23h] Erro na limpeza:', err.message);
  }
}
