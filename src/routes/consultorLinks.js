import { authenticateApiKey } from '../middlewares/auth.js';
import { resolverSlug, listarLinks, gerarLinksParaCompetencia } from '../services/consultorLinksService.js';

/**
 * Rotas de links públicos do consultor (resolução por slug - sem auth)
 */
async function consultorLinkRoutes(fastify) {
  fastify.get('/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;
      const data = await resolverSlug(slug);
      if (!data) {
        return reply.code(404).send({
          error: 'Não encontrado',
          message: 'Link inválido ou expirado'
        });
      }
      return reply.send({
        success: true,
        ...data
      });
    } catch (error) {
      console.error('Erro ao resolver link consultor:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao resolver link'
      });
    }
  });
}

/**
 * Rotas de listagem e geração de links (com API Key)
 */
async function linksConsultorRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { cliente_id, competencia } = request.query;
      if (!cliente_id) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'O parâmetro cliente_id é obrigatório'
        });
      }
      const links = await listarLinks(cliente_id, competencia);
      return reply.send({
        success: true,
        data: links
      });
    } catch (error) {
      console.error('Erro ao listar links:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao listar links'
      });
    }
  });

  fastify.post('/gerar', {
    preHandler: authenticateApiKey
  }, async (request, reply) => {
    try {
      const { cliente_id, competencia } = request.body || {};
      if (!cliente_id || !competencia) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'cliente_id e competencia (MM/YYYY) são obrigatórios'
        });
      }
      if (!/^\d{2}\/\d{4}$/.test(competencia)) {
        return reply.code(400).send({
          error: 'Erro de validação',
          message: 'competencia deve estar no formato MM/YYYY'
        });
      }
      const links = await gerarLinksParaCompetencia(cliente_id, competencia);
      return reply.send({
        success: true,
        message: 'Links gerados/atualizados',
        data: links
      });
    } catch (error) {
      console.error('Erro ao gerar links:', error);
      return reply.code(500).send({
        error: 'Erro interno',
        message: error.message || 'Erro ao gerar links'
      });
    }
  });
}

/**
 * Plugin que registra as duas rotas de links
 */
export default async function consultorLinksPlugin(fastify) {
  await fastify.register(consultorLinkRoutes, { prefix: '/api/consultor-link' });
  await fastify.register(linksConsultorRoutes, { prefix: '/api/links-consultor' });
}
