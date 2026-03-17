/**
 * Gera PDF do relatório de produção consolidado (ranking mensal) sem enviar WhatsApp.
 * Uso: node scripts/test-relatorio-producao-consolidado.js
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { obterPeriodoMesAteHoje, buscarVeiculosProducao } from '../src/services/sgaService.js';
import { montarPayloadRelatorioProducaoRanking, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';

function fmt(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

async function main() {
  const hoje = new Date();
  const hojeFormatado = fmt(hoje);
  const { data_inicial: mesIni, data_final: mesFim } = obterPeriodoMesAteHoje();

  console.log(`Período: ${mesIni} a ${mesFim}\n`);

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

    const veiculos = await buscarVeiculosProducao(cliente.token_bearer, urlBase, {
      dataInicial: mesIni,
      dataFinal: mesFim
    });

    console.log(`${veiculos.length} adesões no mês\n`);

    const payload = montarPayloadRelatorioProducaoRanking(
      veiculos,
      consultoresMap,
      hojeFormatado,
      {
        title: `Relatório de Produção - Ranking Mensal - ${cliente.nome}`,
        subtitle: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      }
    );

    const pdfUrl = await gerarPdfRelatorio(payload);
    console.log('✅ PDF Ranking Produção:', pdfUrl);
  }

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
