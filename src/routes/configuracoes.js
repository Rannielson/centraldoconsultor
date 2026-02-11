import { query } from '../config/database.js';
import { authenticateApiKey } from '../middlewares/auth.js';

/**
 * Rotas de gerenciamento de configurações de filtro
 */
export default async function configuracoesRoutes(fastify, options) {
  
  // Schema de validação para criar/atualizar configuração
  const configSchema = {
    body: {
      type: 'object',
      required: ['cliente_id', 'situacoes_veiculo_aceitas'],
      properties: {
        cliente_id: { type: 'string', format: 'uuid' },
        situacoes_veiculo_aceitas: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' }
        }
      }
    }
  };
  
  // Schema para parâmetros com cliente_id
  const clienteIdParamSchema = {
    params: {
      type: 'object',
      required: ['cliente_id'],
      properties: {
        cliente_id: { type: 'string', format: 'uuid' }
      }
    }
  };
  
  /**
   * POST /api/configuracoes
   * Criar ou atualizar configuração de filtro para um cliente
   */
  fastify.post('/', {
    preHandler: authenticateApiKey,
    schema: configSchema
  }, async (request, reply) => {
    try {
      const { cliente_id, situacoes_veiculo_aceitas } = request.body;
      
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
      
      // Verifica se já existe configuração para este cliente
      const checkConfig = await query(
        'SELECT id FROM configuracoes_filtro WHERE cliente_id = $1',
        [cliente_id]
      );
      
      let result;
      
      if (checkConfig.rows.length > 0) {
        // Atualiza configuração existente
        result = await query(
          `UPDATE configuracoes_filtro
           SET situacoes_veiculo_aceitas = $1, updated_at = CURRENT_TIMESTAMP
           WHERE cliente_id = $2
           RETURNING id, cliente_id, situacoes_veiculo_aceitas, created_at, updated_at`,
          [JSON.stringify(situacoes_veiculo_aceitas), cliente_id]
        );
        
        return reply.send({
          success: true,
          message: 'Configuração atualizada com sucesso',
          data: result.rows[0]
        });
      } else {
        // Cria nova configuração
        result = await query(
          `INSERT INTO configuracoes_filtro (cliente_id, situacoes_veiculo_aceitas)
           VALUES ($1, $2)
           RETURNING id, cliente_id, situacoes_veiculo_aceitas, created_at, updated_at`,
          [cliente_id, JSON.stringify(situacoes_veiculo_aceitas)]
        );
        
        return reply.code(201).send({
          success: true,
          message: 'Configuração criada com sucesso',
          data: result.rows[0]
        });
      }
      
    } catch (error) {
      console.error('Erro ao criar/atualizar configuração:', error);
      
      // Erro de foreign key
      if (error.code === '23503') {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao criar/atualizar configuração'
      });
    }
  });
  
  /**
   * GET /api/configuracoes/:cliente_id
   * Buscar configuração de filtro por cliente
   */
  fastify.get('/:cliente_id', {
    preHandler: authenticateApiKey,
    schema: clienteIdParamSchema
  }, async (request, reply) => {
    try {
      const { cliente_id } = request.params;
      
      const result = await query(
        `SELECT 
          cf.id, 
          cf.cliente_id, 
          cf.situacoes_veiculo_aceitas, 
          cf.created_at, 
          cf.updated_at,
          c.nome as cliente_nome
         FROM configuracoes_filtro cf
         INNER JOIN clientes c ON cf.cliente_id = c.id
         WHERE cf.cliente_id = $1`,
        [cliente_id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Configuração não encontrada para este cliente'
        });
      }
      
      return reply.send({
        success: true,
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar configuração'
      });
    }
  });
  
  /**
   * GET /api/configuracoes
   * Listar todas as configurações
   */
  fastify.get('/', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const result = await query(
        `SELECT 
          cf.id, 
          cf.cliente_id, 
          cf.situacoes_veiculo_aceitas, 
          cf.created_at, 
          cf.updated_at,
          c.nome as cliente_nome
         FROM configuracoes_filtro cf
         INNER JOIN clientes c ON cf.cliente_id = c.id
         ORDER BY cf.created_at DESC`
      );
      
      return reply.send({
        success: true,
        total: result.rows.length,
        data: result.rows
      });
      
    } catch (error) {
      console.error('Erro ao listar configurações:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao listar configurações'
      });
    }
  });
  
  /**
   * DELETE /api/configuracoes/:cliente_id
   * Deletar configuração de filtro
   */
  fastify.delete('/:cliente_id', {
    preHandler: authenticateApiKey,
    schema: clienteIdParamSchema
  }, async (request, reply) => {
    try {
      const { cliente_id } = request.params;
      
      const result = await query(
        'DELETE FROM configuracoes_filtro WHERE cliente_id = $1 RETURNING id',
        [cliente_id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Configuração não encontrada'
        });
      }
      
      return reply.send({
        success: true,
        message: 'Configuração deletada com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao deletar configuração:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao deletar configuração'
      });
    }
  });
}
