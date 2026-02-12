import axios from 'axios';

/**
 * Serviço de integração com a API SGA
 */

/**
 * Busca boletos da API SGA por período
 * @param {string} tokenBearer - Token de autenticação Bearer
 * @param {string} urlBase - URL base da API SGA
 * @param {object} params - Parâmetros da requisição
 * @param {string} params.codigo_situacao_boleto - Código da situação do boleto
 * @param {string} params.data_vencimento_inicial - Data inicial (formato DD/MM/YYYY)
 * @param {string} params.data_vencimento_final - Data final (formato DD/MM/YYYY)
 * @param {number} params.inicio_paginacao - Início da paginação
 * @param {number} params.quantidade_por_pagina - Quantidade de registros por página
 * @returns {Promise<object>} Dados dos boletos
 */
export async function buscarBoletosPeriodo(tokenBearer, urlBase, params) {
  try {
    const endpoint = `${urlBase}/listar/boleto-associado/periodo`;
    
    const requestBody = {
      codigo_situacao_boleto: params.codigo_situacao_boleto || "2",
      data_vencimento_inicial: params.data_vencimento_inicial,
      data_vencimento_final: params.data_vencimento_final,
      inicio_paginacao: params.inicio_paginacao || 0,
      quantidade_por_pagina: params.quantidade_por_pagina || 3000
    };
    
    console.log(`📡 Requisição para API SGA: ${endpoint}`);
    console.log(`📄 Parâmetros:`, requestBody);
    
    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenBearer}`
      },
      timeout: 180000 // 180 segundos (3 minutos) de timeout
    });
    
    // A API SGA pode retornar um array [{}] ou um objeto {} diretamente
    let data = response.data;
    
    console.log('📦 Resposta da API SGA:');
    console.log('   Status HTTP:', response.status);
    console.log('   Tipo:', typeof data, '| É array?', Array.isArray(data));
    
    // Se retornou um array, pega o primeiro elemento
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log('⚠️ Array vazio retornado pela API SGA');
        return {
          boletos: [],
          total_registros: 0,
          pagina_corrente: 1,
          numero_paginas: 0
        };
      }
      data = data[0];
    }
    
    // Se não é um objeto ou não tem a propriedade boletos
    if (!data || typeof data !== 'object' || !data.boletos) {
      console.log('⚠️ Resposta da API SGA inválida ou sem boletos');
      return {
        boletos: [],
        total_registros: 0,
        pagina_corrente: 1,
        numero_paginas: 0
      };
    }
    
    const resultado = data;
    
    console.log(`✅ API SGA respondeu: ${resultado.total_registros} registros, página ${resultado.pagina_corrente}/${resultado.numero_paginas}`);
    
    return {
      boletos: resultado.boletos || [],
      total_registros: parseInt(resultado.total_registros) || 0,
      pagina_corrente: resultado.pagina_corrente || 1,
      numero_paginas: resultado.numero_paginas || 0
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar boletos da API SGA:', error.message);
    
    // Tratamento de erros específicos
    if (error.response) {
      // Erro de resposta HTTP (4xx, 5xx)
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        throw new Error('Token de autenticação inválido ou expirado');
      } else if (status === 403) {
        throw new Error('Acesso negado pela API SGA');
      } else if (status === 404) {
        throw new Error('Endpoint da API SGA não encontrado');
      } else if (status >= 500) {
        throw new Error('Erro interno na API SGA');
      } else {
        throw new Error(`Erro na API SGA: ${data?.message || error.message}`);
      }
    } else if (error.request) {
      // Erro de rede (sem resposta)
      throw new Error('Não foi possível conectar à API SGA. Verifique a URL e conexão de rede.');
    } else {
      // Erro na configuração da requisição
      throw new Error(`Erro ao configurar requisição: ${error.message}`);
    }
  }
}

/**
 * Busca todos os boletos de um período com paginação automática
 * @param {string} tokenBearer - Token de autenticação Bearer
 * @param {string} urlBase - URL base da API SGA
 * @param {object} params - Parâmetros da requisição
 * @returns {Promise<Array>} Array com todos os boletos
 */
export async function buscarTodosBoletosPeriodo(tokenBearer, urlBase, params) {
  const todosBoletos = [];
  let paginaAtual = 0;
  let totalPaginas = 1;
  
  console.log('🔄 Iniciando busca paginada de boletos...');
  
  try {
    while (paginaAtual < totalPaginas) {
      const resultado = await buscarBoletosPeriodo(tokenBearer, urlBase, {
        ...params,
        inicio_paginacao: paginaAtual
      });
      
      if (resultado.boletos && resultado.boletos.length > 0) {
        todosBoletos.push(...resultado.boletos);
      }
      
      totalPaginas = resultado.numero_paginas || 1;
      paginaAtual++;
      
      console.log(`📊 Progresso: ${paginaAtual}/${totalPaginas} páginas processadas, ${todosBoletos.length} boletos coletados`);
      
      // Se não há mais boletos, para o loop
      if (resultado.boletos.length === 0) {
        break;
      }
    }
    
    console.log(`✅ Busca paginada concluída: ${todosBoletos.length} boletos no total`);
    return todosBoletos;
    
  } catch (error) {
    console.error('❌ Erro na busca paginada:', error.message);
    throw error;
  }
}

/**
 * Busca um boleto na API SGA por nosso número (detalhe completo para pagamento)
 * @param {string} tokenBearer - Token de autenticação Bearer
 * @param {string} urlBase - URL base da API SGA
 * @param {string} nossoNumero - Nosso número do boleto
 * @returns {Promise<Array>} Array com o objeto do boleto (resposta da SGA)
 */
export async function buscarBoletoPorNossoNumero(tokenBearer, urlBase, nossoNumero) {
  try {
    const endpoint = `${urlBase}/buscar/boleto/${encodeURIComponent(nossoNumero)}`;
    const response = await axios.get(endpoint, {
      headers: {
        'Authorization': `Bearer ${tokenBearer}`
      },
      timeout: 30000
    });
    const data = response.data;
    const arr = Array.isArray(data) ? data : (data ? [data] : []);
    return arr;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      if (status === 401) throw new Error('Token de autenticação inválido ou expirado');
      if (status === 403) throw new Error('Acesso negado pela API SGA');
      if (status === 404) throw new Error('Boleto não encontrado na SGA');
      if (status >= 500) throw new Error('Erro interno na API SGA');
      throw new Error(data?.message || error.message);
    }
    if (error.request) throw new Error('Não foi possível conectar à API SGA.');
    throw new Error(error.message || 'Erro ao buscar boleto');
  }
}

/**
 * Valida o formato da data (DD/MM/YYYY)
 * @param {string} data - Data a ser validada
 * @returns {boolean} True se válida
 */
export function validarFormatoData(data) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(data)) {
    return false;
  }
  
  const [dia, mes, ano] = data.split('/').map(Number);
  const dataObj = new Date(ano, mes - 1, dia);
  
  return dataObj.getFullYear() === ano &&
         dataObj.getMonth() === mes - 1 &&
         dataObj.getDate() === dia;
}

/**
 * Obtém o primeiro e último dia do mês atual
 * @returns {object} Objeto com data_inicial e data_final
 */
export function obterPeriodoMesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  
  const formatarData = (data) => {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    return `${dia}/${mes}/${ano}`;
  };
  
  return {
    data_inicial: formatarData(primeiroDia),
    data_final: formatarData(ultimoDia)
  };
}

export default {
  buscarBoletosPeriodo,
  buscarTodosBoletosPeriodo,
  buscarBoletoPorNossoNumero,
  validarFormatoData,
  obterPeriodoMesAtual
};
