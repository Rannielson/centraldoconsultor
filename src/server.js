import Fastify from 'fastify';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { testConnection } from './config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// Importar rotas
import clientesRoutes from './routes/clientes.js';
import consultoresRoutes from './routes/consultores.js';
import configuracoesRoutes from './routes/configuracoes.js';
import boletosRoutes from './routes/boletos.js';
import apiKeysRoutes from './routes/apikeys.js';
import consultorLinksPlugin from './routes/consultorLinks.js';

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

// Servir webapp estático em /app
fastify.get('/app', (request, reply) => reply.redirect(301, '/app/'));
fastify.get('/app/', (request, reply) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexPath)) return reply.code(404).send('Not found');
  reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'));
});
fastify.get('/app/index.html', (request, reply) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexPath)) return reply.code(404).send('Not found');
  reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'));
});

// URL curta /app/s/:code — injeta token e API key no HTML (?key= na URL ou WEBAPP_API_KEY no servidor)
fastify.get('/app/s/:code', async (request, reply) => {
  const { code } = request.params;
  const keyFromUrl = (request.query && request.query.key) ? String(request.query.key).trim() : '';
  const { resolverPorShortCode } = await import('./services/consultorLinksService.js');
  const data = await resolverPorShortCode(code);
  if (!data) return reply.code(404).type('text/html').send('<h1>Link inválido ou expirado</h1>');
  const rawKey = keyFromUrl || process.env.WEBAPP_API_KEY || process.env.MASTER_API_KEY || '';
  const webappKey = String(rawKey).trim();
  const logoUrl = (data.logo_url && String(data.logo_url).trim()) || '';
  const indexPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexPath)) return reply.code(404).send('Not found');
  let html = fs.readFileSync(indexPath, 'utf8');
  const configScript = `<script>window.__CONFIG__=${JSON.stringify({ token: data.slug, shortCode: code, apiKey: webappKey, logoUrl })};</script>`;
  if (!html.includes('</head>')) html = configScript + html;
  else html = html.replace('</head>', configScript + '\n</head>');
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  reply.type('text/html').send(html);
});

// Diagnóstico: verifica se a key para /app/s/:code está configurada (sem revelar o valor)
fastify.get('/api/config-status', async (request, reply) => {
  const raw = process.env.WEBAPP_API_KEY || process.env.MASTER_API_KEY || '';
  const configured = String(raw).trim().length > 0;
  return {
    webappKeyConfigured: configured,
    hint: configured ? 'Key configurada no servidor.' : 'Defina MASTER_API_KEY ou WEBAPP_API_KEY no Railway (variáveis de ambiente).'
  };
});

// ========== Acesso por short code (SEM API Key) — mais prático para links /app/s/:code ==========
// GET /api/boletos-por-short/:code/pdf/:nossoNumero — download do PDF do boleto (proxy GET no link_boleto)
fastify.get('/api/boletos-por-short/:code/pdf/:nossoNumero', async (request, reply) => {
  try {
    const { code, nossoNumero } = request.params;
    const { resolverPorShortCode } = await import('./services/consultorLinksService.js');
    const { query } = await import('./config/database.js');
    const data = await resolverPorShortCode(code);
    if (!data) return reply.code(404).send({ error: 'Link inválido', message: 'Código não encontrado.' });
    const boleto = await query(
      'SELECT link_boleto FROM boletos WHERE cliente_id = $1 AND consultor_id = $2 AND nosso_numero = $3',
      [data.cliente_id, data.consultor_id, nossoNumero]
    );
    if (boleto.rows.length === 0 || !boleto.rows[0].link_boleto) return reply.code(404).send({ error: 'Não encontrado', message: 'Boleto ou link do PDF não encontrado.' });
    const pdfUrl = boleto.rows[0].link_boleto;
    const res = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 15000, validateStatus: () => true });
    if (res.status !== 200) return reply.code(502).send({ error: 'Erro ao obter PDF', message: 'O servidor do boleto não respondeu.' });
    const filename = `boleto-${nossoNumero}.pdf`;
    return reply.header('Content-Disposition', `attachment; filename="${filename}"`).header('Content-Type', res.headers['content-type'] || 'application/pdf').send(Buffer.from(res.data));
  } catch (err) {
    console.error('Erro proxy PDF:', err.message);
    return reply.code(500).send({ error: 'Erro interno', message: err.message });
  }
});

// GET /api/boletos-por-short/:code/detalhe/:nossoNumero — detalhe do boleto (PIX, PDF)
fastify.get('/api/boletos-por-short/:code/detalhe/:nossoNumero', async (request, reply) => {
  try {
    const { code, nossoNumero } = request.params;
    const { resolverPorShortCode } = await import('./services/consultorLinksService.js');
    const { query } = await import('./config/database.js');
    const { buscarBoletoPorNossoNumero } = await import('./services/sgaService.js');
    const data = await resolverPorShortCode(code);
    if (!data) return reply.code(404).send({ error: 'Link inválido', message: 'Código não encontrado.' });
    const boletoCheck = await query(
      'SELECT id FROM boletos WHERE cliente_id = $1 AND consultor_id = $2 AND nosso_numero = $3',
      [data.cliente_id, data.consultor_id, nossoNumero]
    );
    if (boletoCheck.rows.length === 0) return reply.code(404).send({ error: 'Não encontrado', message: 'Boleto não encontrado.' });
    const clienteResult = await query(
      'SELECT token_bearer, url_base_api FROM clientes WHERE id = $1 AND ativo = true',
      [data.cliente_id]
    );
    if (clienteResult.rows.length === 0) return reply.code(404).send({ error: 'Cliente não encontrado' });
    const cliente = clienteResult.rows[0];
    const resposta = await buscarBoletoPorNossoNumero(cliente.token_bearer, cliente.url_base_api, nossoNumero);
    if (!resposta || resposta.length === 0) return reply.code(404).send({ error: 'Boleto não encontrado na SGA' });
    const item = resposta[0];
    const pixCopiaCola = item.pix?.copia_cola || null;
    const linkBoleto = item.link_boleto || item.short_link || null;
    await query(
      'UPDATE boletos SET pix_copia_cola = $1, link_boleto = $2, updated_at = CURRENT_TIMESTAMP WHERE cliente_id = $3 AND nosso_numero = $4',
      [pixCopiaCola, linkBoleto, data.cliente_id, nossoNumero]
    );
    return reply.send(resposta);
  } catch (err) {
    console.error('Erro boletos-por-short detalhe:', err);
    return reply.code(500).send({ error: 'Erro interno', message: err.message });
  }
});

// Período exibido nos links /app/s/:code — apenas boletos de 20/fev a 31/mar
const BOLETOS_SHORT_DATA_INICIAL = process.env.BOLETOS_SHORT_DATA_INICIAL || '20/02/2026';
const BOLETOS_SHORT_DATA_FINAL = process.env.BOLETOS_SHORT_DATA_FINAL || '31/03/2026';

// GET /api/boletos-por-short/:code — lista boletos do consultor (sem API Key). Query: data_inicial, data_final (DD/MM/YYYY).
fastify.get('/api/boletos-por-short/:code', async (request, reply) => {
  try {
    const { code } = request.params;
    const dataInicial = (request.query && request.query.data_inicial) || BOLETOS_SHORT_DATA_INICIAL;
    const dataFinal = (request.query && request.query.data_final) || BOLETOS_SHORT_DATA_FINAL;
    const { resolverPorShortCode } = await import('./services/consultorLinksService.js');
    const { listarBoletos } = await import('./services/boletoService.js');
    const data = await resolverPorShortCode(code);
    if (!data) return reply.code(404).send({ error: 'Link inválido', message: 'Código não encontrado.' });
    const resultado = await listarBoletos({
      cliente_id: data.cliente_id,
      consultor_id: data.consultor_id,
      data_vencimento_inicial: dataInicial,
      data_vencimento_final: dataFinal,
      limit: 500,
      page: 1
    });
    return reply.send({
      success: true,
      ...resultado,
      nome_consultor: data.nome_consultor,
      cliente_id: data.cliente_id,
      consultor_id: data.consultor_id
    });
  } catch (err) {
    console.error('Erro boletos-por-short:', err);
    return reply.code(500).send({ error: 'Erro interno', message: err.message });
  }
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
await fastify.register(consultorLinksPlugin);

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
