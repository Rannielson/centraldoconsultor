import { query } from '../config/database.js';
import { obterPeriodoMesAteHoje, buscarTodosBoletosPeriodo } from '../services/sgaService.js';
import { montarPayloadRelatorio, gerarPdfRelatorio } from '../services/relatorioPdfService.js';
import { normalizarChatId, enviarUrlWhatsApp } from '../services/cleoiaService.js';

const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];
const DELAY_ENTRE_ENVIOS_MS = 59000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa o job diário: busca boletos na Hinova (sem gravar no banco),
 * gera PDF individual por consultor e envia por WhatsApp com delay de 59s entre envios.
 * Roda às 9h10 via node-cron.
 */
export async function executarSincronizacaoDiaria() {
  const inicio = new Date();
  console.log(`\n🕐 [Cron] Iniciando sincronização diária em ${inicio.toISOString()}`);

  const { data_inicial, data_final } = obterPeriodoMesAteHoje();

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
    console.log(`📅 Período: ${data_inicial} a ${data_final}\n`);

    let primeiroEnvio = true;

    for (const cliente of clientes) {
      try {
        console.log(`--- Cliente: ${cliente.nome} ---`);

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

        const boletosApi = await buscarTodosBoletosPeriodo(
          cliente.token_bearer,
          cliente.url_base_api,
          {
            codigo_situacao_boleto: '2',
            data_vencimento_inicial: data_inicial,
            data_vencimento_final: data_final
          }
        );

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

        const consultoresComBoletos = [...porConsultor.entries()].sort((a, b) =>
          (consultoresMap.get(a[0])?.nome || '').localeCompare(consultoresMap.get(b[0])?.nome || '')
        );

        for (const [idSga, boletos] of consultoresComBoletos) {
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

            const payload = montarPayloadRelatorio(boletos, consultor.nome, {
              subtitle: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            });

            const pdfUrl = await gerarPdfRelatorio(payload);
            console.log(`   📄 PDF gerado para ${consultor.nome} (${boletos.length} boletos)`);

            await enviarUrlWhatsApp(chatid, `RELATÓRIO DE BOLETOS EM ABERTOS (INADIMPLÊNCIA) - ${consultor.nome}`, pdfUrl);
            console.log(`   ✅ WhatsApp enviado para ${consultor.nome}`);
          } catch (err) {
            console.error(`   ❌ Erro ao processar ${consultor?.nome || idSga}:`, err.message);
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
