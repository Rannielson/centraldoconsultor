/**
 * Gera apenas os links_consultor para competência existente (boletos já no banco).
 * Usa APP_BASE_URL de produção para url_completa.
 * Uso: APP_BASE_URL=https://centraldoconsultor-production.up.railway.app node scripts/gerar-links-producao.js
 */
import 'dotenv/config';
import { gerarLinksParaCompetencia } from '../src/services/consultorLinksService.js';

const CLIENTE_PROSEG_ID = 'e0d6c78b-cbe1-4af3-8e3d-37503a70c2f9';
const COMPETENCIA = process.env.COMPETENCIA || '02/2026';

async function main() {
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.error('❌ Defina APP_BASE_URL (ex.: https://centraldoconsultor-production.up.railway.app)');
    process.exit(1);
  }
  console.log('Base URL:', baseUrl);
  console.log('Gerando links para competência', COMPETENCIA, '...\n');
  try {
    const links = await gerarLinksParaCompetencia(CLIENTE_PROSEG_ID, COMPETENCIA);
    console.log('✅ Links gerados:', links.length);
    links.slice(0, 3).forEach((l, i) => console.log(`   ${i + 1}. ${l.nome_consultor} -> ${l.url_curta}`));
    if (links.length > 3) console.log('   ...');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
