/**
 * Cria o template "Relatório de Produção Sintético (Agrupado por Dia) - Proseg" no OpenPDF.
 * Uso: node scripts/criar-template-producao-sintetico.js
 *
 * Requer: OPENPDF_API_KEY no .env
 */
import 'dotenv/config';
import axios from 'axios';

const OPENPDF_BASE = process.env.OPENPDF_BASE_URL || 'http://openpdf.atomos.tech';
const TEMPLATE = {
  id: 'relatorio-producao-sintetico-proseg',
  name: 'Relatório de Produção Sintético (Agrupado por Dia) - Proseg',
  paperSize: 'A4',
  orientation: 'landscape',
  columnsCount: 3,
  columnsDefinition: {
    '0': { label: 'Data Contrato', type: 'text' },
    '1': { label: 'Quantidade', type: 'number' },
    '2': { label: 'Consultor', type: 'text' }
  }
};

async function main() {
  const apiKey = process.env.OPENPDF_API_KEY;
  if (!apiKey) {
    console.error('OPENPDF_API_KEY não definida no .env');
    process.exit(1);
  }

  const base = OPENPDF_BASE.replace(/\/$/, '');
  const putUrl = `${base}/v1/templates/${TEMPLATE.id}`;
  const postUrl = `${base}/v1/templates`;

  // Tentar PUT para atualizar (template pode já existir)
  console.log('PUT', putUrl);
  const putRes = await axios.put(putUrl, TEMPLATE, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 10000,
    validateStatus: () => true
  });

  if (putRes.status >= 200 && putRes.status < 300) {
    console.log('Template atualizado com sucesso:', TEMPLATE.id);
    return;
  }

  // Se 404 ou 400 (record not found), criar via POST
  if (putRes.status === 404 || putRes.status === 400) {
    console.log('Template não existe. Criando via POST...');
    const postRes = await axios.post(postUrl, TEMPLATE, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      timeout: 10000,
      validateStatus: () => true
    });
    if (postRes.status >= 200 && postRes.status < 300) {
      console.log('Template criado com sucesso:', TEMPLATE.id);
      return;
    }
    console.error('Erro ao criar template:', postRes.status, postRes.data);
    process.exit(1);
  }

  console.error('Erro ao atualizar template:', putRes.status, putRes.data);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
