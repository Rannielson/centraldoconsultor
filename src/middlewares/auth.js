import { query } from '../config/database.js';

/**
 * Middleware de autenticação via API Key
 * Verifica se o header X-API-Key contém uma chave válida e ativa
 */
export async function authenticateApiKey(request, reply) {
  try {
    const apiKey = request.headers['x-api-key'];
    
    // Verifica se a API Key foi fornecida
    if (!apiKey) {
      return reply.code(401).send({
        error: 'Não autorizado',
        message: 'API Key não fornecida. Inclua o header X-API-Key na requisição.'
      });
    }
    
    // Busca a API Key no banco de dados
    const result = await query(
      'SELECT id, key, descricao, ativo FROM api_keys WHERE key = $1 AND ativo = true',
      [apiKey]
    );
    
    // Verifica se a API Key é válida
    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: 'Não autorizado',
        message: 'API Key inválida ou inativa.'
      });
    }
    
    // Adiciona informações da API Key ao request para uso posterior
    request.apiKey = result.rows[0];
    
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return reply.code(500).send({
      error: 'Erro interno',
      message: 'Erro ao validar API Key.'
    });
  }
}

/**
 * Middleware de autenticação para rotas de gerenciamento de API Keys
 * Requer a MASTER_API_KEY configurada no .env
 */
export async function authenticateMasterKey(request, reply) {
  try {
    const apiKey = request.headers['x-api-key'];
    const masterKey = process.env.MASTER_API_KEY;
    
    // Verifica se a API Key foi fornecida
    if (!apiKey) {
      return reply.code(401).send({
        error: 'Não autorizado',
        message: 'API Key não fornecida. Inclua o header X-API-Key na requisição.'
      });
    }
    
    // Verifica se é a Master Key
    if (apiKey !== masterKey) {
      return reply.code(403).send({
        error: 'Proibido',
        message: 'Apenas a Master API Key pode acessar este recurso.'
      });
    }
    
  } catch (error) {
    console.error('Erro na autenticação master:', error);
    return reply.code(500).send({
      error: 'Erro interno',
      message: 'Erro ao validar Master API Key.'
    });
  }
}

export default {
  authenticateApiKey,
  authenticateMasterKey
};
