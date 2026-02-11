import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';

// Importar rotas
import clientesRoutes from './routes/clientes.js';
import consultoresRoutes from './routes/consultores.js';
import configuracoesRoutes from './routes/configuracoes.js';
import boletosRoutes from './routes/boletos.js';
import apiKeysRoutes from './routes/apikeys.js';

// Carregar variáveis de ambiente
dotenv.config();

// Criar instância do Fastify
const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'info' : 'error'
  }
});

// Registrar CORS
await fastify.register(cors, {
  origin: true, // Permitir todas as origens (ajuste em produção)
  credentials: true
});

// Health check endpoint (sem autenticação)
fastify.get('/', async (request, reply) => {
  return {
    status: 'online',
    service: 'API Central do Consultor',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  };
});

// Health check detalhado
fastify.get('/health', async (request, reply) => {
  try {
    const dbStatus = await testConnection();
    
    return {
      status: 'healthy',
      service: 'API Central do Consultor',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus ? 'connected' : 'disconnected'
      }
    };
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      service: 'API Central do Consultor',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'error'
      },
      error: error.message
    });
  }
});

// Registrar rotas da API
await fastify.register(clientesRoutes, { prefix: '/api/clientes' });
await fastify.register(consultoresRoutes, { prefix: '/api/consultores' });
await fastify.register(configuracoesRoutes, { prefix: '/api/configuracoes' });
await fastify.register(boletosRoutes, { prefix: '/api/boletos' });
await fastify.register(apiKeysRoutes, { prefix: '/api/auth/keys' });

// Handler de erros global
fastify.setErrorHandler((error, request, reply) => {
  // Log do erro
  fastify.log.error(error);
  
  // Erro de validação do Fastify
  if (error.validation) {
    return reply.code(400).send({
      error: 'Erro de validação',
      message: 'Dados inválidos na requisição',
      details: error.validation
    });
  }
  
  // Erro genérico
  const statusCode = error.statusCode || 500;
  
  return reply.code(statusCode).send({
    error: error.name || 'Erro interno',
    message: error.message || 'Ocorreu um erro inesperado',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Handler para rotas não encontradas
fastify.setNotFoundHandler((request, reply) => {
  return reply.code(404).send({
    error: 'Não encontrado',
    message: `Rota ${request.method} ${request.url} não encontrada`,
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /api/clientes',
      'GET /api/clientes',
      'GET /api/clientes/:id',
      'PUT /api/clientes/:id',
      'DELETE /api/clientes/:id',
      'POST /api/consultores',
      'GET /api/consultores',
      'GET /api/consultores/:id',
      'PUT /api/consultores/:id',
      'DELETE /api/consultores/:id',
      'POST /api/configuracoes',
      'GET /api/configuracoes',
      'GET /api/configuracoes/:cliente_id',
      'DELETE /api/configuracoes/:cliente_id',
      'POST /api/boletos/sincronizar',
      'GET /api/boletos',
      'GET /api/boletos/:id',
      'GET /api/boletos/consultor/:consultor_id/resumo',
      'POST /api/auth/keys',
      'GET /api/auth/keys',
      'GET /api/auth/keys/:id',
      'PATCH /api/auth/keys/:id/toggle',
      'PUT /api/auth/keys/:id',
      'DELETE /api/auth/keys/:id'
    ]
  });
});

// Função para iniciar o servidor
async function start() {
  try {
    const port = process.env.PORT || 3000;
    const host = '0.0.0.0'; // Permite acesso externo
    
    console.log('\n🚀 Iniciando API Central do Consultor...\n');
    
    // Testar conexão com banco de dados
    console.log('📊 Testando conexão com banco de dados...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ Falha ao conectar com banco de dados. Verifique as configurações.');
      process.exit(1);
    }
    
    // Iniciar servidor
    await fastify.listen({ port, host });
    
    console.log('\n✅ Servidor iniciado com sucesso!\n');
    console.log(`📍 URL: http://localhost:${port}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 Master API Key: ${process.env.MASTER_API_KEY}\n`);
    console.log('📚 Documentação das rotas disponível em: GET /\n');
    console.log('Para parar o servidor, pressione CTRL+C\n');
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];

signals.forEach(signal => {
  process.on(signal, async () => {
    console.log(`\n\n⚠️ Recebido sinal ${signal}. Encerrando servidor...`);
    
    try {
      await fastify.close();
      console.log('✅ Servidor encerrado com sucesso');
      process.exit(0);
    } catch (error) {
      console.error('❌ Erro ao encerrar servidor:', error);
      process.exit(1);
    }
  });
});

// Iniciar servidor
start();

export default fastify;
