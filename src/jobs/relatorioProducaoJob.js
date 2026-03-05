import { query } from '../config/database.js';
import { obterPeriodoMesAteHoje, buscarVeiculosProducao } from '../services/sgaService.js';
import {
  montarPayloadRelatorioProducao,
  montarPayloadRelatorioProducaoRanking,
  gerarPdfRelatorio
} from '../services/relatorioPdfService.js';
import { enviarUrlWhatsApp, normalizarChatId } from '../services/cleoiaService.js';

const DELAY_ENTRE_ENVIOS_MS = Number(process.env.RELATORIO_PRODUCAO_DELAY_MS) || 3000;

/**
 * Executa o relatório de produção: busca veículos (adesões) na Hinova
 * do 1º dia do mês até hoje, gera PDF único consolidado e envia para o destino configurado.
 * Roda às 18h30 via node-cron (America/Sao_Paulo).
 */
export async function executarRelatorioProducao() {
  const inicio = new Date();
  console.log(`\n🕐 [Cron 18h30] Relatório de produção iniciado em ${inicio.toISOString()}`);

  const destinosRaw =
    process.env.RELATORIO_PRODUCAO_DESTINO || '5583996336133,5583988473502';
  const destinos = destinosRaw
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const { data_inicial, data_final } = obterPeriodoMesAteHoje();

  try {
    const clientesResult = await query(
      'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('⚠️ [Cron 18h30] Nenhum cliente ativo');
      return;
    }

    console.log(
      `📋 ${clientes.length} cliente(s) | Período: ${data_inicial} a ${data_final} | Destinos: ${destinos.join(', ')}\n`
    );

    const consultoresMap = new Map();
    const consultoresComContato = new Map();
    const todosVeiculos = [];

    for (const cliente of clientes) {
      try {
        const consultoresResult = await query(
          'SELECT id_consultor_sga, nome, contato FROM consultores WHERE cliente_id = $1 AND ativo = true',
          [cliente.id]
        );

        consultoresResult.rows.forEach((c) => {
          const idSga = String(c.id_consultor_sga);
          consultoresMap.set(idSga, c.nome || '');
          if (c.contato) {
            consultoresComContato.set(idSga, {
              nome: c.nome || '',
              contato: c.contato
            });
          }
        });

        const veiculos = await buscarVeiculosProducao(
          cliente.token_bearer,
          cliente.url_base_api,
          { dataInicial: data_inicial, dataFinal: data_final }
        );

        if (veiculos.length > 0) {
          todosVeiculos.push(...veiculos);
          console.log(`   ${cliente.nome}: ${veiculos.length} adesões`);
        }
      } catch (err) {
        console.error(`❌ Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    if (todosVeiculos.length === 0) {
      console.log('⚠️ [Cron 18h30] Nenhuma adesão no período — envio omitido');
      const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
      console.log(`\n✅ [Cron 18h30] Concluído em ${duracao}s (sem produção)\n`);
      return;
    }

    const subtitle = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Relatório ranking (Data, Consultor, Total no dia, Total no mês)
    const payloadRanking = montarPayloadRelatorioProducaoRanking(
      todosVeiculos,
      consultoresMap,
      data_final,
      {
        title: 'Relatório de Produção - Ranking - PROSEG',
        subtitle
      }
    );
    const pdfRankingUrl = await gerarPdfRelatorio(payloadRanking);
    console.log(`📄 PDF ranking gerado: ${payloadRanking.content.items.length} consultores`);

    for (const destino of destinos) {
      await enviarUrlWhatsApp(
        destino,
        'RELATÓRIO DE PRODUÇÃO - RANKING - PROSEG',
        pdfRankingUrl
      );
      console.log(`✅ WhatsApp (ranking) enviado para ${destino}`);
    }

    // Envio individual por consultor (se habilitado)
    const enviarIndividual =
      process.env.RELATORIO_PRODUCAO_INDIVIDUAL !== 'false' &&
      process.env.RELATORIO_PRODUCAO_INDIVIDUAL !== '0';
    if (enviarIndividual && consultoresComContato.size > 0) {
      console.log(`\n📤 Envio individual para ${consultoresComContato.size} consultores com contato...`);
      let primeiroEnvio = true;
      for (const [idSga, info] of consultoresComContato) {
        const chatid = normalizarChatId(info.contato);
        if (!chatid) {
          console.log(`   ⏭️ ${info.nome} sem contato válido - pulando`);
          continue;
        }
        const veiculosConsultor = todosVeiculos.filter(
          (v) => String(v.codigo_voluntario) === idSga
        );
        if (veiculosConsultor.length === 0) {
          console.log(`   ⏭️ ${info.nome} sem produção no período - pulando`);
          continue;
        }
        try {
          if (!primeiroEnvio) {
            await new Promise((r) => setTimeout(r, DELAY_ENTRE_ENVIOS_MS));
          }
          primeiroEnvio = false;
          const payloadIndividual = montarPayloadRelatorioProducao(
            veiculosConsultor,
            consultoresMap,
            {
              title: `Sua Produção - ${info.nome}`,
              subtitle: new Date().toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
              })
            }
          );
          const pdfIndividualUrl = await gerarPdfRelatorio(payloadIndividual);
          await enviarUrlWhatsApp(
            chatid,
            `Sua produção (${veiculosConsultor.length} adesões no período)`,
            pdfIndividualUrl
          );
          console.log(`   ✅ ${info.nome}: ${veiculosConsultor.length} adesões enviadas`);
        } catch (err) {
          console.error(`   ❌ ${info.nome}:`, err.message);
        }
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n✅ [Cron 18h30] Relatório de produção concluído em ${duracao}s\n`);
  } catch (err) {
    console.error('❌ [Cron 18h30] Erro no relatório de produção:', err.message);
  }
}
