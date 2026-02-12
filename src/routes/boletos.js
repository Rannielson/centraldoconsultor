import axios from 'axios';
import { authenticateApiKey } from '../middlewares/auth.js';
import { query } from '../config/database.js';
import { sincronizarBoletos, listarBoletos, buscarBoletoPorId } from '../services/boletoService.js';
import { validarFormatoData, obterPeriodoMesAtual, buscarBoletoPorNossoNumero } from '../services/sgaService.js';

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
   * GET /api/boletos/pdf/:nossoNumero
   * Download do PDF do boleto (proxy GET no link_boleto)
   */
  fastify.get('/pdf/:nossoNumero', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { nossoNumero } = request.params;
      const { cliente_id, consultor_id } = request.query;
      if (!cliente_id) return reply.code(400).send({ error: 'Erro de validação', message: 'cliente_id é obrigatório' });
      const boleto = await query(
        'SELECT link_boleto FROM boletos WHERE cliente_id = $1 AND nosso_numero = $2' + (consultor_id ? ' AND consultor_id = $3' : ''),
        consultor_id ? [cliente_id, nossoNumero, consultor_id] : [cliente_id, nossoNumero]
      );
      if (boleto.rows.length === 0 || !boleto.rows[0].link_boleto) return reply.code(404).send({ error: 'Não encontrado', message: 'Boleto ou link do PDF não encontrado.' });
      const pdfUrl = boleto.rows[0].link_boleto;
      const res = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 15000, validateStatus: () => true });
      if (res.status !== 200) return reply.code(502).send({ error: 'Erro ao obter PDF', message: 'O servidor do boleto não respondeu.' });
      const filename = `boleto-${nossoNumero}.pdf`;
      return reply.header('Content-Disposition', `attachment; filename="${filename}"`).header('Content-Type', res.headers['content-type'] || 'application/pdf').send(Buffer.from(res.data));
    } catch (err) {
      console.error('Erro proxy PDF:', err);
      return reply.code(500).send({ error: 'Erro interno', message: err.message });
    }
  });

  /**
   * GET /api/boletos/detalhe/:nossoNumero
   * Buscar detalhe do boleto na SGA (proxy) e persistir pix_copia_cola e link_boleto
   */
  fastify.get('/detalhe/:nossoNumero', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { nossoNumero } = request.params;
      const { cliente_id, consultor_id } = request.query;
      if (!cliente_id) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'O parâmetro cliente_id é obrigatório'
        });
      }
      const clienteResult = await query(
        'SELECT id, token_bearer, url_base_api FROM clientes WHERE id = $1 AND ativo = true',
        [cliente_id]
      );
      if (clienteResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Cliente não encontrado'
        });
      }
      const cliente = clienteResult.rows[0];
      const boletoCheckParams = [cliente_id, nossoNumero];
      let boletoCheckSql = 'SELECT id, consultor_id FROM boletos WHERE cliente_id = $1 AND nosso_numero = $2';
      if (consultor_id) {
        boletoCheckSql += ' AND consultor_id = $3';
        boletoCheckParams.push(consultor_id);
      }
      const boletoCheck = await query(boletoCheckSql, boletoCheckParams);
      if (boletoCheck.rows.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Boleto não encontrado para este cliente'
        });
      }
      const resposta = await buscarBoletoPorNossoNumero(
        cliente.token_bearer,
        cliente.url_base_api,
        nossoNumero
      );
      if (!resposta || resposta.length === 0) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Boleto não encontrado na SGA'
        });
      }
      const item = resposta[0];
      const pixCopiaCola = item.pix?.copia_cola || null;
      const linkBoleto = item.link_boleto || item.short_link || null;
      await query(
        'UPDATE boletos SET pix_copia_cola = $1, link_boleto = $2, updated_at = CURRENT_TIMESTAMP WHERE cliente_id = $3 AND nosso_numero = $4',
        [pixCopiaCola, linkBoleto, cliente_id, nossoNumero]
      );
      return reply.send(resposta);
    } catch (error) {
      console.error('Erro ao buscar detalhe do boleto:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao buscar detalhe do boleto'
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
