import { query } from '../config/database.js';
import { authenticateApiKey } from '../middlewares/auth.js';

/**
 * Rotas de gerenciamento de clientes
 */
export default async function clientesRoutes(fastify, options) {
  
  // Schema de validação para criar cliente
  const createClienteSchema = {
    body: {
      type: 'object',
      required: ['nome', 'token_bearer'],
      properties: {
        nome: { type: 'string', minLength: 3, maxLength: 255 },
        token_bearer: { type: 'string', minLength: 10 },
        url_base_api: { type: 'string', format: 'uri' },
        ativo: { type: 'boolean' }
      }
    }
  };
  
  // Schema de validação para atualizar cliente
  const updateClienteSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    },
    body: {
      type: 'object',
      properties: {
        nome: { type: 'string', minLength: 3, maxLength: 255 },
        token_bearer: { type: 'string', minLength: 10 },
        url_base_api: { type: 'string', format: 'uri' },
        ativo: { type: 'boolean' },
        logo_url: { type: 'string', maxLength: 2000 }
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
   * POST /api/clientes
   * Criar novo cliente
   */
  fastify.post('/', {
    preHandler: authenticateApiKey,
    schema: createClienteSchema
  }, async (request, reply) => {
    try {
      const { nome, token_bearer, url_base_api, ativo } = request.body;
      
      const result = await query(
        `INSERT INTO clientes (nome, token_bearer, url_base_api, ativo)
         VALUES ($1, $2, $3, $4)
         RETURNING id, nome, url_base_api, ativo, created_at, updated_at`,
        [
          nome,
          token_bearer,
          url_base_api || 'https://api.hinova.com.br/api/sga/v2',
          ativo !== undefined ? ativo : true
        ]
      );
      
      return reply.code(201).send({
        success: true,
        message: 'Cliente criado com sucesso',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao criar cliente'
      });
    }
  });
  
  /**
   * GET /api/clientes
   * Listar todos os clientes
   */
  fastify.get('/', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { ativo } = request.query;
      
      let queryText = `
        SELECT id, nome, url_base_api, ativo, logo_url, created_at, updated_at
        FROM clientes
      `;
      
      const params = [];
      
      // Filtro opcional por status ativo
      if (ativo !== undefined) {
        queryText += ' WHERE ativo = $1';
        params.push(ativo === 'true');
      }
      
      queryText += ' ORDER BY created_at DESC';
      
      const result = await query(queryText, params);
      
      return reply.send({
        success: true,
        total: result.rows.length,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Erro ao listar clientes:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao listar clientes'
      });
    }
  });
  
  /**
   * GET /api/clientes/:id
   * Buscar cliente por ID
   */
  fastify.get('/:id', {
    preHandler: authenticateApiKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        `SELECT id, nome, url_base_api, ativo, logo_url, created_at, updated_at
         FROM clientes
         WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      return reply.send({
        success: true,
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar cliente'
      });
    }
  });
  
  /**
   * PUT /api/clientes/:id
   * Atualizar cliente
   */
  fastify.put('/:id', {
    preHandler: authenticateApiKey,
    schema: updateClienteSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { nome, token_bearer, url_base_api, ativo, logo_url } = request.body;
      
      // Verifica se o cliente existe
      const checkResult = await query(
        'SELECT id FROM clientes WHERE id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      // Monta a query de atualização dinamicamente
      const updates = [];
      const values = [];
      let paramCount = 1;
      
      if (nome !== undefined) {
        updates.push(`nome = $${paramCount++}`);
        values.push(nome);
      }
      if (token_bearer !== undefined) {
        updates.push(`token_bearer = $${paramCount++}`);
        values.push(token_bearer);
      }
      if (url_base_api !== undefined) {
        updates.push(`url_base_api = $${paramCount++}`);
        values.push(url_base_api);
      }
      if (ativo !== undefined) {
        updates.push(`ativo = $${paramCount++}`);
        values.push(ativo);
      }
      if (logo_url !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(logo_url ? String(logo_url).trim() : null);
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'Nenhum campo para atualizar foi fornecido'
        });
      }
      
      values.push(id);
      
      const result = await query(
        `UPDATE clientes
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING id, nome, url_base_api, ativo, logo_url, created_at, updated_at`,
        values
      );
      
      return reply.send({
        success: true,
        message: 'Cliente atualizado com sucesso',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao atualizar cliente'
      });
    }
  });
  
  /**
   * DELETE /api/clientes/:id
   * Deletar cliente
   */
  fastify.delete('/:id', {
    preHandler: authenticateApiKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        'DELETE FROM clientes WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      return reply.send({
        success: true,
        message: 'Cliente deletado com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      
      // Verifica se é erro de constraint (tem dados relacionados)
      if (error.code === '23503') {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'Não é possível deletar cliente com consultores ou boletos associados'
        });
      }
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao deletar cliente'
      });
    }
  });
}
