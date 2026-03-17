import { query } from '../config/database.js';
import { obterPeriodoMesAteHoje, obterPeriodoAnoAteHoje, buscarVeiculosProducao } from '../services/sgaService.js';
import { montarPayloadRelatorioProducaoRanking, gerarPdfRelatorio } from '../services/relatorioPdfService.js';
import { enviarUrlWhatsApp } from '../services/cleoiaService.js';

/**
 * Formata data DD/MM/YYYY
 */
function formatarData(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Executa o relatório de produção ranking mensal (gestão).
 * Gera PDF único com ranking de vendas no mês e envia para destinos fixos.
 * Roda às 19h15 via node-cron (America/Sao_Paulo).
 */
export async function executarRelatorioProducaoRanking() {
  const inicio = new Date();
  console.log(`\n🕐 [Cron 19h15] Relatório ranking produção iniciado em ${inicio.toISOString()}`);

  const destino =
    process.env.RELATORIO_PRODUCAO_DESTINO ||
    process.env.RELATORIO_CONSOLIDADO_DESTINO ||
    '5581992387425';
  const hoje = new Date();
  const hojeFormatado = formatarData(hoje);
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAteHoje();
  const { data_inicial: anoIni, data_final: anoFim } = obterPeriodoAnoAteHoje();

  try {
    const clientesResult = await query(
      'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('⚠️ [Cron 19h15] Nenhum cliente ativo');
      return;
    }

    console.log(`📋 ${clientes.length} cliente(s) | Período: ${mesIni} a ${mesFim} | Destino: ${destino}\n`);

    for (const cliente of clientes) {
      try {
        const urlBase = (cliente.url_base_api || '').replace(/^["']|["']$/g, '').trim();
        if (!urlBase || !urlBase.startsWith('http')) {
          console.error(`   ${cliente.nome}: url_base_api inválida — pulando`);
          continue;
        }

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

        const veiculos = await buscarVeiculosProducao(cliente.token_bearer, urlBase, {
          dataInicial: mesIni,
          dataFinal: mesFim
        });

        const veiculosAno = await buscarVeiculosProducao(cliente.token_bearer, urlBase, {
          dataInicial: anoIni,
          dataFinal: anoFim
        });

        console.log(`   ${cliente.nome}: ${veiculos.length} adesões no mês | ${veiculosAno.length} no ano`);

        if (veiculos.length === 0 && veiculosAno.length === 0) {
          console.log(`   ${cliente.nome}: nenhuma adesão no período`);
          continue;
        }

        const payload = montarPayloadRelatorioProducaoRanking(
          veiculos,
          consultoresMap,
          hojeFormatado,
          {
            title: `Relatório de Produção - Ranking Mensal - ${cliente.nome}`,
            subtitle: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
            veiculosAno
          }
        );

        const pdfUrl = await gerarPdfRelatorio(payload);
        console.log(`   📄 PDF ranking gerado (${cliente.nome}): ${veiculos.length} adesões`);

        const destinos = destino.split(',').map((d) => d.trim()).filter(Boolean);
        for (const d of destinos) {
          await enviarUrlWhatsApp(d, `RELATÓRIO DE PRODUÇÃO - RANKING MENSAL - ${cliente.nome}`, pdfUrl);
          console.log(`   ✅ WhatsApp enviado para ${d}`);
        }
      } catch (err) {
        console.error(`❌ Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n✅ [Cron 19h15] Relatório ranking produção concluído em ${duracao}s\n`);
  } catch (err) {
    console.error('❌ [Cron 19h15] Erro no relatório ranking produção:', err.message);
  }
}
