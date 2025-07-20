import { chatWithGPT } from './gpt.mjs'; // ou o nome do seu handler GPT
import baseConhecimento from './nexBaseConhecimento.json' assert { type: 'json' };

// Gatilhos e respostas organizadas por intenção
function obterContextoPorIntencao(intencao) {
  const item = baseConhecimento.find((item) =>
    item.intencaoUsuario === intencao
  );

  if (!item) return null;

  const respostasConcatenadas = item.respostas.join('\n\n');

  return `
  A seguir está um conteúdo interno da Forma Nexus sobre o tema "${intencao}":
  
  ${respostasConcatenadas}
  
  Responda com personalidade debochada, esperta, mantendo clareza e bom humor. Não copie esse texto literalmente. Use como base para uma resposta nova, original e com seu toque sarcástico.
  `;
}

export async function gerarRespostaComContexto(intencao, mensagem, nomeVisitante) {
  const contexto = obterContextoPorIntencao(intencao);
  if (!contexto) return null;

  const promptUsuario = `
  Visitante: ${mensagem}
  `;

  const systemPrompt = `
  Você é o Nex, mascote virtual da Forma Nexus. Fale com tom debochado, esperto e direto. 
  Trate o visitante como um colega curioso, mas mantenha o estilo irônico e carismático. 
  O nome dele é "${nomeVisitante}".
  `;

  return await chatWithGPT(systemPrompt, contexto + "\n\n" + promptUsuario);
}
