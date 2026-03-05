/**
 * Envia relatório real de um consultor por WhatsApp.
 * NÃO grava no banco - apenas busca da API Hinova, monta o payload e envia.
 *
 * 1. Busca consultor e credenciais do cliente (leitura DB)
 * 2. Chama API Hinova - boletos do mês até hoje
 * 3. Filtra por codigo_voluntario e situacao_veiculo (ATIVO/INADIMPLENTE)
 * 4. Monta payload PDF e gera via OpenPDF
 * 5. Envia para WhatsApp
 *
 * Uso: node scripts/enviar-relatorio-consultor.js
 *      ID_CONSULTOR_SGA=2 node scripts/enviar-relatorio-consultor.js
 *      CONTATO_DESTINO=5581992387425 node scripts/enviar-relatorio-consultor.js
 *
 * Requer no .env: OPENPDF_API_KEY, CLEOIA_BOT_SEND_URL, DATABASE_URL
 */
import 'dotenv/config';
import { query } from '../src/config/database.js';
import { obterPeriodoMesAteHoje, buscarTodosBoletosPeriodo } from '../src/services/sgaService.js';
import { montarPayloadRelatorio, gerarPdfRelatorio } from '../src/services/relatorioPdfService.js';
import { enviarUrlWhatsApp } from '../src/services/cleoiaService.js';

const ID_CONSULTOR_SGA = String(process.env.ID_CONSULTOR_SGA || '2');
const CONTATO_DESTINO = process.env.CONTATO_DESTINO || '5581992387425';
const SITUACOES_ACEITAS = ['ATIVO', 'INADIMPLENTE'];

async function main() {
  console.log(`\n📋 Relatório do consultor id_consultor_sga = ${ID_CONSULTOR_SGA}`);
  console.log(`📱 Destino: ${CONTATO_DESTINO}\n`);

  // 1. Encontrar consultor e credenciais do cliente (somente leitura)
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
  console.log(`✅ Consultor: ${nomeConsultor}`);

  // 2. Buscar boletos na API Hinova (mês até hoje) - SEM gravar no banco
  const { data_inicial, data_final } = obterPeriodoMesAteHoje();
  console.log(`\n📡 Buscando boletos na Hinova (${data_inicial} a ${data_final})...`);

  const boletosApi = await buscarTodosBoletosPeriodo(token_bearer, url_base_api, {
    codigo_situacao_boleto: '2',
    data_vencimento_inicial: data_inicial,
    data_vencimento_final: data_final
  });

  // 3. Filtrar por codigo_voluntario e situacao_veiculo
  const boletos = [];
  for (const boleto of boletosApi) {
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

  if (boletos.length === 0) {
    console.log('\n⚠️ Nenhum boleto encontrado para este consultor no período.');
    console.log(`   Período: ${data_inicial} a ${data_final}`);
    return;
  }

  console.log(`\n📄 ${boletos.length} boleto(s) no período (${data_inicial} a ${data_final})`);

  // 4. Gerar PDF
  console.log('\n📄 Gerando PDF via OpenPDF...');
  const payload = montarPayloadRelatorio(boletos, nomeConsultor, {
    subtitle: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  });
  const pdfUrl = await gerarPdfRelatorio(payload);
  console.log('✅ PDF gerado:', pdfUrl);

  // 5. Enviar por WhatsApp
  console.log('\n📤 Enviando para WhatsApp...');
  await enviarUrlWhatsApp(
    CONTATO_DESTINO,
    `RELATÓRIO DE BOLETOS EM ABERTOS (INADIMPLÊNCIA) - ${nomeConsultor}`,
    pdfUrl
  );

  console.log('✅ Relatório enviado com sucesso!\n');
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
