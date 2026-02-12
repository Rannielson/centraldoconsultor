import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não está definida. Crie um arquivo .env a partir do .env.example e configure a URL do banco.');
}

// Configuração do pool de conexões
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Evento de erro no pool
pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexões:', err);
});

// Função para testar a conexão
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Conexão com banco de dados estabelecida:', result.rows[0].now);
    return true;
  } catch (error) {
    const msg = error.message || error.code || String(error);
    console.error('❌ Erro ao conectar com banco de dados:', msg);
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL) {
      console.error('   Dica: crie o arquivo .env com DATABASE_URL (copie de .env.example).');
    }
    return false;
  }
}

// Função para executar queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Query executada:', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('Erro na query:', { text, error: error.message });
    throw error;
  }
}

// Função para obter um cliente do pool (para transações)
export async function getClient() {
  const client = await pool.connect();
  
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Timeout para liberar o cliente
  const timeout = setTimeout(() => {
    console.error('Cliente não foi liberado após 5 segundos!');
  }, 5000);
  
  // Override do release para limpar o timeout
  client.release = () => {
    clearTimeout(timeout);
    client.release = release;
    return release();
  };
  
  return client;
}

// Função para executar transações
export async function transaction(callback) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Função para encerrar o pool (útil para testes)
export async function closePool() {
  await pool.end();
  console.log('Pool de conexões encerrado');
}

export default {
  query,
  getClient,
  transaction,
  testConnection,
  closePool,
  pool
};
