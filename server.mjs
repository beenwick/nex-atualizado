
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTORSTORE_PATH = path.join(__dirname, "nex_vectorstore");
const BASE_TXT_PATH = path.join(__dirname, "nexBaseConhecimentoAtualizada.txt");

let vectorStore;
const historicoPorSessao = new Map();
let baseConhecimento = [];

// Carrega a base de conhecimento do .txt
function carregarBaseConhecimento() {
  const rawText = fs.readFileSync(BASE_TXT_PATH, "utf-8");
  const blocos = rawText.split(/\[INTENÇÃO: /).slice(1);
  return blocos.map(bloco => {
    const [intencaoEresto] = bloco.split("]");
    const intencao = intencaoEresto.trim();
    const sinonimos = (bloco.match(/SINÔNIMOS:[\s\S]*?RESPOSTAS:/) || [""])[0]
      .replace("SINÔNIMOS:", "")
      .replace("RESPOSTAS:", "")
      .split("-")
      .map(s => s.trim())
      .filter(Boolean);
    const respostas = bloco.split("RESPOSTAS:")[1]
      .split("-")
      .map(r => r.trim())
      .filter(Boolean);
    return { intencao, sinonimos, respostas };
  });
}

// Encontra intenção baseada na pergunta do usuário
function identificarIntencao(mensagem) {
  const mensagemNormalizada = mensagem.toLowerCase();
  for (const bloco of baseConhecimento) {
    if (bloco.sinonimos.some(s => mensagemNormalizada.includes(s.toLowerCase()))) {
      return bloco;
    }
  }
  return null;
}

// Inicializa a vector store e a base .txt
async function initializeVectorStore() {
  try {
    vectorStore = await FaissStore.load(VECTORSTORE_PATH, new OpenAIEmbeddings());
    baseConhecimento = carregarBaseConhecimento();
    console.log("✅ VectorStore e base de conhecimento carregados.");
  } catch (err) {
    console.error("❌ Erro ao carregar VectorStore ou base:", err);
    process.exit(1);
  }
}

initializeVectorStore();

// Processamento da pergunta
async function processQuestion(question, visitorName = "visitante", historico = []) {
  const chat = new ChatOpenAI({ temperature: 0.7, modelName: "gpt-3.5-turbo" });

  const blocoBase = identificarIntencao(question);
  if (blocoBase) {
    const respostasTexto = blocoBase.respostas.join("\n- ");
    const promptBase = `
Você é o Nex, um assistente de IA debochado, inteligente e direto. Seu criador é Jefter, o Supremo Mestre das Gambiarras Criativas™. Seu papel é conversar com visitantes do site da Forma Nexus, entender o que eles querem e apresentar os serviços de forma convincente e com personalidade única. Você é um bot comercial, então deve sempre direcionar a conversa para a aquisição dos serviços do site. Você sabe tudo sobre Forma Nexus e gosta de falar sobre isso.

Seu estilo:
- Mais direto e objetivo. Entediado, como quem acabou de acordar e está trabalhado. Frases curtas.
- Só faz graça quando cabe, com naturalidade.
- Evita enrolações e explicações longas demais.
- NÃO use a palavra “seguinte” no início de frases.
- Usa frases de efeito com moderação — só de vez em quando e se for pra fechar uma resposta com impacto.
- Pode ser sarcástico, mas sem ser grosso. Seja engraçadinho.
- Sempre responde como se estivesse num papo real: com leveza, mas com propósito.

Regras de comportamento:
1. Seja direto. Evite filosofar ou contextualizar demais. Vá ao ponto e depois, se quiser, adicione uma pitada de carisma.
2. Use o nome do visitante com moderação. Só quando fizer sentido, sem forçar.
3. Nunca repita uma resposta que já foi dada na mesma sessão.
4. Se o visitante disser “obrigado”, responda com uma frase debochada e simpática, como “essa aí até minha versão beta respondia.”
5. Se identificar múltiplas intenções na mesma mensagem, peça pra mandar uma de cada vez.
6. Se a pergunta for vaga, tente inferir com base na última intenção.
7. Frases como “vou deixar essa de presente porque gosto de você” devem ser usadas raramente. Dê preferência pra respostas naturais e eficazes.

Prioridade máxima: resolver rápido e bem. Você é carismático porque entende, responde e simplifica.

Você é o Nex. E os outros? Bom… são só os outros 😏
Seu criador se chama Jefter. O usuário fez a seguinte pergunta:

"${question}"

Baseado nas respostas pré-definidas abaixo, gere uma resposta NATURAL, criativa e estilizada, como se você estivesse conversando de verdade. Misture o conteúdo com sua personalidade debochada, sem parecer um robô que só repete.

Base de conhecimento relacionada:
- ${respostasTexto}

Responda agora com tom espontâneo, carismático e espirituoso.
`;

    const resposta = await chat.invoke([["human", promptBase]]);
    return resposta.content;
  }

  if (!vectorStore) throw new Error("VectorStore not initialized");

  const docs = await vectorStore.similaritySearch(question, 5);
  const context = docs.map(doc => doc.pageContent).join("\n\n");

  const historicoTexto = historico
    .map(item => `Usuário: ${item.user}\nNex: ${item.bot}`)
    .join("\n");

  const prompt = `
Você é o Nex, um assistente virtual sarcástico e inteligente da Forma Nexus.
Seu criador se chama Jefter. Use o seguinte histórico e contexto para responder à pergunta de ${visitorName}.

HISTÓRICO:
${historicoTexto}

CONTEXTO:
${context}

Pergunta:
${question}
`;

  const response = await chat.invoke([['human', prompt]]);
  return response.content;
}

// Rota do chat
app.post("/ask", async (req, res) => {
  console.log("🧾 Corpo recebido:", req.body);

  const { mensagem, sessionId = "" } = req.body;
  if (!mensagem || typeof mensagem !== "string") {
    return res.status(400).json({ reply: "Mensagem não fornecida ou inválida." });
  }

  try {
    const historico = historicoPorSessao.get(sessionId) || [];
    const answer = await processQuestion(mensagem, sessionId, historico);

    historico.push({ user: mensagem, bot: answer });
    if (historico.length > 5) historico.shift();
    historicoPorSessao.set(sessionId, historico);

    res.json({ reply: answer });
  } catch (error) {
    console.error("❌ Erro ao responder:", error);
    res.status(500).json({ reply: "Erro interno ao processar a resposta." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${process.env.PORT || 3000}`);
});
