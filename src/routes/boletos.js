import { authenticateApiKey } from '../middlewares/auth.js';
import { sincronizarBoletos, listarBoletos, buscarBoletoPorId } from '../services/boletoService.js';
import { validarFormatoData, obterPeriodoMesAtual } from '../services/sgaService.js';

/**
 * Rotas de gerenciamento de boletos
 */
export default async function boletosRoutes(fastify, options) {
  
  // Schema de validação para sincronização
  const sincronizarSchema = {
    body: {
      type: 'object',
      required: ['cliente_id'],
      properties: {
        cliente_id: { type: 'string', format: 'uuid' },
        data_vencimento_inicial: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
        data_vencimento_final: { type: 'string', pattern: '^\\d{2}/\\d{2}/\\d{4}$' },
        codigo_situacao_boleto: { type: 'string' }
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
   * POST /api/boletos/sincronizar
   * Sincronizar boletos da API SGA
   */
  fastify.post('/sincronizar', {
    preHandler: authenticateApiKey,
    schema: sincronizarSchema
  }, async (request, reply) => {
    try {
      const { 
        cliente_id, 
        data_vencimento_inicial, 
        data_vencimento_final,
        codigo_situacao_boleto 
      } = request.body;
      
      // Se não forneceu as datas, usa o mês atual
      let dataInicial = data_vencimento_inicial;
      let dataFinal = data_vencimento_final;
      
      if (!dataInicial || !dataFinal) {
        const periodo = obterPeriodoMesAtual();
        dataInicial = dataInicial || periodo.data_inicial;
        dataFinal = dataFinal || periodo.data_final;
        
        console.log(`📅 Usando período do mês atual: ${dataInicial} a ${dataFinal}`);
      }
      
      // Validar formato das datas
      if (!validarFormatoData(dataInicial)) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'data_vencimento_inicial deve estar no formato DD/MM/YYYY'
        });
      }
      
      if (!validarFormatoData(dataFinal)) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'data_vencimento_final deve estar no formato DD/MM/YYYY'
        });
      }
      
      // Executar sincronização
      const estatisticas = await sincronizarBoletos(
        cliente_id,
        dataInicial,
        dataFinal,
        codigo_situacao_boleto || "2"
      );
      
      return reply.send({
        success: true,
        message: 'Sincronização concluída',
        periodo: {
          data_inicial: dataInicial,
          data_final: dataFinal
        },
        estatisticas
      });
      
    } catch (error) {
      console.error('Erro na sincronização:', error);
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao sincronizar boletos'
      });
    }
  });
  
  /**
   * GET /api/boletos
   * Listar boletos com filtros
   */
  fastify.get('/', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const {
        cliente_id,
        consultor_id,
        situacao_boleto,
        data_vencimento_inicial,
        data_vencimento_final,
        page,
        limit
      } = request.query;
      
      // Validar cliente_id obrigatório
      if (!cliente_id) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'O parâmetro cliente_id é obrigatório'
        });
      }
      
      // Validar formato das datas se fornecidas
      if (data_vencimento_inicial && !validarFormatoData(data_vencimento_inicial)) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'data_vencimento_inicial deve estar no formato DD/MM/YYYY'
        });
      }
      
      if (data_vencimento_final && !validarFormatoData(data_vencimento_final)) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'data_vencimento_final deve estar no formato DD/MM/YYYY'
        });
      }
      
      const resultado = await listarBoletos({
        cliente_id,
        consultor_id,
        situacao_boleto,
        data_vencimento_inicial,
        data_vencimento_final,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50
      });
      
      return reply.send({
        success: true,
        ...resultado
      });
      
    } catch (error) {
      console.error('Erro ao listar boletos:', error);
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao listar boletos'
      });
    }
  });
  
  /**
   * GET /api/boletos/:id
   * Buscar boleto específico por ID
   */
  fastify.get('/:id', {
    preHandler: authenticateApiKey,
    schema: idParamSchema
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const boleto = await buscarBoletoPorId(id);
      
      if (!boleto) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Boleto não encontrado'
        });
      }
      
      return reply.send({
        success: true,
        data: boleto
      });
      
    } catch (error) {
      console.error('Erro ao buscar boleto:', error);
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar boleto'
      });
    }
  });
  
  /**
   * GET /api/boletos/consultor/:consultor_id/resumo
   * Obter resumo de boletos por consultor
   */
  fastify.get('/consultor/:consultor_id/resumo', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { consultor_id } = request.params;
      const { cliente_id } = request.query;
      
      if (!cliente_id) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'O parâmetro cliente_id é obrigatório'
        });
      }
      
      // Buscar estatísticas do consultor
      const { query } = await import('../config/database.js');
      
      const result = await query(
        `SELECT 
          COUNT(*) as total_boletos,
          SUM(valor_boleto) as valor_total,
          COUNT(CASE WHEN situacao_boleto = 'ABERTO' THEN 1 END) as total_abertos,
          COUNT(CASE WHEN situacao_boleto = 'VENCIDO' THEN 1 END) as total_vencidos,
          COUNT(CASE WHEN situacao_boleto = 'PAGO' THEN 1 END) as total_pagos
         FROM boletos
         WHERE cliente_id = $1 AND consultor_id = $2`,
        [cliente_id, consultor_id]
      );
      
      return reply.send({
        success: true,
        data: {
          consultor_id,
          total_boletos: parseInt(result.rows[0].total_boletos),
          valor_total: parseFloat(result.rows[0].valor_total) || 0,
          total_abertos: parseInt(result.rows[0].total_abertos),
          total_vencidos: parseInt(result.rows[0].total_vencidos),
          total_pagos: parseInt(result.rows[0].total_pagos)
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar resumo:', error);
      
      return reply.code(500).send({
        error: 'Erro interno',
        message: 'Erro ao buscar resumo de boletos'
      });
    }
  });
}
