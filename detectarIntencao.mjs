
// detectarIntencao.mjs
import { normalizarInput } from './normalizarInput.mjs';

export function detectarIntencao(mensagem) {
  const mensagemNormalizada = normalizarInput(mensagem);

  for (const intencao of baseConhecimento) {
    for (const gatilho of intencao.gatilhos) {
      if (mensagemNormalizada.includes(gatilho.toLowerCase())) {
        return intencao;
      }
    }
  }

  return null;
}
