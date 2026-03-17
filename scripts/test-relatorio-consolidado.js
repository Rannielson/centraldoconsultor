/**
 * Gera PDF do relatório consolidado (gestão) sem enviar WhatsApp.
 * Uso: node scripts/test-relatorio-consolidado.js
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { obterPeriodoMesAtual, buscarTodosBoletosPeriodo } from '../src/services/sgaService.js';
import { montarPayloadRelatorioConsolidado, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';

const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];

async function main() {
  const { data_inicial, data_final } = obterPeriodoMesAtual();
  console.log(`Período: ${data_inicial} a ${data_final}\n`);

  const clientesResult = await query(
    'SELECT id, nome, token_bearer, url_base_api FROM clientes WHERE ativo = true'
  );
  const clientes = clientesResult.rows;
  if (!clientes.length) { console.log('Nenhum cliente ativo'); return; }

  for (const cliente of clientes) {
    const urlBase = (cliente.url_base_api || '').replace(/^["']|["']$/g, '').trim();
    if (!urlBase || !urlBase.startsWith('http')) continue;

    const consultoresResult = await query(
      'SELECT id_consultor_sga, nome FROM consultores WHERE cliente_id = $1 AND ativo = true',
      [cliente.id]
    );
    const consultoresMap = new Map();
    consultoresResult.rows.forEach(c => consultoresMap.set(String(c.id_consultor_sga), c.nome || ''));

    if (!consultoresMap.size) continue;

    console.log(`${cliente.nome}: ${consultoresMap.size} consultores`);

    const [boletosAbertos, boletosBaixados] = await Promise.all([
      buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
        codigo_situacao_boleto: '2', data_vencimento_inicial: data_inicial, data_vencimento_final: data_final
      }),
      buscarTodosBoletosPeriodo(cliente.token_bearer, urlBase, {
        codigo_situacao_boleto: '1', data_vencimento_inicial: data_inicial, data_vencimento_final: data_final
      })
    ]);

    const porConsultorAbertos = new Map();
    const porConsultorBaixados = new Map();

    for (const boleto of boletosAbertos) {
      if (!boleto.veiculos?.length) continue;
      for (const v of boleto.veiculos) {
        if (!SITUACOES_ACEITAS.includes(v.situacao_veiculo)) continue;
        const id = String(v.codigo_voluntario);
        if (!consultoresMap.has(id)) continue;
        porConsultorAbertos.set(id, (porConsultorAbertos.get(id) || 0) + 1);
      }
    }

    for (const boleto of boletosBaixados) {
      if (!boleto.veiculos?.length) continue;
      for (const v of boleto.veiculos) {
        if (!SITUACOES_ACEITAS.includes(v.situacao_veiculo)) continue;
        const id = String(v.codigo_voluntario);
        if (!consultoresMap.has(id)) continue;
        porConsultorBaixados.set(id, (porConsultorBaixados.get(id) || 0) + 1);
      }
    }

    const todosIds = new Set([...porConsultorAbertos.keys(), ...porConsultorBaixados.keys()]);
    const linhas = [...todosIds]
      .map(id => {
        const abertos = porConsultorAbertos.get(id) || 0;
        const baixados = porConsultorBaixados.get(id) || 0;
        return { consultor: consultoresMap.get(id) || id, abertos, baixados, total: abertos + baixados };
      })
      .filter(l => l.total > 0)
      .sort((a, b) => b.abertos - a.abertos);

    const totalAbertos = linhas.reduce((s, l) => s + l.abertos, 0);
    const totalGeral = linhas.reduce((s, l) => s + l.total, 0);

    console.log(`${linhas.length} consultores com boletos | ${totalAbertos} abertos de ${totalGeral} total\n`);

    const payload = montarPayloadRelatorioConsolidado(linhas, {
      title: `Relatório consolidado de boletos em abertos - ${cliente.nome}`,
      subtitle: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    });

    const pdfUrl = await gerarPdfRelatorio(payload);
    console.log('✅ PDF Consolidado:', pdfUrl);
  }

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
