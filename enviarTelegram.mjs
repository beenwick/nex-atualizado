
import fetch from 'node-fetch';

const TELEGRAM_BOT_TOKEN = '7667643931:AAGaTHKZHmkef1KxlQcvJGaAjPqmXppKV7s';
const TELEGRAM_CHAT_ID = '7128913568';

export async function enviarParaTelegram(nome, email, mensagem, resposta) {
  const texto = `
🤖 Nova interação do Nex:

👤 Nome: ${nome || 'Não informado'}
📧 E-mail: ${email || 'Não informado'}
💬 Mensagem: ${mensagem}
🛸 Resposta: ${resposta}
🕒 Horário: ${new Date().toLocaleString('pt-BR')}
`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: texto,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o Telegram:', error);
  }
}
