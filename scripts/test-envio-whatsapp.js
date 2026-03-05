/**
 * Teste de envio de PDF por WhatsApp para o contato 5581992387425.
 * Uso: node scripts/test-envio-whatsapp.js
 *
 * Requer: CLEOIA_BOT_SEND_URL no .env
 * Opcional: OPENPDF_API_KEY para gerar PDF real (senão usa PDF público de teste)
 */
import 'dotenv/config';
import { enviarUrlWhatsApp } from '../src/services/cleoiaService.js';
import { gerarPdfRelatorio, montarPayloadRelatorio } from '../src/services/relatorioPdfService.js';

const CONTATO_TESTE = '5581992387425';
// PDF público válido (fallback se OpenPDF não configurado)
const PDF_PUBLICO_TESTE = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

async function main() {
  console.log('📱 Teste de envio WhatsApp - contato', CONTATO_TESTE);
  console.log('');

  let pdfUrl;

  if (process.env.OPENPDF_API_KEY) {
    try {
      console.log('📄 Gerando PDF via OpenPDF...');
      const payload = montarPayloadRelatorio(
        [
          { nome_associado: 'Teste', celular: '81992387425', data_vencimento: new Date(), valor_boleto: 100, placa_veiculo: 'ABC1D23', nome_consultor: 'Consultor Teste' }
        ],
        'Consultor Teste',
        { title: 'Teste de Envio - Central do Consultor' }
      );
      pdfUrl = await gerarPdfRelatorio(payload);
      console.log('✅ PDF gerado:', pdfUrl);
    } catch (err) {
      console.warn('⚠️ OpenPDF falhou, usando PDF público:', err.message);
      pdfUrl = PDF_PUBLICO_TESTE;
    }
  } else {
    console.log('⚠️ OPENPDF_API_KEY não definida - usando PDF público');
    pdfUrl = PDF_PUBLICO_TESTE;
  }

  console.log('');
  console.log('📤 Enviando para WhatsApp via Cleoia...');

  const resultado = await enviarUrlWhatsApp(
    CONTATO_TESTE,
    'RELATÓRIO - Teste Central do Consultor',
    pdfUrl
  );

  console.log('✅ Envio concluído!');
  console.log('Resposta:', JSON.stringify(resultado, null, 2));
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
