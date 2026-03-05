import { query } from '../config/database.js';
import { obterPeriodoMesAtual, buscarTodosBoletosPeriodo } from '../services/sgaService.js';
import { montarPayloadRelatorioConsolidado, gerarPdfRelatorio } from '../services/relatorioPdfService.js';
import { enviarUrlWhatsApp } from '../services/cleoiaService.js';

const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];

/**
 * Executa o relatório consolidado: busca boletos na Hinova (mês completo),
 * agrega por consultor (quantidade e % do total), gera PDF único e envia para o destino configurado.
 * Roda às 19h via node-cron (America/Sao_Paulo).
 */
export async function executarRelatorioConsolidado() {
  const inicio = new Date();
  console.log(`\n🕐 [Cron 19h] Relatório consolidado iniciado em ${inicio.toISOString()}`);

  const destino =
    process.env.RELATORIO_CONSOLIDADO_DESTINO ||
    process.env.RELATORIO_PRODUCAO_DESTINO ||
    '5581992387425';
  const { data_inicial, data_final } = obterPeriodoMesAtual();

  try {
    const clientesResult = await query(
      'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('⚠️ [Cron 19h] Nenhum cliente ativo');
      return;
    }

    console.log(`📋 ${clientes.length} cliente(s) | Período: ${data_inicial} a ${data_final} | Destino: ${destino}\n`);

    for (const cliente of clientes) {
      try {
        const consultoresResult = await query(
          'SELECT id_consultor_sga, nome FROM consultores WHERE cliente_id = $1 AND ativo = true',
          [cliente.id]
        );

        const consultoresMap = new Map();
        consultoresResult.rows.forEach((c) => {
          consultoresMap.set(String(c.id_consultor_sga), c.nome || '');
        });

        if (consultoresMap.size === 0) {
          console.log(`   ${cliente.nome}: sem consultores ativos`);
          continue;
        }

        // Buscar boletos ABERTOS (codigo 2) e BAIXADOS (codigo 1) do mês
        const [boletosAbertos, boletosBaixados] = await Promise.all([
          buscarTodosBoletosPeriodo(cliente.token_bearer, cliente.url_base_api, {
            codigo_situacao_boleto: '2',
            data_vencimento_inicial: data_inicial,
            data_vencimento_final: data_final
          }),
          buscarTodosBoletosPeriodo(cliente.token_bearer, cliente.url_base_api, {
            codigo_situacao_boleto: '1',
            data_vencimento_inicial: data_inicial,
            data_vencimento_final: data_final
          })
        ]);

        const porConsultorAbertos = new Map();
        const porConsultorBaixados = new Map();

        for (const boleto of boletosAbertos) {
          if (!boleto.veiculos || !boleto.veiculos.length) continue;
          for (const veiculo of boleto.veiculos) {
            if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
            const idSga = String(veiculo.codigo_voluntario);
            if (!consultoresMap.has(idSga)) continue;
            porConsultorAbertos.set(idSga, (porConsultorAbertos.get(idSga) || 0) + 1);
          }
        }

        for (const boleto of boletosBaixados) {
          if (!boleto.veiculos || !boleto.veiculos.length) continue;
          for (const veiculo of boleto.veiculos) {
            if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
            const idSga = String(veiculo.codigo_voluntario);
            if (!consultoresMap.has(idSga)) continue;
            porConsultorBaixados.set(idSga, (porConsultorBaixados.get(idSga) || 0) + 1);
          }
        }

        // Unir ids de consultores que têm ao menos 1 boleto (aberto ou baixado)
        const todosIds = new Set([
          ...porConsultorAbertos.keys(),
          ...porConsultorBaixados.keys()
        ]);

        const linhas = [...todosIds]
          .map((idSga) => {
            const abertos = porConsultorAbertos.get(idSga) || 0;
            const baixados = porConsultorBaixados.get(idSga) || 0;
            const total = abertos + baixados;
            return {
              consultor: consultoresMap.get(idSga) || idSga,
              abertos,
              baixados,
              total
            };
          })
          .filter((l) => l.total > 0)
          .sort((a, b) => b.abertos - a.abertos);

        const totalAbertos = linhas.reduce((s, l) => s + l.abertos, 0);
        const totalGeral = linhas.reduce((s, l) => s + l.total, 0);

        if (linhas.length === 0) {
          console.log(`   ${cliente.nome}: nenhum boleto no período`);
          continue;
        }

        const payload = montarPayloadRelatorioConsolidado(linhas, {
          title: `Relatório consolidado de boletos em abertos - ${cliente.nome}`,
          subtitle: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        });

        const pdfUrl = await gerarPdfRelatorio(payload);
        console.log(`   📄 PDF consolidado gerado (${cliente.nome}): ${linhas.length} consultores, ${totalAbertos} abertos de ${totalGeral} total`);

        const destinos = destino.split(',').map((d) => d.trim()).filter(Boolean);
        for (const d of destinos) {
          await enviarUrlWhatsApp(d, 'RELATÓRIO CONSOLIDADO DE BOLETOS EM ABERTOS - PROSEG', pdfUrl);
          console.log(`   ✅ WhatsApp enviado para ${d}`);
        }
      } catch (err) {
        console.error(`❌ Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n✅ [Cron 19h] Relatório consolidado concluído em ${duracao}s\n`);
  } catch (err) {
    console.error('❌ [Cron 19h] Erro no relatório consolidado:', err.message);
  }
}
