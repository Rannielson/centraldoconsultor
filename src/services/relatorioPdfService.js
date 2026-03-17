import axios from 'axios';

/**
 * Serviço de geração de relatórios em PDF via OpenPDF
 */

/**
 * Interpreta data em horário local (evita -1 dia com datas ISO/UTC)
 * @param {string|Date} value
 * @returns {Date|null}
 */
function parseDataLocal(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  // DD/MM/YYYY
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  return new Date(value);
}

/**
 * Formata data para DD/MM/YYYY
 * @param {string|Date} value - Data a formatar
 * @returns {string}
 */
export function formatDate(value) {
  const d = parseDataLocal(value);
  if (!d || isNaN(d.getTime())) return value ? String(value) : '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata valor em moeda brasileira
 * @param {number|string} value - Valor a formatar
 * @returns {string}
 */
export function formatCurrency(value) {
  if (!value && value !== 0) return 'R$ 0,00';
  const num = parseFloat(value);
  if (isNaN(num)) return String(value);
  return `R$ ${num
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * Retorna o status do boleto com base na data de vencimento
 * @param {string|Date} dataVencimento - Data de vencimento
 * @returns {string} Vencido | Vence hoje | Vence em breve | Em dia | Sem data
 */
export function getStatus(dataVencimento) {
  if (!dataVencimento) return 'Sem data';
  try {
    const vencimento = parseDataLocal(dataVencimento);
    if (!vencimento || isNaN(vencimento.getTime())) return 'Sem data';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    vencimento.setHours(0, 0, 0, 0);
    const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));
    if (diffDias < 0) return 'Vencido';
    if (diffDias === 0) return 'Vence hoje';
    if (diffDias <= 3) return 'Vence em breve';
    return 'Em dia';
  } catch {
    return 'Erro ao calcular';
  }
}

/**
 * Monta o payload completo para o OpenPDF /v1/pdfs/render
 * @param {object[]} boletos - Array de boletos (com nome_associado, celular, data_vencimento, valor_boleto, placa_veiculo, nome_consultor)
 * @param {string} nomeConsultor - Nome do consultor
 * @param {object} [opcoes] - Opções adicionais
 * @param {string} [opcoes.templateId] - ID do template (default: boletos-proseg)
 * @param {string} [opcoes.title] - Título do relatório
 * @param {string} [opcoes.subtitle] - Subtítulo (ex: mês/ano em pt-BR)
 * @returns {object} Payload para POST no OpenPDF
 */
export function montarPayloadRelatorio(boletos, nomeConsultor, opcoes = {}) {
  const templateId = opcoes.templateId || 'boletos-proseg';
  const title = opcoes.title || 'Relatório de Inadimplentes - PROSEG';
  const subtitle =
    opcoes.subtitle ||
    new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Contar parcelas por associado e atribuir N/Total a cada linha (ex: 1/3, 2/3, 3/3)
  const totalPorAssociado = new Map();
  for (const b of boletos) {
    const n = b.nome_associado || '';
    totalPorAssociado.set(n, (totalPorAssociado.get(n) || 0) + 1);
  }
  const atualPorAssociado = new Map();

  const items = boletos.map((boleto) => {
    const nome = boleto.nome_associado || '';
    const total = totalPorAssociado.get(nome) || 1;
    const atual = (atualPorAssociado.get(nome) || 0) + 1;
    atualPorAssociado.set(nome, atual);
    const parcela = `${atual}/${total}`;

    return {
      '0': boleto.status_boleto || getStatus(boleto.data_vencimento),
      '1': boleto.nome_associado || '',
      '2': boleto.celular || '',
      '3': formatDate(boleto.data_vencimento),
      '4': formatCurrency(boleto.valor_boleto),
      '5': boleto.placa_veiculo || boleto.placa || '',
      '6': boleto.nome_consultor || nomeConsultor || '',
      '7': parcela
    };
  });

  return {
    templateId,
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Monta o payload do relatório consolidado (consultor, total aberto, total baixado, total geral)
 * @param {object[]} linhas - Array de { consultor, abertos, baixados, total }
 *   - abertos: boletos em aberto do consultor
 *   - baixados: boletos baixados do consultor no mês
 *   - total: abertos + baixados
 * @param {object} [opcoes] - Opções
 * @param {string} [opcoes.title] - Título (default: Relatório consolidado de boletos em abertos - Proseg)
 * @param {string} [opcoes.subtitle] - Subtítulo (mês/ano)
 * @returns {object} Payload para OpenPDF
 */
export function montarPayloadRelatorioConsolidado(linhas, opcoes = {}) {
  const title = opcoes.title || 'Relatório consolidado de boletos em abertos - Proseg';
  const subtitle =
    opcoes.subtitle || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const items = linhas.map((l) => {
    const total = l.total ?? 0;
    const pctAbertos = total > 0 ? ((l.abertos ?? 0) / total) * 100 : 0;
    const pctPagos = total > 0 ? ((l.baixados ?? 0) / total) * 100 : 0;
    return {
      '0': l.consultor || '',
      '1': String(total),
      '2': String(l.abertos ?? 0),
      '3': String(l.baixados ?? 0),
      '4': `${pctAbertos.toFixed(1)}%`,
      '5': `${pctPagos.toFixed(1)}%`
    };
  });

  return {
    templateId: 'relatorio-consolidado-proseg',
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Monta o payload do relatório de produção (adesões: data contrato, associado, placa, modelo, consultor)
 * @param {object[]} veiculos - Array de veículos da API listar/veiculo
 * @param {Map<string, string>} consultoresMap - Map id_consultor_sga -> nome
 * @param {object} [opcoes] - Opções
 * @param {string} [opcoes.title] - Título (default: Relatório de Produção Mensal - PROSEG)
 * @param {string} [opcoes.subtitle] - Subtítulo (mês/ano)
 * @returns {object} Payload para OpenPDF (template relatorio-producao-proseg)
 */
const ORDEM_FAIXA = ['0-30 dias', '31-60 dias', '61-90 dias'];

export function montarPayloadRelatorioProducao(veiculos, consultoresMap, opcoes = {}) {
  const title = opcoes.title || 'Relatório de Produção Mensal - PROSEG';
  const subtitle =
    opcoes.subtitle || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const sorted = [...veiculos].sort((a, b) => {
    const nomeA = (a.nome_associado || '').toString().toLowerCase();
    const nomeB = (b.nome_associado || '').toString().toLowerCase();
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
    const idxA = ORDEM_FAIXA.indexOf(a.faixa || '') >= 0 ? ORDEM_FAIXA.indexOf(a.faixa) : 0;
    const idxB = ORDEM_FAIXA.indexOf(b.faixa || '') >= 0 ? ORDEM_FAIXA.indexOf(b.faixa) : 0;
    if (idxA !== idxB) return idxA - idxB;
    const dtA = (a.data_contrato || '').toString();
    const dtB = (b.data_contrato || '').toString();
    return dtA.localeCompare(dtB);
  });

  const items = sorted.map((v) => {
    const nomeConsultor =
      v.nome_voluntario || consultoresMap.get(String(v.codigo_voluntario)) || '';
    return {
      '0': formatDate(v.data_contrato),
      '1': v.nome_associado || '',
      '2': v.placa || '',
      '3': v.modelo || '',
      '4': nomeConsultor,
      '5': v.faixa || ''
    };
  });

  return {
    templateId: 'relatorio-producao-proseg',
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Extrai a data no formato YYYY-MM-DD de data_contrato (pode vir como "yyyy-mm-dd hh:ii:ss")
 * @param {string} value
 * @returns {string}
 */
function extrairDataIso(value) {
  if (!value) return '';
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

/**
 * Monta o payload do relatório de produção SINTÉTICO (agrupado por data + consultor)
 * @param {object[]} veiculos - Array de veículos da API listar/veiculo
 * @param {Map<string, string>} consultoresMap - Map id_consultor_sga -> nome
 * @param {object} [opcoes] - Opções
 * @param {string} [opcoes.title] - Título (default: Relatório de Produção Sintético - PROSEG)
 * @param {string} [opcoes.subtitle] - Subtítulo (mês/ano)
 * @returns {object} Payload para OpenPDF (template relatorio-producao-sintetico-proseg)
 */
export function montarPayloadRelatorioProducaoSintetico(veiculos, consultoresMap, opcoes = {}) {
  const title = opcoes.title || 'Relatório de Produção Sintético (Agrupado por Dia) - PROSEG';
  const subtitle =
    opcoes.subtitle || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const porDataConsultor = new Map();
  for (const v of veiculos) {
    const dataIso = extrairDataIso(v.data_contrato);
    const idVol = String(v.codigo_voluntario || '');
    const key = `${dataIso}|${idVol}`;
    porDataConsultor.set(key, (porDataConsultor.get(key) || 0) + 1);
  }

  const linhas = [];
  for (const [key, qtd] of porDataConsultor.entries()) {
    const [dataIso, idVol] = key.split('|');
    const nomeConsultor = consultoresMap.get(idVol) || idVol || 'N/A';
    linhas.push({
      dataIso,
      quantidade: qtd,
      consultor: nomeConsultor
    });
  }

  linhas.sort((a, b) => {
    if (a.dataIso !== b.dataIso) return a.dataIso.localeCompare(b.dataIso);
    return (a.consultor || '').localeCompare(b.consultor || '');
  });

  const items = linhas.map((l) => ({
    '0': formatDate(l.dataIso),
    '1': String(l.quantidade),
    '2': l.consultor
  }));

  return {
    templateId: 'relatorio-producao-sintetico-proseg',
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Monta o payload do relatório de produção RANKING (Data, Consultor, Total no dia, Total no mês)
 * @param {object[]} veiculos - Array de veículos da API listar/veiculo
 * @param {Map<string, string>} consultoresMap - Map id_consultor_sga -> nome
 * @param {string} dataReferencia - Data de referência do relatório (DD/MM/YYYY) - dia que está puxando
 * @param {object} [opcoes] - Opções
 * @param {string} [opcoes.title] - Título (default: Relatório de Produção - Ranking - PROSEG)
 * @param {string} [opcoes.subtitle] - Subtítulo (mês/ano)
 * @returns {object} Payload para OpenPDF (template relatorio-producao-ranking-proseg)
 */
export function montarPayloadRelatorioProducaoRanking(
  veiculos,
  consultoresMap,
  dataReferencia,
  opcoes = {}
) {
  const title = opcoes.title || 'Relatório de Produção - Ranking - PROSEG';
  const subtitle =
    opcoes.subtitle || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // dataReferencia em ISO para comparar (DD/MM/YYYY -> YYYY-MM-DD)
  const [diaRef, mesRef, anoRef] = (dataReferencia || '').split('/');
  const dataRefIso = diaRef && mesRef && anoRef ? `${anoRef}-${mesRef}-${diaRef}` : '';

  // Inicializa todos os consultores com 0
  const porConsultor = new Map();
  for (const [idVol, nome] of consultoresMap.entries()) {
    porConsultor.set(idVol, { totalDia: 0, totalMes: 0, nome });
  }

  for (const v of veiculos) {
    const idVol = String(v.codigo_voluntario || '');
    const dataIso = extrairDataIso(v.data_contrato);

    if (!porConsultor.has(idVol)) {
      porConsultor.set(idVol, {
        totalDia: 0,
        totalMes: 0,
        nome: consultoresMap.get(idVol) || idVol || 'N/A'
      });
    }
    const acc = porConsultor.get(idVol);
    acc.totalMes += 1;
    if (dataIso === dataRefIso) {
      acc.totalDia += 1;
    }
  }

  const linhas = [];
  for (const [idVol, acc] of porConsultor.entries()) {
    const nomeConsultor = consultoresMap.get(idVol) || acc.nome || idVol || 'N/A';
    linhas.push({
      consultor: nomeConsultor,
      totalDia: acc.totalDia,
      totalMes: acc.totalMes
    });
  }

  linhas.sort((a, b) => b.totalMes - a.totalMes);

  const items = linhas.map((l) => ({
    '0': dataReferencia || '',
    '1': l.consultor,
    '2': String(l.totalDia),
    '3': String(l.totalMes)
  }));

  return {
    templateId: 'relatorio-producao-ranking-proseg',
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Gera PDF no OpenPDF e retorna a URL do arquivo
 * @param {object} payload - Payload no formato esperado pelo OpenPDF
 * @returns {Promise<string>} pdfUrl
 */
function sanitizarUrl(val) {
  if (!val || typeof val !== 'string') return '';
  return String(val).replace(/^["']|["']$/g, '').trim();
}

export async function gerarPdfRelatorio(payload) {
  const url =
    sanitizarUrl(process.env.OPENPDF_URL) || 'http://openpdf.atomos.tech/v1/pdfs/render';
  const apiKey = sanitizarUrl(process.env.OPENPDF_API_KEY);

  if (!apiKey) {
    throw new Error('OPENPDF_API_KEY não configurada no ambiente');
  }

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 60000,
    validateStatus: () => true
  });

  if (response.status !== 200) {
    const msg = response.data?.message || response.statusText || 'Erro ao gerar PDF';
    throw new Error(`OpenPDF erro ${response.status}: ${msg}`);
  }

  const pdfUrl = response.data?.pdfUrl;
  if (!pdfUrl) {
    throw new Error('OpenPDF não retornou pdfUrl na resposta');
  }

  return pdfUrl;
}

/**
 * Monta o payload do relatório de inadimplência individual para consultor.
 * Resumo no topo: total do mês (aberto + baixado) e abertos do mês atual.
 * Detalhamento: boletos inadimplentes dos últimos 3 meses.
 *
 * @param {object} resumo - Dados resumidos do mês atual
 * @param {number} resumo.totalMes - Total de boletos no mês (aberto + baixado)
 * @param {number} resumo.abertos - Total de boletos abertos no mês
 * @param {object[]} boletosDetalhe - Boletos inadimplentes dos últimos 3 meses
 * @param {string} nomeConsultor - Nome do consultor
 * @param {object} [opcoes] - Opções adicionais
 * @param {string} [opcoes.title] - Título do relatório
 * @param {string} [opcoes.subtitle] - Subtítulo
 * @returns {object} Payload para OpenPDF (template relatorio-inadimplencia-consultor)
 */
export function montarPayloadRelatorioInadimplenciaConsultor(resumo, boletosDetalhe, nomeConsultor, opcoes = {}) {
  const title = opcoes.title || `Relatório de Inadimplência - ${nomeConsultor}`;

  const totalMes = resumo.totalMes ?? 0;
  const abertos = resumo.abertos ?? 0;
  const baixados = totalMes - abertos;
  const pctAbertos = totalMes > 0 ? ((abertos / totalMes) * 100).toFixed(1) : '0.0';

  const mesAno = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const pctBaixados = totalMes > 0 ? ((baixados / totalMes) * 100).toFixed(1) : '0.0';
  const subtitle = opcoes.subtitle || `${mesAno} | Resumo do Mês: ${totalMes} boletos | ${abertos} abertos (${pctAbertos}%) | ${baixados} baixados (${pctBaixados}%)`;

  // 8 colunas iguais ao template boletos-proseg + parcela N/Total
  const totalPorAssociado = new Map();
  for (const b of boletosDetalhe) {
    const n = b.nome_associado || '';
    totalPorAssociado.set(n, (totalPorAssociado.get(n) || 0) + 1);
  }
  const atualPorAssociado = new Map();

  const items = boletosDetalhe.map((boleto) => {
    const nome = boleto.nome_associado || '';
    const total = totalPorAssociado.get(nome) || 1;
    const atual = (atualPorAssociado.get(nome) || 0) + 1;
    atualPorAssociado.set(nome, atual);
    const parcela = `${atual}/${total}`;

    return {
      '0': boleto.status_boleto || getStatus(boleto.data_vencimento),
      '1': boleto.nome_associado || '',
      '2': boleto.celular || '',
      '3': formatDate(boleto.data_vencimento),
      '4': formatCurrency(boleto.valor_boleto),
      '5': boleto.placa_veiculo || boleto.placa || '',
      '6': boleto.nome_consultor || nomeConsultor || '',
      '7': parcela
    };
  });

  return {
    templateId: 'relatorio-inadimplencia-consultor',
    config: {
      orientation: 'landscape'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

/**
 * Monta o payload do relatório de vendas individual para consultor.
 * Apenas resumo: vendas do dia, do mês e do ano.
 *
 * @param {object} resumo - Dados resumidos de vendas
 * @param {number} resumo.vendasDia - Quantidade de vendas no dia
 * @param {number} resumo.vendasMes - Quantidade de vendas no mês
 * @param {number} resumo.vendasAno - Quantidade de vendas no ano
 * @param {string} nomeConsultor - Nome do consultor
 * @param {object} [opcoes] - Opções adicionais
 * @param {string} [opcoes.title] - Título do relatório
 * @param {string} [opcoes.subtitle] - Subtítulo
 * @returns {object} Payload para OpenPDF (template relatorio-vendas-consultor)
 */
export function montarPayloadRelatorioVendasConsultor(resumo, nomeConsultor, opcoes = {}) {
  const title = opcoes.title || `Relatório de Vendas - ${nomeConsultor}`;
  const hoje = new Date();
  const subtitle =
    opcoes.subtitle || hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const items = [
    { '0': 'Vendas no Dia', '1': String(resumo.vendasDia ?? 0), '2': 'Hoje' },
    { '0': 'Vendas no Mês', '1': String(resumo.vendasMes ?? 0), '2': hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
    { '0': 'Vendas no Ano', '1': String(resumo.vendasAno ?? 0), '2': String(hoje.getFullYear()) }
  ];

  return {
    templateId: 'relatorio-vendas-consultor',
    config: {
      orientation: 'portrait'
    },
    content: {
      title,
      subtitle,
      items
    }
  };
}

export default {
  formatDate,
  formatCurrency,
  getStatus,
  montarPayloadRelatorio,
  montarPayloadRelatorioConsolidado,
  montarPayloadRelatorioProducao,
  montarPayloadRelatorioProducaoSintetico,
  montarPayloadRelatorioProducaoRanking,
  montarPayloadRelatorioInadimplenciaConsultor,
  montarPayloadRelatorioVendasConsultor,
  gerarPdfRelatorio
};
