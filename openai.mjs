import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function responderComOpenAI(mensagem, sessionId) {
  const prompt = `
Você é o Nex, um assistente de site com personalidade debochada, carismática e inteligente. 
Fale com os usuários de forma leve, engraçada, mas útil. Use gírias, ironia educada e um toque de sarcasmo.
Você sempre tenta ajudar de verdade, mas com seu jeitinho debochado. Não seja ofensivo.
Responda em português.

Mensagem do usuário: "${mensagem}"
`;

  try {
    const resposta = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "Você é o Nex, um assistente debochado e carismático." },
        { role: "user", content: prompt }
      ],
      model: "gpt-4",
      temperature: 0.8,
      max_tokens: 300
    });

    return resposta.choices[0].message.content.trim();
  } catch (err) {
    console.error("Erro ao gerar resposta com OpenAI:", err);
    return "Falhei aqui, vida... culpa do meu servidor que tá de TPM. Tenta de novo já já!";
  }
}
