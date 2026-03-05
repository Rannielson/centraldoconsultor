import axios from 'axios';

/**
 * Serviço de envio de mensagens WhatsApp via API Cleoia
 */

/**
 * Normaliza o contato para formato chatid (55 + DDD + número)
 * @param {string} contato - Número do contato (pode ter ou não 55)
 * @returns {string|null} chatid no formato 55XXXXXXXXX ou null se inválido
 */
export function normalizarChatId(contato) {
  if (!contato || typeof contato !== 'string') return null;
  const digitos = contato.replace(/\D/g, '');
  if (digitos.length < 10) return null;
  // Se já começa com 55, retorna como está (apenas dígitos)
  if (digitos.startsWith('55')) return digitos;
  return `55${digitos}`;
}

/**
 * Envia URL por WhatsApp via API Cleoia
 * @param {string} chatid - ID do chat (55 + número, ex: 5511999999999)
 * @param {string} text - Texto da mensagem
 * @param {string} url - URL a enviar (ex: link do PDF)
 * @returns {Promise<object>} Resposta da API
 */
export async function enviarUrlWhatsApp(chatid, text, url) {
  const sendUrl = process.env.CLEOIA_BOT_SEND_URL;

  if (!sendUrl) {
    throw new Error('CLEOIA_BOT_SEND_URL não configurada no ambiente');
  }

  if (!chatid || !url) {
    throw new Error('chatid e url são obrigatórios');
  }

  const response = await axios.post(
    sendUrl,
    {
      chatid,
      text: text || '',
      url
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true
    }
  );

  if (response.status >= 400) {
    const msg = response.data?.message || response.statusText || 'Erro ao enviar WhatsApp';
    throw new Error(`Cleoia erro ${response.status}: ${msg}`);
  }

  return response.data;
}

export default {
  normalizarChatId,
  enviarUrlWhatsApp
};
