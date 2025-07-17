// detectarIntencao.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizarInput } from './normalizarInput.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, "nexBaseConhecimento.json");

const baseConhecimento = JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));

export function detectarIntencao(mensagem) {
  const mensagemNormalizada = normalizarInput(mensagem);

  for (const intencao of baseConhecimento) {
    for (const gatilho of intencao.gatilhos) {
      if (mensagemNormalizada.includes(gatilho.toLowerCase())) {
        return {
          intencao: intencao.titulo,
          respostas: [intencao.conteudo],
          gatilhos: intencao.gatilhos
        };
      }
    }
  }

  return null;
}
