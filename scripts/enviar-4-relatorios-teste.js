/**
 * Envia os 3 relatórios restantes (consolidado, ranking produção, vendas consultor) para um número.
 * O de inadimplência consultor já foi enviado separadamente.
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { obterPeriodoMesAtual, obterPeriodoMesAteHoje, buscarTodosBoletosPeriodo, buscarVeiculosProducao } from '../src/services/sgaService.js';
import { montarPayloadRelatorioConsolidado, montarPayloadRelatorioProducaoRanking, montarPayloadRelatorioVendasConsultor, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';
import { enviarUrlWhatsApp } from '../src/services/cleoiaService.js';

const DESTINO = '5581992387425';
const ID_CONSULTOR = '2';
const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];

function fmt(d) {
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}
function extrairDataIso(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

async function main() {
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
  const { data_inicial: mesIniFull, data_final: mesFimFull } = obterPeriodoMesAtual();
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAteHoje();

  const c = await query('SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true');
  const cliente = c.rows[0];
  const urlBase = (cliente.url_base_api || '').replace(/^["']|["']$/g, '').trim();

  const consultoresResult = await query(
    'SELECT id_consultor_sga, nome FROM consultores WHERE cliente_id = $1 AND ativo = true', [cliente.id]
  );
  const consultoresMap = new Map();
  consultoresResult.rows.forEach(c => consultoresMap.set(String(c.id_consultor_sga), c.nome || ''));

  // ===== 2/4 CONSOLIDADO INADIMPLÊNCIA (GESTÃO) =====
  console.log('\n===== 2/4 CONSOLIDADO INADIMPLÊNCIA =====');
  const [boletosAbertos, boletosBaixados] = await Promise.all([
    buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
      codigo_situacao_boleto: '2', data_vencimento_inicial: mesIniFull, data_vencimento_final: mesFimFull
    }),
    buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
      codigo_situacao_boleto: '1', data_vencimento_inicial: mesIniFull, data_vencimento_final: mesFimFull
    })
  ]);

  const porAbertos = new Map();
  const porBaixados = new Map();
  for (const b of boletosAbertos) {
    if (!b.veiculos?.length) continue;
    for (const v of b.veiculos) {
      if (!SITUACOES_ACEITAS.includes(v.situacao_veiculo)) continue;
      const id = String(v.codigo_voluntario);
      if (!consultoresMap.has(id)) continue;
      porAbertos.set(id, (porAbertos.get(id)||0)+1);
    }
  }
  for (const b of boletosBaixados) {
    if (!b.veiculos?.length) continue;
    for (const v of b.veiculos) {
      if (!SITUACOES_ACEITAS.includes(v.situacao_veiculo)) continue;
      const id = String(v.codigo_voluntario);
      if (!consultoresMap.has(id)) continue;
      porBaixados.set(id, (porBaixados.get(id)||0)+1);
    }
  }
  const todosIds = new Set([...porAbertos.keys(), ...porBaixados.keys()]);
  const linhas = [...todosIds].map(id => {
    const a = porAbertos.get(id)||0, b = porBaixados.get(id)||0;
    return { consultor: consultoresMap.get(id)||id, abertos: a, baixados: b, total: a+b };
  }).filter(l => l.total > 0).sort((a,b) => b.abertos - a.abertos);

  const payloadCons = montarPayloadRelatorioConsolidado(linhas, {
    title: `Relatório consolidado de boletos em abertos - ${cliente.nome}`,
    subtitle: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  });
  const pdfCons = await gerarPdfRelatorio(payloadCons);
  await enviarUrlWhatsApp(DESTINO, `RELATÓRIO CONSOLIDADO DE BOLETOS EM ABERTOS - PROSEG`, pdfCons);
  console.log('✅ Consolidado enviado:', pdfCons);

  // ===== 3/4 RANKING PRODUÇÃO (GESTÃO) =====
  console.log('\n===== 3/4 RANKING PRODUÇÃO =====');
  const veiculos = await buscarVeiculosProducao(cliente.token_bearer, urlBase, {
    dataInicial: mesIni, dataFinal: mesFim
  });
  const payloadRank = montarPayloadRelatorioProducaoRanking(veiculos, consultoresMap, fmt(hoje), {
    title: `Relatório de Produção - Ranking Mensal - ${cliente.nome}`,
    subtitle: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  });
  const pdfRank = await gerarPdfRelatorio(payloadRank);
  await enviarUrlWhatsApp(DESTINO, `RELATÓRIO DE PRODUÇÃO - RANKING MENSAL - PROSEG`, pdfRank);
  console.log('✅ Ranking enviado:', pdfRank);

  // ===== 4/4 VENDAS CONSULTOR ID 2 =====
  console.log('\n===== 4/4 VENDAS CONSULTOR =====');
  const anoIni = fmt(new Date(hoje.getFullYear(), 0, 1));
  const anoFim = fmt(hoje);
  const [vMes, vAno] = await Promise.all([
    buscarVeiculosProducao(cliente.token_bearer, urlBase, { dataInicial: mesIni, dataFinal: mesFim }),
    buscarVeiculosProducao(cliente.token_bearer, urlBase, { dataInicial: anoIni, dataFinal: anoFim })
  ]);
  const nomeConsultor = consultoresMap.get(ID_CONSULTOR) || 'Consultor';
  const vendasMes = vMes.filter(v => String(v.codigo_voluntario) === ID_CONSULTOR);
  const vendasDia = vendasMes.filter(v => extrairDataIso(v.data_contrato) === hojeIso);
  const vendasAno = vAno.filter(v => String(v.codigo_voluntario) === ID_CONSULTOR);

  const payloadVendas = montarPayloadRelatorioVendasConsultor(
    { vendasDia: vendasDia.length, vendasMes: vendasMes.length, vendasAno: vendasAno.length },
    nomeConsultor
  );
  const pdfVendas = await gerarPdfRelatorio(payloadVendas);
  await enviarUrlWhatsApp(DESTINO, `Vendas: ${vendasDia.length} hoje | ${vendasMes.length} no mês | ${vendasAno.length} no ano`, pdfVendas);
  console.log('✅ Vendas enviado:', pdfVendas);

  console.log('\n✅ Todos os 4 relatórios enviados para', DESTINO);
  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
