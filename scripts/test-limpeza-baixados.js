/**
 * Testa a limpeza de boletos baixados (sem cron).
 * Uso: node scripts/test-limpeza-baixados.js
 */
import 'dotenv/config';
import { executarLimpezaBoletosBaixados } from '../src/jobs/limpezaBoletosBaixadosJob.js';

executarLimpezaBoletosBaixados()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Erro:', err.message); process.exit(1); });
