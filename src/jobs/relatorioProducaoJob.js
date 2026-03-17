import { query } from '../config/database.js';
import {
  obterPeriodoMesAteHoje,
  buscarVeiculosProducao
} from '../services/sgaService.js';
import {
  montarPayloadRelatorioVendasConsultor,
  gerarPdfRelatorio
} from '../services/relatorioPdfService.js';
import { enviarUrlWhatsApp, normalizarChatId } from '../services/cleoiaService.js';

const DELAY_ENTRE_ENVIOS_MS = Number(process.env.RELATORIO_PRODUCAO_DELAY_MS) || 3000;

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
 * Extrai data ISO (YYYY-MM-DD) de data_contrato
 */
function extrairDataIso(value) {
  if (!value) return '';
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

/**
 * Executa o relatório de vendas individual para cada consultor.
 * Resumo: vendas do dia, do mês e do ano.
 * Roda à noite via node-cron (America/Sao_Paulo).
 */
export async function executarRelatorioProducao() {
  const inicio = new Date();
  console.log(
    `\n[Cron Noite] Relatorio de vendas (consultores) iniciado em ${inicio.toISOString()}`
  );

  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  // Periodo do mes atual (1o dia ate hoje)
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAteHoje();

  // Periodo do ano (1o de janeiro ate hoje)
  const anoIni = formatarData(new Date(hoje.getFullYear(), 0, 1));
  const anoFim = formatarData(hoje);

  try {
    const clientesResult = await query(
      'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
    );
    const clientes = clientesResult.rows;

    if (clientes.length === 0) {
      console.log('[Cron Noite] Nenhum cliente ativo');
      return;
    }

    console.log(
      `${clientes.length} cliente(s) | Mes: ${mesIni} a ${mesFim} | Ano: ${anoIni} a ${anoFim}\n`
    );

    for (const cliente of clientes) {
      try {
        const consultoresResult = await query(
          'SELECT id_consultor_sga, nome, contato FROM consultores WHERE cliente_id = $1 AND ativo = true',
          [cliente.id]
        );

        const consultoresComContato = new Map();
        consultoresResult.rows.forEach((c) => {
          if (c.contato) {
            consultoresComContato.set(String(c.id_consultor_sga), {
              nome: c.nome || '',
              contato: c.contato
            });
          }
        });

        if (consultoresComContato.size === 0) {
          console.log(`   ${cliente.nome}: sem consultores com contato`);
          continue;
        }

        const urlBase = (cliente.url_base_api || '').replace(/^["']|["']$/g, '').trim();
        if (!urlBase || !urlBase.startsWith('http')) {
          console.error(`   ${cliente.nome}: url_base_api invalida — pulando`);
          continue;
        }

        // Buscar veiculos (adesoes) do mes e do ano
        const [veiculosMes, veiculosAno] = await Promise.all([
          buscarVeiculosProducao(cliente.token_bearer, urlBase, {
            dataInicial: mesIni,
            dataFinal: mesFim
          }),
          buscarVeiculosProducao(cliente.token_bearer, urlBase, {
            dataInicial: anoIni,
            dataFinal: anoFim
          })
        ]);

        console.log(
          `   ${cliente.nome}: ${veiculosMes.length} adesoes no mes, ${veiculosAno.length} no ano`
        );

        // Envio individual por consultor
        let primeiroEnvio = true;
        for (const [idSga, info] of consultoresComContato) {
          const chatid = normalizarChatId(info.contato);
          if (!chatid) {
            console.log(`   ${info.nome} sem contato valido - pulando`);
            continue;
          }

          // Contar vendas do dia, mes e ano para este consultor
          const vendasMes = veiculosMes.filter(
            (v) => String(v.codigo_voluntario) === idSga
          );
          const vendasDia = vendasMes.filter(
            (v) => extrairDataIso(v.data_contrato) === hojeIso
          );
          const vendasAno = veiculosAno.filter(
            (v) => String(v.codigo_voluntario) === idSga
          );

          try {
            if (!primeiroEnvio) {
              await new Promise((r) => setTimeout(r, DELAY_ENTRE_ENVIOS_MS));
            }
            primeiroEnvio = false;

            const payload = montarPayloadRelatorioVendasConsultor(
              {
                vendasDia: vendasDia.length,
                vendasMes: vendasMes.length,
                vendasAno: vendasAno.length
              },
              info.nome,
              {
                title: `Relatorio de Vendas - ${info.nome}`,
                subtitle: hoje.toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })
              }
            );

            const pdfUrl = await gerarPdfRelatorio(payload);
            await enviarUrlWhatsApp(
              chatid,
              `Vendas: ${vendasDia.length} hoje | ${vendasMes.length} no mes | ${vendasAno.length} no ano`,
              pdfUrl
            );
            console.log(
              `   ${info.nome}: dia=${vendasDia.length} mes=${vendasMes.length} ano=${vendasAno.length} — enviado`
            );
          } catch (err) {
            console.error(`   ${info.nome}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`Erro no cliente ${cliente.nome}:`, err.message);
      }
    }

    const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
    console.log(`\n[Cron Noite] Relatorio de vendas concluido em ${duracao}s\n`);
  } catch (err) {
    console.error('[Cron Noite] Erro no relatorio de vendas:', err.message);
  }
}
