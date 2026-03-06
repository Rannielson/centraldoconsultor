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
      quantidade_por_pagina: params.quantidade_por_pagina || 500
    };
    
    console.log(`📡 Requisição para API SGA: ${endpoint}`);
    console.log(`📄 Parâmetros:`, requestBody);
    
    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenBearer}`
      },
      timeout: 600000 // 600 segundos (10 minutos) de timeout
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
const QUANTIDADE_POR_PAGINA = 500;

export async function buscarTodosBoletosPeriodo(tokenBearer, urlBase, params) {
  const todosBoletos = [];
  let paginaAtual = 0;
  const quantidadePorPagina = params.quantidade_por_pagina || QUANTIDADE_POR_PAGINA;

  console.log(`🔄 Iniciando busca paginada (${quantidadePorPagina} por página)...`);

  try {
    while (true) {
      const resultado = await buscarBoletosPeriodo(tokenBearer, urlBase, {
        ...params,
        inicio_paginacao: paginaAtual,
        quantidade_por_pagina: quantidadePorPagina
      });

      const boletos = resultado.boletos || [];
      if (boletos.length > 0) {
        todosBoletos.push(...boletos);
      }

      console.log(`📊 Página ${paginaAtual + 1}: ${boletos.length} boletos | Total acumulado: ${todosBoletos.length}`);

      // Para quando não há mais boletos ou veio menos que a página cheia (não há próxima)
      if (boletos.length === 0) break;
      if (boletos.length < quantidadePorPagina) break;

      paginaAtual++;
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
      if (status === 401) throw new Error('Token de autenticação inválido ou expirado. A API Hinova recusou o acesso.');
      if (status === 403) throw new Error('Acesso negado pela API Hinova (SGA).');
      if (status === 404) throw new Error('Boleto não encontrado na Hinova para este nosso número.');
      if (status >= 500) throw new Error('Erro interno na API Hinova (servidor deles). Tente novamente em instantes.');
      throw new Error(data?.message || error.message || 'Erro na resposta da Hinova.');
    }
    if (error.request) {
      // Timeout ou falha de conexão: exibir mensagem amigável para quem consulta o boleto
      throw new Error('API Hinova fora do ar. Tente novamente em alguns minutos.');
    }
    throw new Error(error.message || 'Erro ao buscar boleto na Hinova.');
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

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD
 * @param {string} dataBr - Data no formato DD/MM/YYYY
 * @returns {string} Data no formato YYYY-MM-DD
 */
function converterDataParaIso(dataBr) {
  if (!dataBr || typeof dataBr !== 'string') return '';
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr.trim());
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Busca veículos da API SGA por período (produção - listar/veiculo)
 * @param {string} tokenBearer - Token de autenticação Bearer
 * @param {string} urlBase - URL base da API SGA
 * @param {object} params - Parâmetros da requisição
 * @param {number} params.inicio_paginacao - Índice da página (0, 1, 2...)
 * @param {number} params.quantidade_por_pagina - Quantidade por página (default 999)
 * @param {string} params.data_contrato - Data inicial contrato (YYYY-MM-DD)
 * @param {string} params.data_contrato_final - Data final contrato (YYYY-MM-DD)
 * @returns {Promise<object>} Dados dos veículos
 */
export async function buscarVeiculosPeriodo(tokenBearer, urlBase, params) {
  try {
    const endpoint = `${urlBase}/listar/veiculo`;

    const requestBody = {
      codigo_situacao: 1,
      inicio_paginacao: params.inicio_paginacao ?? 0,
      quantidade_por_pagina: params.quantidade_por_pagina ?? 999,
      data_contrato: params.data_contrato,
      data_contrato_final: params.data_contrato_final
    };

    console.log(`📡 Requisição para API SGA: ${endpoint}`);
    console.log(`📄 Parâmetros:`, requestBody);

    const response = await axios.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenBearer}`
      },
      timeout: 600000
    });

    let data = response.data;

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return { veiculos: [], total_veiculos: 0, numero_paginas: 0, pagina_corrente: 0 };
      }
      data = data[0];
    }

    if (!data || typeof data !== 'object' || !data.veiculos) {
      return { veiculos: [], total_veiculos: 0, numero_paginas: 0, pagina_corrente: 0 };
    }

    const total = parseInt(data.total_veiculos) || 0;
    const numPaginas = parseInt(data.numero_paginas) || 0;
    const pagCorrente = parseInt(data.pagina_corrente) || 0;

    console.log(
      `✅ API SGA (veículos): ${total} total, página ${pagCorrente}/${numPaginas || 1}`
    );

    return {
      veiculos: data.veiculos || [],
      total_veiculos: total,
      numero_paginas: numPaginas,
      pagina_corrente: pagCorrente
    };
  } catch (error) {
    console.error('❌ Erro ao buscar veículos da API SGA:', error.message);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) throw new Error('Token de autenticação inválido ou expirado');
      if (status === 403) throw new Error('Acesso negado pela API SGA');
      if (status === 404) throw new Error('Endpoint da API SGA não encontrado');
      if (status >= 500) throw new Error('Erro interno na API SGA');
      throw new Error(`Erro na API SGA: ${data?.message || error.message}`);
    }
    if (error.request) {
      throw new Error('Não foi possível conectar à API SGA. Verifique a URL e conexão de rede.');
    }
    throw new Error(`Erro ao configurar requisição: ${error.message}`);
  }
}

/**
 * Busca todos os veículos de produção em um período (paginação automática)
 * @param {string} tokenBearer - Token de autenticação Bearer
 * @param {string} urlBase - URL base da API SGA
 * @param {object} params - Parâmetros
 * @param {string} params.dataInicial - Data inicial (DD/MM/YYYY) - primeiro dia do mês
 * @param {string} params.dataFinal - Data final (DD/MM/YYYY) - dia atual
 * @returns {Promise<Array>} Array com todos os veículos
 */
export async function buscarVeiculosProducao(tokenBearer, urlBase, params) {
  const dataInicial = params.dataInicial;
  const dataFinal = params.dataFinal;

  if (!dataInicial || !dataFinal) {
    throw new Error('dataInicial e dataFinal são obrigatórios para buscarVeiculosProducao');
  }

  const dataContrato = converterDataParaIso(dataInicial);
  const dataContratoFinal = converterDataParaIso(dataFinal);

  const todosVeiculos = [];
  let paginaAtual = 0;
  const quantidadePorPagina = 999;

  console.log(`🔄 Iniciando busca paginada de veículos (${dataContrato} a ${dataContratoFinal})...`);

  try {
    while (true) {
      const resultado = await buscarVeiculosPeriodo(tokenBearer, urlBase, {
        inicio_paginacao: paginaAtual,
        quantidade_por_pagina: quantidadePorPagina,
        data_contrato: dataContrato,
        data_contrato_final: dataContratoFinal
      });

      const veiculos = resultado.veiculos || [];
      if (veiculos.length > 0) {
        todosVeiculos.push(...veiculos);
      }

      console.log(
        `📊 Página ${paginaAtual + 1}: ${veiculos.length} veículos | Total acumulado: ${todosVeiculos.length}`
      );

      if (veiculos.length === 0) break;
      if (veiculos.length < quantidadePorPagina) break;

      paginaAtual++;
    }

    console.log(`✅ Busca de veículos concluída: ${todosVeiculos.length} no total`);
    return todosVeiculos;
  } catch (error) {
    console.error('❌ Erro na busca de veículos:', error.message);
    throw error;
  }
}

/**
 * Obtém o primeiro dia do mês vigente até a data de hoje
 * @returns {object} Objeto com data_inicial (01/MM/YYYY) e data_final (hoje DD/MM/YYYY)
 */
export function obterPeriodoMesAteHoje() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const primeiroDia = new Date(ano, mes - 1, 1);

  const formatarData = (data) => {
    const dia = String(data.getDate()).padStart(2, '0');
    const mesNum = String(data.getMonth() + 1).padStart(2, '0');
    const anoNum = data.getFullYear();
    return `${dia}/${mesNum}/${anoNum}`;
  };

  return {
    data_inicial: formatarData(primeiroDia),
    data_final: formatarData(hoje)
  };
}

/**
 * Obtém 3 períodos de 30 dias para relatório individual (90 dias para trás)
 * @returns {object[]} Array de { data_inicial, data_final, faixa } em DD/MM/YYYY
 *   - faixa1: 0-30 dias (hoje-30 até hoje)
 *   - faixa2: 31-60 dias (hoje-60 até hoje-31)
 *   - faixa3: 61-90 dias (hoje-90 até hoje-61)
 */
export function obterPeriodos90Dias() {
  const hoje = new Date();

  const formatarData = (data) => {
    const dia = String(data.getDate()).padStart(2, '0');
    const mesNum = String(data.getMonth() + 1).padStart(2, '0');
    const anoNum = data.getFullYear();
    return `${dia}/${mesNum}/${anoNum}`;
  };

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const d0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const d30 = addDays(d0, -30);
  const d60 = addDays(d0, -60);
  const d90 = addDays(d0, -90);

  return [
    { data_inicial: formatarData(d30), data_final: formatarData(d0), faixa: '0-30 dias' },
    { data_inicial: formatarData(d60), data_final: formatarData(addDays(d0, -31)), faixa: '31-60 dias' },
    { data_inicial: formatarData(d90), data_final: formatarData(addDays(d0, -61)), faixa: '61-90 dias' }
  ];
}

export default {
  buscarBoletosPeriodo,
  buscarTodosBoletosPeriodo,
  buscarBoletoPorNossoNumero,
  buscarVeiculosPeriodo,
  buscarVeiculosProducao,
  validarFormatoData,
  obterPeriodoMesAtual,
  obterPeriodoMesAteHoje,
  obterPeriodos90Dias
};
