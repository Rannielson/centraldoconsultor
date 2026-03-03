/**
 * Verifica conectividade com o banco Supabase (DATABASE_URL do .env).
 * Uso: node scripts/verificar-banco.js
 */
import 'dotenv/config';
import { testConnection } from '../src/config/database.js';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida no .env');
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL);
  console.log('Verificando conexão com:', url.hostname, '...');
  const ok = await testConnection();
  process.exit(ok ? 0 : 1);
}

main();
