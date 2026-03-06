/**
 * Envia relatório de PRODUÇÃO (vendas/adesões) dos últimos 90 dias (3 faixas)
 * de um consultor por WhatsApp. NÃO grava no banco - busca da API Hinova (listar/veiculo).
 *
 * Produção = vendas/adesões. Inadimplência = boletos (outro relatório).
 *
 * Uso: node scripts/enviar-relatorio-producao-consultor.js
 *      ID_CONSULTOR_SGA=2 CONTATO_DESTINO=5581992387425 node scripts/enviar-relatorio-producao-consultor.js
 *
 * Requer no .env: OPENPDF_API_KEY, CLEOIA_BOT_SEND_URL, DATABASE_URL
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import {
  obterPeriodos90Dias,
  buscarVeiculosProducao
} from '../src/services/sgaService.js';
import {
  montarPayloadRelatorioProducao,
  gerarPdfRelatorio
} from '../src/services/relatorioPdfService.js';
import { enviarUrlWhatsApp, normalizarChatId } from '../src/services/cleoiaService.js';

const ID_CONSULTOR_SGA = String(process.env.ID_CONSULTOR_SGA || '2');
const CONTATO_DESTINO = process.env.CONTATO_DESTINO || '5581992387425';

async function main() {
  console.log(`\n📋 Relatório de PRODUÇÃO (90 dias) - consultor id_consultor_sga = ${ID_CONSULTOR_SGA}`);
  console.log(`📱 Destino: ${CONTATO_DESTINO}\n`);

  // 1. Encontrar consultor e credenciais do cliente
  const consultorResult = await query(
    `SELECT c.nome, cl.token_bearer, cl.url_base_api
     FROM consultores c
     INNER JOIN clientes cl ON cl.id = c.cliente_id AND cl.ativo = true
     WHERE c.id_consultor_sga = $1 AND c.ativo = true`,
    [ID_CONSULTOR_SGA]
  );

  if (consultorResult.rows.length === 0) {
    throw new Error(`Consultor com id_consultor_sga = ${ID_CONSULTOR_SGA} não encontrado ou inativo`);
  }

  const { nome: nomeConsultor, token_bearer, url_base_api } = consultorResult.rows[0];
  const urlBase = (url_base_api || '').replace(/^["']|["']$/g, '').trim();
  if (!urlBase || !urlBase.startsWith('http')) {
    throw new Error('url_base_api do cliente inválida ou ausente');
  }

  console.log(`✅ Consultor: ${nomeConsultor}`);

  // 2. Buscar veículos em 3 faixas (0-30, 31-60, 61-90 dias)
  const periodos90 = obterPeriodos90Dias();
  console.log('\n📡 Buscando adesões na Hinova (3 faixas: 0-30, 31-60, 61-90 dias)...');

  const buscas = periodos90.map((p) =>
    buscarVeiculosProducao(token_bearer, urlBase, {
      dataInicial: p.data_inicial,
      dataFinal: p.data_final
    }).then((v) => v.map((veic) => ({ ...veic, faixa: p.faixa })))
  );
  const resultados = await Promise.all(buscas);
  const todosVeiculos = resultados.flat();

  // 3. Filtrar pelo consultor
  const veiculosConsultor = todosVeiculos.filter(
    (v) => String(v.codigo_voluntario) === ID_CONSULTOR_SGA
  );

  if (veiculosConsultor.length === 0) {
    console.log('\n⚠️ Nenhuma adesão encontrada para este consultor nos últimos 90 dias.');
    return;
  }

  console.log(`\n📄 ${veiculosConsultor.length} adesão(ões) no período (90 dias)`);

  // 4. Gerar PDF
  const consultoresMap = new Map([[ID_CONSULTOR_SGA, nomeConsultor]]);
  console.log('\n📄 Gerando PDF via OpenPDF...');
  const payload = montarPayloadRelatorioProducao(veiculosConsultor, consultoresMap, {
    title: `Sua Produção - ${nomeConsultor}`,
    subtitle: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  });
  const pdfUrl = await gerarPdfRelatorio(payload);
  console.log('✅ PDF gerado:', pdfUrl);

  // 5. Enviar por WhatsApp
  const chatid = normalizarChatId(CONTATO_DESTINO);
  if (!chatid) {
    throw new Error(`Contato destino inválido: ${CONTATO_DESTINO}`);
  }
  console.log('\n📤 Enviando para WhatsApp...');
  await enviarUrlWhatsApp(
    chatid,
    `Sua produção (${veiculosConsultor.length} adesões nos últimos 90 dias)`,
    pdfUrl
  );

  console.log('✅ Relatório de produção enviado com sucesso!\n');
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
