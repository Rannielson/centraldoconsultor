/**
 * Gera PDF do relatório de vendas de um consultor (sem enviar WhatsApp).
 * Uso: ID_CONSULTOR_SGA=2 node scripts/test-relatorio-vendas-consultor.js
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { obterPeriodoMesAteHoje, buscarVeiculosProducao } from '../src/services/sgaService.js';
import { montarPayloadRelatorioVendasConsultor, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';

const ID = String(process.env.ID_CONSULTOR_SGA || '2');

function fmt(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function extrairDataIso(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

async function main() {
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAteHoje();
  const anoIni = fmt(new Date(hoje.getFullYear(), 0, 1));
  const anoFim = fmt(hoje);

  const c = await query(
    `SELECT c.nome, cl.token_bearer, cl.url_base_api FROM consultores c
     INNER JOIN clientes cl ON cl.id = c.cliente_id AND cl.ativo = true
     WHERE c.id_consultor_sga = $1 AND c.ativo = true`,
    [ID]
  );
  if (!c.rows.length) { console.error('Consultor não encontrado'); process.exit(1); }

  const { nome, token_bearer, url_base_api } = c.rows[0];
  const urlBase = (url_base_api || '').replace(/^["']|["']$/g, '').trim();

  console.log(`Consultor: ${nome}`);
  console.log(`Mês: ${mesIni} a ${mesFim} | Ano: ${anoIni} a ${anoFim}`);

  const [vMes, vAno] = await Promise.all([
    buscarVeiculosProducao(token_bearer, urlBase, { dataInicial: mesIni, dataFinal: mesFim }),
    buscarVeiculosProducao(token_bearer, urlBase, { dataInicial: anoIni, dataFinal: anoFim })
  ]);

  const vendasMes = vMes.filter(v => String(v.codigo_voluntario) === ID);
  const vendasDia = vendasMes.filter(v => extrairDataIso(v.data_contrato) === hojeIso);
  const vendasAno = vAno.filter(v => String(v.codigo_voluntario) === ID);

  console.log(`Vendas: dia=${vendasDia.length} | mês=${vendasMes.length} | ano=${vendasAno.length}`);

  const payload = montarPayloadRelatorioVendasConsultor(
    { vendasDia: vendasDia.length, vendasMes: vendasMes.length, vendasAno: vendasAno.length },
    nome
  );

  console.log('\nPayload:', JSON.stringify(payload, null, 2));
  const pdfUrl = await gerarPdfRelatorio(payload);
  console.log('\n✅ PDF:', pdfUrl);
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
