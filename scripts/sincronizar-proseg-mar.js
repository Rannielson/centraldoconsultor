/**
 * Script para sincronizar boletos do cliente Proseg - Março 2026
 * Uso: node scripts/sincronizar-proseg-mar.js
 */
import 'dotenv/config';
import { sincronizarBoletos } from '../src/services/boletoService.js';

const CLIENTE_PROSEG_ID = 'e0d6c78b-cbe1-4af3-8e3d-37503a70c2f9';
const DATA_INICIAL = '01/03/2026';
const DATA_FINAL = '31/03/2026';

async function main() {
  console.log('Iniciando sincronização Proseg - Março 2026...\n');
  try {
    const stats = await sincronizarBoletos(CLIENTE_PROSEG_ID, DATA_INICIAL, DATA_FINAL, '2');
    console.log('\nResultado:', JSON.stringify(stats, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
}

main();
