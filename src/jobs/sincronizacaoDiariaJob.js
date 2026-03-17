import { query } from '../config/database.js';
import { obterPeriodos90Dias, obterPeriodoMesAtual, buscarTodosBoletosPeriodo } from '../services/sgaService.js';
import { montarPayloadRelatorioInadimplenciaConsultor, gerarPdfRelatorio } from '../services/relatorioPdfService.js';
import { normalizarChatId, enviarUrlWhatsApp } from '../services/cleoiaService.js';

const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];
const DELAY_ENTRE_ENVIOS_MS = 59000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa o job diário: busca boletos na Hinova dos últimos 90 dias (sem gravar no banco),
 * gera PDF individual por consultor com resumo do mês no cabeçalho e envia por WhatsApp.
 * Roda às 9h10 via node-cron.
 */
export async function executarSincronizacaoDiaria() {
  const inicio = new Date();
  console.log(`\n🕐 [Cron] Iniciando sincronização diária em ${inicio.toISOString()}`);

  const periodos90 = obterPeriodos90Dias();
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAtual();

  try {
    const clientesResult = await query(
      'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('⚠️ [Cron] Nenhum cliente ativo encontrado');
      return;
    }

    console.log(`📋 [Cron] ${clientes.length} cliente(s) ativo(s)`);
    console.log(`📅 Período: últimos 90 dias (3 faixas: 0-30, 31-60, 61-90 dias)`);
    console.log(`📅 Resumo mês: ${mesIni} a ${mesFim}\n`);

    let primeiroEnvio = true;

    for (const cliente of clientes) {
      try {
        console.log(`--- Cliente: ${cliente.nome} ---`);

        const urlBase = (cliente.url_base_api || '').replace(/^["']|["']$/g, '').trim();
        if (!urlBase || !urlBase.startsWith('http')) {
          console.log('   ⚠️ url_base_api inválida - pulando');
          continue;
        }

        const consultoresResult = await query(
          'SELECT id_consultor_sga, nome, contato FROM consultores WHERE cliente_id = $1 AND ativo = true',
          [cliente.id]
        );

        const consultoresMap = new Map();
        consultoresResult.rows.forEach((c) => {
          consultoresMap.set(String(c.id_consultor_sga), { nome: c.nome, contato: c.contato });
        });

        if (consultoresMap.size === 0) {
          console.log('   Nenhum consultor ativo');
          continue;
        }

        // Buscar boletos abertos dos últimos 90 dias (detalhamento)
        const buscas = periodos90.map((p) =>
          buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
            codigo_situacao_boleto: '2',
            data_vencimento_inicial: p.data_inicial,
            data_vencimento_final: p.data_final
          })
        );

        // Buscar boletos do mês atual (resumo): abertos + baixados
        const buscaAbertosMes = buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
          codigo_situacao_boleto: '2',
          data_vencimento_inicial: mesIni,
          data_vencimento_final: mesFim
        });
        const buscaBaixadosMes = buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
          codigo_situacao_boleto: '1',
          data_vencimento_inicial: mesIni,
          data_vencimento_final: mesFim
        });

        const [resultados90, boletosAbertosMes, boletosBaixadosMes] = await Promise.all([
          Promise.all(buscas),
          buscaAbertosMes,
          buscaBaixadosMes
        ]);
        const boletosApi = resultados90.flat();

        // Agrupar boletos 90 dias por consultor
        const porConsultor = new Map();

        for (const boleto of boletosApi) {
          if (!boleto.veiculos || !boleto.veiculos.length) continue;
          for (const veiculo of boleto.veiculos) {
            if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
            const consultor = consultoresMap.get(String(veiculo.codigo_voluntario));
            if (!consultor) continue;

            const idSga = String(veiculo.codigo_voluntario);
            if (!porConsultor.has(idSga)) porConsultor.set(idSga, []);

            porConsultor.get(idSga).push({
              nome_associado: boleto.nome_associado || '',
              celular: boleto.celular || '',
              data_vencimento: boleto.data_vencimento || null,
              valor_boleto: parseFloat(boleto.valor_boleto) || 0,
              placa_veiculo: veiculo.placa || '',
              nome_consultor: consultor.nome || ''
            });
          }
        }

        // Contar boletos do mês por consultor (para resumo)
        const abertosMesPorConsultor = new Map();
        const baixadosMesPorConsultor = new Map();

        for (const boleto of boletosAbertosMes) {
          if (!boleto.veiculos || !boleto.veiculos.length) continue;
          for (const veiculo of boleto.veiculos) {
            if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
            const idSga = String(veiculo.codigo_voluntario);
            if (!consultoresMap.has(idSga)) continue;
            abertosMesPorConsultor.set(idSga, (abertosMesPorConsultor.get(idSga) || 0) + 1);
          }
        }

        for (const boleto of boletosBaixadosMes) {
          if (!boleto.veiculos || !boleto.veiculos.length) continue;
          for (const veiculo of boleto.veiculos) {
            if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
            const idSga = String(veiculo.codigo_voluntario);
            if (!consultoresMap.has(idSga)) continue;
            baixadosMesPorConsultor.set(idSga, (baixadosMesPorConsultor.get(idSga) || 0) + 1);
          }
        }

        const consultoresComBoletos = [...porConsultor.entries()].sort((a, b) =>
          (consultoresMap.get(a[0])?.nome || '').localeCompare(consultoresMap.get(b[0])?.nome || '')
        );

        for (const [idSga, boletos] of consultoresComBoletos) {
          boletos.sort((a, b) => {
            const na = (a.nome_associado || '').toString().toLowerCase();
            const nb = (b.nome_associado || '').toString().toLowerCase();
            return na.localeCompare(nb);
          });
          try {
            const consultor = consultoresMap.get(idSga);
            const chatid = normalizarChatId(consultor.contato);

            if (!chatid) {
              console.log(`   ⏭️ ${consultor.nome} sem contato - pulando`);
              continue;
            }

            if (!primeiroEnvio) {
              console.log(`   ⏳ Aguardando ${DELAY_ENTRE_ENVIOS_MS / 1000}s antes do próximo envio...`);
              await delay(DELAY_ENTRE_ENVIOS_MS);
            }
            primeiroEnvio = false;

            const abertosMes = abertosMesPorConsultor.get(idSga) || 0;
            const baixadosMes = baixadosMesPorConsultor.get(idSga) || 0;
            const totalMes = abertosMes + baixadosMes;

            const payload = montarPayloadRelatorioInadimplenciaConsultor(
              { totalMes, abertos: abertosMes },
              boletos,
              consultor.nome,
              {
                title: `Relatório de Inadimplência dos Últimos 90 Dias - ${consultor.nome}`
              }
            );

            const pdfUrl = await gerarPdfRelatorio(payload);
            console.log(`   📄 PDF gerado para ${consultor.nome} (${boletos.length} boletos, resumo: ${abertosMes} abertos/${totalMes} mês)`);

            await enviarUrlWhatsApp(chatid, `RELATÓRIO DE INADIMPLÊNCIA DOS ÚLTIMOS 90 DIAS - ${consultor.nome}`, pdfUrl);
            console.log(`   ✅ WhatsApp enviado para ${consultor.nome}`);
          } catch (err) {
            console.error(`   ❌ Erro ao processar ${consultoresMap.get(idSga)?.nome || idSga}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`❌ Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n✅ [Cron] Sincronização diária concluída em ${duracao}s\n`);
  } catch (err) {
    console.error('❌ [Cron] Erro na sincronização diária:', err.message);
  }
}
