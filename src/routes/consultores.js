import { query } from '../config/database.js';
import { authenticateApiKey } from '../middlewares/auth.js';

/**
 * Rotas de gerenciamento de consultores
 */
export default async function consultoresRoutes(fastify, options) {
  
  // Schema de validação para criar consultor
  const createConsultorSchema = {
    body: {
      type: 'object',
      required: ['cliente_id', 'nome', 'id_consultor_sga'],
      properties: {
        cliente_id: { type: 'string', format: 'uuid' },
        nome: { type: 'string', minLength: 3, maxLength: 255 },
        id_consultor_sga: { type: 'string', minLength: 1, maxLength: 50 },
        contato: { type: 'string', maxLength: 100 },
        ativo: { type: 'boolean' }
      }
    }
  };
  
  // Schema de validação para atualizar consultor
  const updateConsultorSchema = {
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
        id_consultor_sga: { type: 'string', minLength: 1, maxLength: 50 },
        contato: { type: 'string', maxLength: 100 },
        ativo: { type: 'boolean' }
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
   * POST /api/consultores
   * Criar novo consultor
   */
  fastify.post('/', {
    preHandler: authenticateApiKey,
    schema: createConsultorSchema
  }, async (request, reply) => {
    try {
      const { cliente_id, nome, id_consultor_sga, contato, ativo } = request.body;
      
      // Verifica se o cliente existe
      const clienteResult = await query(
        'SELECT id FROM clientes WHERE id = $1',
        [cliente_id]
      );
      
      if (clienteResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      // Verifica se já existe um consultor com o mesmo id_consultor_sga para este cliente
      const checkDuplicate = await query(
        'SELECT id FROM consultores WHERE cliente_id = $1 AND id_consultor_sga = $2',
        [cliente_id, id_consultor_sga]
      );
      
      if (checkDuplicate.rows.length > 0) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'Já existe um consultor com este ID SGA para este cliente'
        });
      }
      
      const result = await query(
        `INSERT INTO consultores (cliente_id, nome, id_consultor_sga, contato, ativo)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, cliente_id, nome, id_consultor_sga, contato, ativo, created_at, updated_at`,
        [
          cliente_id,
          nome,
          id_consultor_sga,
          contato || null,
          ativo !== undefined ? ativo : true
        ]
      );
      
      return reply.code(201).send({
        success: true,
        message: 'Consultor criado com sucesso',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao criar consultor:', error);
      
      // Erro de foreign key
      if (error.code === '23503') {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao criar consultor'
      });
    }
  });
  
  /**
   * GET /api/consultores
   * Listar todos os consultores (com filtro opcional por cliente)
   */
  fastify.get('/', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { cliente_id, ativo } = request.query;
      
      let queryText = `
        SELECT 
          c.id, 
          c.cliente_id, 
          c.nome, 
          c.id_consultor_sga, 
          c.contato, 
          c.ativo, 
          c.created_at, 
          c.updated_at,
          cl.nome as cliente_nome
        FROM consultores c
        INNER JOIN clientes cl ON c.cliente_id = cl.id
      `;
      
      const conditions = [];
      const params = [];
      let paramCount = 1;
      
      // Filtro por cliente
      if (cliente_id) {
        conditions.push(`c.cliente_id = $${paramCount++}`);
        params.push(cliente_id);
      }
      
      // Filtro por status ativo
      if (ativo !== undefined) {
        conditions.push(`c.ativo = $${paramCount++}`);
        params.push(ativo === 'true');
      }
      
      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      
      queryText += ' ORDER BY c.created_at DESC';
      
      const result = await query(queryText, params);
      
      return reply.send({
        success: true,
        total: result.rows.length,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Erro ao listar consultores:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao listar consultores'
      });
    }
  });
  
  /**
   * GET /api/consultores/:id
   * Buscar consultor por ID
   */
  fastify.get('/:id', {
    preHandler: authenticateApiKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        `SELECT 
          c.id, 
          c.cliente_id, 
          c.nome, 
          c.id_consultor_sga, 
          c.contato, 
          c.ativo, 
          c.created_at, 
          c.updated_at,
          cl.nome as cliente_nome
         FROM consultores c
         INNER JOIN clientes cl ON c.cliente_id = cl.id
         WHERE c.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Consultor não encontrado'
        });
      }
      
      return reply.send({
        success: true,
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao buscar consultor:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar consultor'
      });
    }
  });
  
  /**
   * PUT /api/consultores/:id
   * Atualizar consultor
   */
  fastify.put('/:id', {
    preHandler: authenticateApiKey,
    schema: updateConsultorSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { nome, id_consultor_sga, contato, ativo } = request.body;
      
      // Verifica se o consultor existe
      const checkResult = await query(
        'SELECT id, cliente_id FROM consultores WHERE id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Consultor não encontrado'
        });
      }
      
      // Se está atualizando o id_consultor_sga, verifica duplicação
      if (id_consultor_sga) {
        const clienteId = checkResult.rows[0].cliente_id;
        const checkDuplicate = await query(
          'SELECT id FROM consultores WHERE cliente_id = $1 AND id_consultor_sga = $2 AND id != $3',
          [clienteId, id_consultor_sga, id]
        );
        
        if (checkDuplicate.rows.length > 0) {
          return reply.code(400).send({
            error: 'Erro de validação',
            message: 'Já existe outro consultor com este ID SGA para este cliente'
          });
        }
      }
      
      // Monta a query de atualização dinamicamente
      const updates = [];
      const values = [];
      let paramCount = 1;
      
      if (nome !== undefined) {
        updates.push(`nome = $${paramCount++}`);
        values.push(nome);
      }
      if (id_consultor_sga !== undefined) {
        updates.push(`id_consultor_sga = $${paramCount++}`);
        values.push(id_consultor_sga);
      }
      if (contato !== undefined) {
        updates.push(`contato = $${paramCount++}`);
        values.push(contato);
      }
      if (ativo !== undefined) {
        updates.push(`ativo = $${paramCount++}`);
        values.push(ativo);
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'Nenhum campo para atualizar foi fornecido'
        });
      }
      
      values.push(id);
      
      const result = await query(
        `UPDATE consultores
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING id, cliente_id, nome, id_consultor_sga, contato, ativo, created_at, updated_at`,
        values
      );
      
      return reply.send({
        success: true,
        message: 'Consultor atualizado com sucesso',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao atualizar consultor:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao atualizar consultor'
      });
    }
  });
  
  /**
   * DELETE /api/consultores/:id
   * Deletar consultor
   */
  fastify.delete('/:id', {
    preHandler: authenticateApiKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const result = await query(
        'DELETE FROM consultores WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Consultor não encontrado'
        });
      }
      
      return reply.send({
        success: true,
        message: 'Consultor deletado com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao deletar consultor:', error);
      
      // Verifica se é erro de constraint (tem boletos relacionados)
      if (error.code === '23503') {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'Não é possível deletar consultor com boletos associados'
        });
      }
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao deletar consultor'
      });
    }
  });
}
