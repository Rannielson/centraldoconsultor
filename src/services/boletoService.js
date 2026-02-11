import { query } from '../config/database.js';
import { buscarTodosBoletosPeriodo } from './sgaService.js';

/**
 * Serviço de gerenciamento de boletos
 */

/**
 * Sincroniza boletos da API SGA com o banco de dados
 * @param {string} clienteId - ID do cliente
 * @param {string} dataInicial - Data inicial (DD/MM/YYYY)
 * @param {string} dataFinal - Data final (DD/MM/YYYY)
 * @param {string} codigoSituacao - Código da situação do boleto
 * @returns {Promise<object>} Estatísticas da sincronização
 */
export async function sincronizarBoletos(clienteId, dataInicial, dataFinal, codigoSituacao = "2") {
  console.log(`\n🔄 Iniciando sincronização de boletos para cliente ${clienteId}`);
  console.log(`📅 Período: ${dataInicial} a ${dataFinal}`);
  
  const estatisticas = {
    total_processados: 0,
    total_inseridos: 0,
    total_atualizados: 0,
    total_ignorados: 0,
    erros: []
  };
  
  try {
    // 1. Buscar cliente e validar
    console.log('1️⃣ Buscando dados do cliente...');
    const clienteResult = await query(
      'SELECT id, nome, token_bearer, url_base_api, ativo FROM clientes WHERE id = $1',
      [clienteId]
    );
    
    if (clienteResult.rows.length === 0) {
      throw new Error('Cliente não encontrado');
    }
    
    const cliente = clienteResult.rows[0];
    
    if (!cliente.ativo) {
      throw new Error('Cliente inativo');
    }
    
    console.log(`✅ Cliente encontrado: ${cliente.nome}`);
    
    // 2. Buscar consultores ativos do cliente
    console.log('2️⃣ Buscando consultores ativos...');
    const consultoresResult = await query(
      'SELECT id, id_consultor_sga, nome FROM consultores WHERE cliente_id = $1 AND ativo = true',
      [clienteId]
    );
    
    if (consultoresResult.rows.length === 0) {
      throw new Error('Nenhum consultor ativo encontrado para este cliente');
    }
    
    // Criar mapa de consultores por id_consultor_sga
    const consultoresMap = new Map();
    consultoresResult.rows.forEach(consultor => {
      consultoresMap.set(consultor.id_consultor_sga, consultor);
    });
    
    console.log(`✅ ${consultoresResult.rows.length} consultores ativos encontrados`);
    
    // 3. Buscar configurações de filtro
    console.log('3️⃣ Buscando configurações de filtro...');
    const configResult = await query(
      'SELECT situacoes_veiculo_aceitas FROM configuracoes_filtro WHERE cliente_id = $1',
      [clienteId]
    );
    
    let situacoesAceitas = ['ATIVO']; // Padrão
    
    if (configResult.rows.length > 0) {
      situacoesAceitas = configResult.rows[0].situacoes_veiculo_aceitas;
    }
    
    console.log(`✅ Situações de veículo aceitas:`, situacoesAceitas);
    
    // 4. Buscar boletos da API SGA
    console.log('4️⃣ Buscando boletos da API SGA...');
    const boletos = await buscarTodosBoletosPeriodo(
      cliente.token_bearer,
      cliente.url_base_api,
      {
        codigo_situacao_boleto: codigoSituacao,
        data_vencimento_inicial: dataInicial,
        data_vencimento_final: dataFinal
      }
    );
    
    console.log(`✅ ${boletos.length} boletos recebidos da API SGA`);
    
    // 5. Processar e filtrar boletos
    console.log('5️⃣ Processando e filtrando boletos...');
    
    for (const boleto of boletos) {
      try {
        estatisticas.total_processados++;
        
        // Verificar se o boleto tem veículos
        if (!boleto.veiculos || boleto.veiculos.length === 0) {
          estatisticas.total_ignorados++;
          continue;
        }
        
        // Processar cada veículo do boleto
        for (const veiculo of boleto.veiculos) {
          // Filtro 1: Verificar situação do veículo
          if (!situacoesAceitas.includes(veiculo.situacao_veiculo)) {
            continue;
          }
          
          // Filtro 2: Verificar se o codigo_voluntario corresponde a algum consultor
          const consultor = consultoresMap.get(veiculo.codigo_voluntario);
          
          if (!consultor) {
            continue;
          }
          
          // Extrair dados relevantes do boleto
          const dadosBoleto = {
            cliente_id: clienteId,
            consultor_id: consultor.id,
            nosso_numero: boleto.nosso_numero?.toString() || '',
            linha_digitavel: boleto.linha_digitavel || '',
            valor_boleto: parseFloat(boleto.valor_boleto) || 0,
            nome_associado: boleto.nome_associado || '',
            cpf_associado: boleto.cpf?.replace(/\D/g, '') || '',
            celular: boleto.celular || '',
            data_vencimento: converterData(boleto.data_vencimento),
            situacao_boleto: boleto.situacao_boleto || '',
            modelo_veiculo: veiculo.modelo || '',
            placa_veiculo: veiculo.placa || '',
            mes_referente: boleto.mes_referente || '',
            dados_completos: JSON.stringify({ boleto, veiculo })
          };
          
          // Inserir ou atualizar no banco (UPSERT)
          const resultado = await upsertBoleto(dadosBoleto);
          
          if (resultado === 'inserted') {
            estatisticas.total_inseridos++;
          } else if (resultado === 'updated') {
            estatisticas.total_atualizados++;
          }
        }
        
      } catch (error) {
        console.error(`❌ Erro ao processar boleto ${boleto.nosso_numero}:`, error.message);
        estatisticas.erros.push({
          nosso_numero: boleto.nosso_numero,
          erro: error.message
        });
      }
    }
    
    console.log('\n📊 Sincronização concluída!');
    console.log(`   Total processados: ${estatisticas.total_processados}`);
    console.log(`   Inseridos: ${estatisticas.total_inseridos}`);
    console.log(`   Atualizados: ${estatisticas.total_atualizados}`);
    console.log(`   Ignorados: ${estatisticas.total_ignorados}`);
    console.log(`   Erros: ${estatisticas.erros.length}\n`);
    
    return estatisticas;
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
    throw error;
  }
}

/**
 * Insere ou atualiza um boleto no banco de dados
 * @param {object} dadosBoleto - Dados do boleto
 * @returns {Promise<string>} 'inserted' ou 'updated'
 */
async function upsertBoleto(dadosBoleto) {
  try {
    const result = await query(
      `INSERT INTO boletos (
        cliente_id, consultor_id, nosso_numero, linha_digitavel, valor_boleto,
        nome_associado, cpf_associado, celular, data_vencimento, situacao_boleto,
        modelo_veiculo, placa_veiculo, mes_referente, dados_completos
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (cliente_id, nosso_numero)
      DO UPDATE SET
        consultor_id = EXCLUDED.consultor_id,
        linha_digitavel = EXCLUDED.linha_digitavel,
        valor_boleto = EXCLUDED.valor_boleto,
        nome_associado = EXCLUDED.nome_associado,
        cpf_associado = EXCLUDED.cpf_associado,
        celular = EXCLUDED.celular,
        data_vencimento = EXCLUDED.data_vencimento,
        situacao_boleto = EXCLUDED.situacao_boleto,
        modelo_veiculo = EXCLUDED.modelo_veiculo,
        placa_veiculo = EXCLUDED.placa_veiculo,
        mes_referente = EXCLUDED.mes_referente,
        dados_completos = EXCLUDED.dados_completos,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted`,
      [
        dadosBoleto.cliente_id,
        dadosBoleto.consultor_id,
        dadosBoleto.nosso_numero,
        dadosBoleto.linha_digitavel,
        dadosBoleto.valor_boleto,
        dadosBoleto.nome_associado,
        dadosBoleto.cpf_associado,
        dadosBoleto.celular,
        dadosBoleto.data_vencimento,
        dadosBoleto.situacao_boleto,
        dadosBoleto.modelo_veiculo,
        dadosBoleto.placa_veiculo,
        dadosBoleto.mes_referente,
        dadosBoleto.dados_completos
      ]
    );
    
    return result.rows[0].inserted ? 'inserted' : 'updated';
    
  } catch (error) {
    console.error('Erro no upsert do boleto:', error.message);
    throw error;
  }
}

/**
 * Converte data do formato DD/MM/YYYY ou YYYY-MM-DD para formato do PostgreSQL
 * @param {string} data - Data a ser convertida
 * @returns {string|null} Data no formato YYYY-MM-DD ou null
 */
function converterData(data) {
  if (!data || data === '0000-00-00') {
    return null;
  }
  
  // Se já está no formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }
  
  // Se está no formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}`;
  }
  
  return null;
}

/**
 * Lista boletos com filtros
 * @param {object} filtros - Filtros de busca
 * @returns {Promise<object>} Boletos e metadados
 */
export async function listarBoletos(filtros) {
  try {
    const {
      cliente_id,
      consultor_id,
      situacao_boleto,
      data_vencimento_inicial,
      data_vencimento_final,
      page = 1,
      limit = 50
    } = filtros;
    
    if (!cliente_id) {
      throw new Error('cliente_id é obrigatório');
    }
    
    // Construir query dinamicamente
    const conditions = ['b.cliente_id = $1'];
    const params = [cliente_id];
    let paramCount = 2;
    
    if (consultor_id) {
      conditions.push(`b.consultor_id = $${paramCount++}`);
      params.push(consultor_id);
    }
    
    if (situacao_boleto) {
      conditions.push(`b.situacao_boleto = $${paramCount++}`);
      params.push(situacao_boleto);
    }
    
    if (data_vencimento_inicial) {
      conditions.push(`b.data_vencimento >= $${paramCount++}`);
      params.push(converterData(data_vencimento_inicial));
    }
    
    if (data_vencimento_final) {
      conditions.push(`b.data_vencimento <= $${paramCount++}`);
      params.push(converterData(data_vencimento_final));
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Contar total de registros
    const countResult = await query(
      `SELECT COUNT(*) as total FROM boletos b WHERE ${whereClause}`,
      params
    );
    
    const total = parseInt(countResult.rows[0].total);
    
    // Calcular offset
    const offset = (page - 1) * limit;
    
    // Buscar boletos com paginação
    const boletosResult = await query(
      `SELECT 
        b.id,
        b.nosso_numero,
        b.linha_digitavel,
        b.valor_boleto,
        b.nome_associado,
        b.cpf_associado,
        b.celular,
        b.data_vencimento,
        b.situacao_boleto,
        b.modelo_veiculo,
        b.placa_veiculo,
        b.mes_referente,
        b.created_at,
        b.updated_at,
        c.id as consultor_id,
        c.nome as consultor_nome,
        c.id_consultor_sga
       FROM boletos b
       INNER JOIN consultores c ON b.consultor_id = c.id
       WHERE ${whereClause}
       ORDER BY b.data_vencimento DESC, b.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );
    
    // Formatar resposta
    const boletos = boletosResult.rows.map(row => ({
      id: row.id,
      consultor: {
        id: row.consultor_id,
        nome: row.consultor_nome,
        id_consultor_sga: row.id_consultor_sga
      },
      nosso_numero: row.nosso_numero,
      linha_digitavel: row.linha_digitavel,
      valor_boleto: parseFloat(row.valor_boleto),
      nome_associado: row.nome_associado,
      cpf_associado: row.cpf_associado,
      celular: row.celular,
      data_vencimento: row.data_vencimento,
      situacao_boleto: row.situacao_boleto,
      modelo_veiculo: row.modelo_veiculo,
      placa_veiculo: row.placa_veiculo,
      mes_referente: row.mes_referente,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    return {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(total / limit),
      boletos
    };
    
  } catch (error) {
    console.error('Erro ao listar boletos:', error.message);
    throw error;
  }
}

/**
 * Busca um boleto específico por ID
 * @param {string} boletoId - ID do boleto
 * @returns {Promise<object|null>} Boleto ou null
 */
export async function buscarBoletoPorId(boletoId) {
  try {
    const result = await query(
      `SELECT 
        b.*,
        c.id as consultor_id,
        c.nome as consultor_nome,
        c.id_consultor_sga,
        cl.nome as cliente_nome
       FROM boletos b
       INNER JOIN consultores c ON b.consultor_id = c.id
       INNER JOIN clientes cl ON b.cliente_id = cl.id
       WHERE b.id = $1`,
      [boletoId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    
    return {
      id: row.id,
      cliente: {
        id: row.cliente_id,
        nome: row.cliente_nome
      },
      consultor: {
        id: row.consultor_id,
        nome: row.consultor_nome,
        id_consultor_sga: row.id_consultor_sga
      },
      nosso_numero: row.nosso_numero,
      linha_digitavel: row.linha_digitavel,
      valor_boleto: parseFloat(row.valor_boleto),
      nome_associado: row.nome_associado,
      cpf_associado: row.cpf_associado,
      celular: row.celular,
      data_vencimento: row.data_vencimento,
      situacao_boleto: row.situacao_boleto,
      modelo_veiculo: row.modelo_veiculo,
      placa_veiculo: row.placa_veiculo,
      mes_referente: row.mes_referente,
      dados_completos: row.dados_completos,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    
  } catch (error) {
    console.error('Erro ao buscar boleto:', error.message);
    throw error;
  }
}

export default {
  sincronizarBoletos,
  listarBoletos,
  buscarBoletoPorId
};
