import crypto from 'crypto';
import { query } from '../config/database.js';

/**
 * Deriva competência MM/YYYY a partir de data no formato DD/MM/YYYY
 * @param {string} dataInicial - ex: 01/02/2026
 * @returns {string} ex: 02/2026
 */
export function competenciaDeData(dataInicial) {
  if (!dataInicial || !/^\d{2}\/\d{2}\/\d{4}$/.test(dataInicial)) return null;
  const [, mes, ano] = dataInicial.split('/');
  return `${mes}/${ano}`;
}

const SHORT_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const SHORT_CODE_LEN = 6;

/**
 * Gera slug único para link do consultor
 * @returns {string}
 */
function gerarSlug() {
  return crypto.randomBytes(10).toString('hex');
}

/**
 * Gera código curto único (6 caracteres, sem ambíguos como 0/O, 1/l)
 * @returns {string}
 */
function gerarShortCode() {
  let code = '';
  const bytes = crypto.randomBytes(SHORT_CODE_LEN);
  for (let i = 0; i < SHORT_CODE_LEN; i++) {
    code += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
  }
  return code;
}

/**
 * Gera ou atualiza links públicos por consultor para uma competência
 * @param {string} clienteId - UUID do cliente
 * @param {string} competencia - MM/YYYY
 * @returns {Promise<Array>} Lista de links criados/atualizados
 */
export async function gerarLinksParaCompetencia(clienteId, competencia) {
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const consultoresResult = await query(
    `SELECT DISTINCT b.consultor_id, c.nome as nome_consultor
     FROM boletos b
     INNER JOIN consultores c ON c.id = b.consultor_id
     WHERE b.cliente_id = $1 AND b.mes_referente = $2`,
    [clienteId, competencia]
  );
  const links = [];
  for (const row of consultoresResult.rows) {
    const existente = await query(
      'SELECT id, slug, short_code, url_completa FROM links_consultor WHERE cliente_id = $1 AND consultor_id = $2 AND competencia = $3',
      [clienteId, row.consultor_id, competencia]
    );
    let slug, shortCode, urlCompleta, urlCurta;
    if (existente.rows.length > 0) {
      slug = existente.rows[0].slug;
      shortCode = existente.rows[0].short_code;
      urlCompleta = existente.rows[0].url_completa;
      if (!shortCode) {
        shortCode = gerarShortCode();
        let exists = true;
        while (exists) {
          const check = await query('SELECT 1 FROM links_consultor WHERE short_code = $1', [shortCode]);
          if (check.rows.length === 0) break;
          shortCode = gerarShortCode();
        }
        await query('UPDATE links_consultor SET short_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [shortCode, existente.rows[0].id]);
      }
      urlCurta = baseUrl ? `${baseUrl}/app/s/${shortCode}` : `/app/s/${shortCode}`;
      await query(
        'UPDATE links_consultor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [existente.rows[0].id]
      );
    } else {
      slug = gerarSlug();
      shortCode = gerarShortCode();
      let exists = true;
      while (exists) {
        const check = await query('SELECT 1 FROM links_consultor WHERE short_code = $1', [shortCode]);
        if (check.rows.length === 0) break;
        shortCode = gerarShortCode();
      }
      urlCompleta = baseUrl ? `${baseUrl}/app/?token=${slug}` : null;
      urlCurta = baseUrl ? `${baseUrl}/app/s/${shortCode}` : `/app/s/${shortCode}`;
      await query(
        `INSERT INTO links_consultor (cliente_id, consultor_id, competencia, slug, short_code, url_completa)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [clienteId, row.consultor_id, competencia, slug, shortCode, urlCompleta]
      );
    }
    links.push({
      consultor_id: row.consultor_id,
      nome_consultor: row.nome_consultor,
      competencia,
      slug,
      short_code: shortCode,
      url_completa: urlCompleta || (baseUrl ? `${baseUrl}/app/?token=${slug}` : `/app/?token=${slug}`),
      url_curta: urlCurta
    });
  }
  return links;
}

/**
 * Resolve slug para cliente_id, consultor_id e competência (endpoint público)
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function resolverSlug(slug) {
  const result = await query(
    `SELECT l.cliente_id, l.consultor_id, l.competencia, l.url_completa, c.nome as nome_consultor, cl.logo_url
     FROM links_consultor l
     INNER JOIN consultores c ON c.id = l.consultor_id
     INNER JOIN clientes cl ON cl.id = l.cliente_id
     WHERE l.slug = $1`,
    [slug]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    cliente_id: row.cliente_id,
    consultor_id: row.consultor_id,
    competencia: row.competencia,
    nome_consultor: row.nome_consultor,
    url_completa: row.url_completa,
    logo_url: row.logo_url || null
  };
}

/**
 * Resolve short_code para slug e dados do link (para rota /app/s/:code)
 * @param {string} shortCode
 * @returns {Promise<object|null>} { slug, cliente_id, consultor_id, competencia, nome_consultor }
 */
export async function resolverPorShortCode(shortCode) {
  const result = await query(
    `SELECT l.slug, l.cliente_id, l.consultor_id, l.competencia, c.nome as nome_consultor, cl.logo_url
     FROM links_consultor l
     INNER JOIN consultores c ON c.id = l.consultor_id
     INNER JOIN clientes cl ON cl.id = l.cliente_id
     WHERE l.short_code = $1`,
    [shortCode]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    slug: row.slug,
    cliente_id: row.cliente_id,
    consultor_id: row.consultor_id,
    competencia: row.competencia,
    nome_consultor: row.nome_consultor,
    logo_url: row.logo_url || null
  };
}

/**
 * Lista links por cliente e competência
 * @param {string} clienteId
 * @param {string} [competencia]
 * @returns {Promise<Array>}
 */
export async function listarLinks(clienteId, competencia) {
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  let sql = `SELECT l.id, l.consultor_id, l.competencia, l.slug, l.short_code, l.url_completa, l.created_at, c.nome as nome_consultor
             FROM links_consultor l
             INNER JOIN consultores c ON c.id = l.consultor_id
             WHERE l.cliente_id = $1`;
  const params = [clienteId];
  if (competencia) {
    sql += ' AND l.competencia = $2';
    params.push(competencia);
  }
  sql += ' ORDER BY l.competencia DESC, c.nome';
  const result = await query(sql, params);
  return result.rows.map(row => ({
    ...row,
    url_curta: row.short_code ? (baseUrl ? `${baseUrl}/app/s/${row.short_code}` : `/app/s/${row.short_code}`) : null
  }));
}
