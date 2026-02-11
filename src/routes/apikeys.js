import { query } from '../config/database.js';
import { authenticateMasterKey } from '../middlewares/auth.js';
import { randomBytes } from 'crypto';

/**
 * Rotas de gerenciamento de API Keys
 * Requer autenticação com Master API Key
 */
export default async function apiKeysRoutes(fastify, options) {
  
  // Schema de validação para criar API Key
  const createApiKeySchema = {
    body: {
      type: 'object',
      properties: {
        descricao: { type: 'string', minLength: 3, maxLength: 255 }
      }
    }
  };
  
  // Schema para parâmetros com ID
  const idParamSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    }
  };
  
  /**
   * Gera uma API Key aleatória
   * @returns {string} API Key gerada
   */
  function gerarApiKey() {
    const prefix = 'ck'; // central-consultor key
    const randomPart = randomBytes(32).toString('hex');
    return `${prefix}_${randomPart}`;
  }
  
  /**
   * POST /api/auth/keys
   * Criar nova API Key
   */
  fastify.post('/', {
    preHandler: authenticateMasterKey,
    schema: createApiKeySchema
  }, async (request, reply) => {
    try {
      const { descricao } = request.body;
      
      // Gerar nova API Key
      const novaKey = gerarApiKey();
      
      const result = await query(
        `INSERT INTO api_keys (key, descricao, ativo)
         VALUES ($1, $2, true)
         RETURNING id, key, descricao, ativo, created_at`,
        [novaKey, descricao || 'API Key gerada automaticamente']
      );
      
      return reply.code(201).send({
        success: true,
        message: 'API Key criada com sucesso',
        data: result.rows[0],
        warning: 'Guarde esta chave em local seguro. Ela não será exibida novamente.'
      });
      
    } catch (error) {
      console.error('Erro ao criar API Key:', error);
      
      // Verifica se é erro de chave duplicada (muito improvável)
      if (error.code === '23505') {
        return reply.code(500).send({
          error: 'Erro interno',
          message: 'Erro ao gerar chave única. Tente novamente.'
        });
      }
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao criar API Key'
      });
    }
  });
  
  /**
   * GET /api/auth/keys
   * Listar todas as API Keys
   */
  fastify.get('/', {
    preHandler: authenticateMasterKey
  }, async (request, reply) => {
    try {
      const { ativo } = request.query;
      
      let queryText = `
        SELECT id, key, descricao, ativo, created_at
        FROM api_keys
      `;
      
      const params = [];
      
      // Filtro opcional por status ativo
      if (ativo !== undefined) {
        queryText += ' WHERE ativo = $1';
        params.push(ativo === 'true');
      }
      
      queryText += ' ORDER BY created_at DESC';
      
      const result = await query(queryText, params);
      
      // Mascarar as chaves na listagem (mostrar apenas os primeiros e últimos caracteres)
      const keysMascaradas = result.rows.map(row => ({
        ...row,
        key: mascarKey(row.key)
      }));
      
      return reply.send({
        success: true,
        total: keysMascaradas.length,
        data: keysMascaradas
      });
      
    } catch (error) {
      console.error('Erro ao listar API Keys:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao listar API Keys'
      });
    }
  });
  
  /**
   * GET /api/auth/keys/:id
   * Buscar API Key por ID (key mascarada)
   */
  fastify.get('/:id', {
    preHandler: authenticateMasterKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        'SELECT id, key, descricao, ativo, created_at FROM api_keys WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'API Key não encontrada'
        });
      }
      
      const apiKey = result.rows[0];
      apiKey.key = mascarKey(apiKey.key);
      
      return reply.send({
        success: true,
        data: apiKey
      });
      
    } catch (error) {
      console.error('Erro ao buscar API Key:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar API Key'
      });
    }
  });
  
  /**
   * PATCH /api/auth/keys/:id/toggle
   * Ativar/desativar API Key
   */
  fastify.patch('/:id/toggle', {
    preHandler: authenticateMasterKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Verifica se a API Key existe
      const checkResult = await query(
        'SELECT id, ativo FROM api_keys WHERE id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'API Key não encontrada'
        });
      }
      
      const statusAtual = checkResult.rows[0].ativo;
      const novoStatus = !statusAtual;
      
      const result = await query(
        `UPDATE api_keys
         SET ativo = $1
         WHERE id = $2
         RETURNING id, key, descricao, ativo, created_at`,
        [novoStatus, id]
      );
      
      const apiKey = result.rows[0];
      apiKey.key = mascarKey(apiKey.key);
      
      return reply.send({
        success: true,
        message: `API Key ${novoStatus ? 'ativada' : 'desativada'} com sucesso`,
        data: apiKey
      });
      
    } catch (error) {
      console.error('Erro ao alternar status da API Key:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao alternar status da API Key'
      });
    }
  });
  
  /**
   * DELETE /api/auth/keys/:id
   * Deletar API Key (revogar permanentemente)
   */
  fastify.delete('/:id', {
    preHandler: authenticateMasterKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        'DELETE FROM api_keys WHERE id = $1 RETURNING id, key',
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'API Key não encontrada'
        });
      }
      
      return reply.send({
        success: true,
        message: 'API Key revogada permanentemente'
      });
      
    } catch (error) {
      console.error('Erro ao deletar API Key:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao deletar API Key'
      });
    }
  });
  
  /**
   * PUT /api/auth/keys/:id
   * Atualizar descrição da API Key
   */
  fastify.put('/:id', {
    preHandler: authenticateMasterKey,
    schema: {
      ...idParamSchema,
      body: {
        type: 'object',
        required: ['descricao'],
        properties: {
          descricao: { type: 'string', minLength: 3, maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { descricao } = request.body;
      
      const result = await query(
        `UPDATE api_keys
         SET descricao = $1
         WHERE id = $2
         RETURNING id, key, descricao, ativo, created_at`,
        [descricao, id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'API Key não encontrada'
        });
      }
      
      const apiKey = result.rows[0];
      apiKey.key = mascarKey(apiKey.key);
      
      return reply.send({
        success: true,
        message: 'API Key atualizada com sucesso',
        data: apiKey
      });
      
    } catch (error) {
      console.error('Erro ao atualizar API Key:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao atualizar API Key'
      });
    }
  });
  
  /**
   * Mascara uma API Key para exibição
   * @param {string} key - API Key completa
   * @returns {string} API Key mascarada
   */
  function mascarKey(key) {
    if (!key || key.length < 10) {
      return '***';
    }
    
    const inicio = key.substring(0, 8);
    const fim = key.substring(key.length - 4);
    return `${inicio}...${fim}`;
  }
}
