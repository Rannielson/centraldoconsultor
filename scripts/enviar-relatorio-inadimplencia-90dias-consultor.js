/**
 * Envia relatório de INADIMPLÊNCIA (boletos em aberto) dos últimos 90 dias (3 faixas)
 * de um consultor por WhatsApp. NÃO grava no banco - busca da API Hinova (listar/boleto-associado/periodo).
 *
 * Inadimplência = boletos. Produção = vendas/adesões (outro relatório).
 *
 * Uso: node scripts/enviar-relatorio-inadimplencia-90dias-consultor.js
 *      ID_CONSULTOR_SGA=2 CONTATO_DESTINO=5581992387425 node scripts/enviar-relatorio-inadimplencia-90dias-consultor.js
 *
 * Requer no .env: OPENPDF_API_KEY, CLEOIA_BOT_SEND_URL, DATABASE_URL
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import {
  obterPeriodos90Dias,
  buscarTodosBoletosPeriodo
} from '../src/services/sgaService.js';
import { montarPayloadRelatorio, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';
import { enviarUrlWhatsApp, normalizarChatId } from '../src/services/cleoiaService.js';

const ID_CONSULTOR_SGA = String(process.env.ID_CONSULTOR_SGA || '2');
const CONTATO_DESTINO = process.env.CONTATO_DESTINO || '5581992387425';
const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];

async function main() {
  console.log(
    `\n📋 Relatório de INADIMPLÊNCIA (90 dias) - consultor id_consultor_sga = ${ID_CONSULTOR_SGA}`
  );
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

  // 2. Buscar boletos em 3 faixas (0-30, 31-60, 61-90 dias)
  const periodos90 = obterPeriodos90Dias();
  console.log('\n📡 Buscando boletos na Hinova (3 faixas: 0-30, 31-60, 61-90 dias)...');

  const buscas = periodos90.map((p) =>
    buscarTodosBoletosPeriodo(token_bearer, urlBase, {
      codigo_situacao_boleto: '2',
      data_vencimento_inicial: p.data_inicial,
      data_vencimento_final: p.data_final
    })
  );
  const resultados = await Promise.all(buscas);

  // 3. Filtrar por codigo_voluntario e situacao_veiculo, ordenar por nome_associado A-Z
  const todosBoletos = resultados.flat();
  const boletos = [];
  for (const boleto of todosBoletos) {
      if (!boleto.veiculos || !boleto.veiculos.length) continue;
    for (const veiculo of boleto.veiculos) {
      if (String(veiculo.codigo_voluntario) !== ID_CONSULTOR_SGA) continue;
      if (!SITUACOES_ACEITAS.includes(veiculo.situacao_veiculo)) continue;
      boletos.push({
        nome_associado: boleto.nome_associado || '',
        celular: boleto.celular || '',
        data_vencimento: boleto.data_vencimento || null,
        valor_boleto: parseFloat(boleto.valor_boleto) || 0,
        placa_veiculo: veiculo.placa || '',
        nome_consultor: nomeConsultor || ''
      });
    }
  }

  boletos.sort((a, b) => {
    const nomeA = (a.nome_associado || '').toString().toLowerCase();
    const nomeB = (b.nome_associado || '').toString().toLowerCase();
    return nomeA.localeCompare(nomeB);
  });

  if (boletos.length === 0) {
    console.log('\n⚠️ Nenhum boleto encontrado para este consultor nos últimos 90 dias.');
    return;
  }

  console.log(`\n📄 ${boletos.length} boleto(s) no período (90 dias)`);

  // 4. Gerar PDF
  console.log('\n📄 Gerando PDF via OpenPDF...');
  const payload = montarPayloadRelatorio(boletos, nomeConsultor, {
    title: `Relatório de Inadimplência dos Últimos 90 Dias - ${nomeConsultor}`,
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
    `RELATÓRIO DE INADIMPLÊNCIA DOS ÚLTIMOS 90 DIAS - ${nomeConsultor}`,
    pdfUrl
  );

  console.log('✅ Relatório de inadimplência (90 dias) enviado com sucesso!\n');
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
