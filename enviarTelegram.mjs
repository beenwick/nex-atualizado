import fetch from 'node-fetch';

const TELEGRAM_BOT_TOKEN = '7667643931:AAGaTHKZHmkef1KxlQcvJGaAjPqmXppKV7s';
const TELEGRAM_CHAT_ID = '7128913568';

export async function enviarParaTelegram({ nome, email, mensagem, resposta }) {
  const texto = `
🤖 Nova interação do Nex:
👤 Nome: ${nome}
📧 Email: ${email}

🗨️ Mensagem: ${mensagem}
💬 Resposta: ${resposta}

⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
`.trim();

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: texto
      })
    });

    const data = await response.json();
    console.log("Enviado ao Telegram:", data);
  } catch (erro) {
    console.error("Erro no envio ao Telegram:", erro);
  }
}
