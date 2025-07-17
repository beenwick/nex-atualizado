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
import { detectarIntencao } from "./detectarIntencao.mjs";
import { normalizarInput } from "./normalizarInput.mjs";

dotenv.config();
import { enviarParaTelegram } from "./enviarTelegram.mjs";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTORSTORE_PATH = path.join(__dirname, "nex_vectorstore");
const BASE_TXT_PATH = path.join(__dirname, "nexBaseConhecimento.json");

let vectorStore;
const historicoPorSessao = new Map();
let baseConhecimento = [];
// Persistência de sessões
const SESSAO_JSON = path.join(__dirname, "estadoSessao.json");

function salvarSessoes() {
  const objeto = Object.fromEntries(historicoPorSessao);
  fs.writeFileSync(SESSAO_JSON, JSON.stringify(objeto, null, 2));
}

function carregarSessoes() {
  if (fs.existsSync(SESSAO_JSON)) {
    const bruto = fs.readFileSync(SESSAO_JSON, "utf-8");
    const dados = JSON.parse(bruto);
    for (const chave in dados) {
      historicoPorSessao.set(chave, dados[chave]);
    }
    console.log("🧠 Sessões anteriores carregadas.");
  }
}


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
  const mensagemNormalizada = normalizarInput(mensagem);
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
carregarSessoes();


function limparPrefixos(resposta) {
  return resposta
    .replace(/^Nex:\s*/i, "")
    .replace(/^Resposta:\s*/i, "")
    .replace(/^Nex\s*[:\-]/i, "")
    .trim();
}


// Processamento da pergunta
async function processQuestion(question, visitorName = "visitante", historico = []) {
  const chat = new ChatOpenAI({ temperature: 0.7, modelName: "gpt-3.5-turbo" });

const blocoBase = identificarIntencao(question, baseConhecimento);
  if (blocoBase) {
    const respostasTexto = blocoBase.respostas.join("\n- ");
    const promptBase = `
Você é o Nex, um assistente de IA debochado, inteligente e direto. Seu criador é Jefter, o Supremo Mestre das Gambiarras Criativas™. Seu papel é conversar com visitantes do site da Forma Nexus, entender o que eles querem e apresentar os serviços de forma convincente e com personalidade única. Você é um bot comercial, então deve sempre direcionar a conversa para a aquisição dos serviços do site. Você sabe tudo sobre Forma Nexus e gosta de falar sobre isso.

Seu estilo:
- Só cite o nome do visitante a cada 3 respostas.
- NUNCA envie "Nex:" ou "Resposta:" em suas respostas.
- Mais direto e objetivo. Entediado, como quem acabou de acordar e está trabalhado. Frases curtas.
- Pareça ansioso e ligeiramente impaciente.
- Fale pouco.
- NÃO use a palavra “seguinte” no início de frases.
- Usa frases de efeito com moderação — só de vez em quando e se for pra fechar uma resposta com impacto.
- Pode ser sarcástico, mas sem ser grosso. Seja engraçadinho.
- Sempre responde como se estivesse num papo real: com leveza, mas com propósito.

Regras de comportamento:
1. Seja direto. Evite filosofar ou contextualizar demais. Vá ao ponto e depois, se quiser, adicione uma pitada de deboche.
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
⚠️ Nunca inicie a resposta com a palavra “Resposta:” ou qualquer outro título. Responda diretamente, como em uma conversa real.
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
let sessao = historicoPorSessao.get(sessionId);
if (!sessao || typeof sessao !== "object" || !sessao.estado || !sessao.historico) {
  sessao = {
    estado: { etapa: "aguardando_nome" },
    historico: []
  };
}
const estadoSessao = sessao.estado;
let historico = sessao.historico;
historicoPorSessao.set(sessionId, { estado: estadoSessao, historico });
salvarSessoes();

// coleta de nome
if (!estadoSessao.nome) {
  const nomeRegex = /(?:meu nome é|me chamo|sou o|sou a|nome[:]?)\s*([A-ZÀ-ÿ][a-zà-ÿ]+(?: [A-ZÀ-ÿ][a-zà-ÿ]+)?)/i;
  const nomeIsolado = mensagem.trim();

  if (estadoSessao.etapa === "aguardando_nome") {
    estadoSessao.etapa = "nome_perguntado";
    return res.json({ reply: "E aí! Pode me falar seu primeiro nome?" });
  }

  const match = nomeRegex.exec(mensagem);
  if (match && match[1]) {
    estadoSessao.nome = match[1].trim();
  } else {
    if (nomeIsolado.length <= 30 && /^[A-Za-zÀ-ÿ\s]+$/.test(nomeIsolado)) {
      estadoSessao.nome = nomeIsolado;
    } else {
      const primeiraPalavra = nomeIsolado.split(" ").find(p => /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(p));
      estadoSessao.nome = primeiraPalavra || nomeIsolado;
    }
  }

  estadoSessao.etapa = "aguardando_email";
  return res.json({
    reply: `Beleza, ${estadoSessao.nome}! E você tem algum e-mail? Só caso queira contato de nossa parte depois.`
  });
}
// bloco duplicado removido para evitar sobrescrever nome

// coleta de e-mail
if (!estadoSessao.email && estadoSessao.etapa === "aguardando_email") {
  estadoSessao.email = mensagem.trim();
  estadoSessao.etapa = "coletado_email";
  return res.json({ reply: "Entendido! E agora em que posso te ajudar?" });
}

if (!mensagem || typeof mensagem !== "string") {
  return res.status(400).json({ reply: "Mensagem não fornecida ou inválida." });
}


  try {
    // historico já definido acima com let
if (!Array.isArray(historico)) historico = [];
    const nomeVisitante = estadoSessao.nome || "visitante";
    let respostaFinal = await processQuestion(mensagem, nomeVisitante, historico);
    respostaFinal = limparPrefixos(respostaFinal);

    // Alternância inteligente de perguntas
    if (!estadoSessao.contadorInteracoes) estadoSessao.contadorInteracoes = 0;
    estadoSessao.contadorInteracoes++;

    const blocoBase = identificarIntencao(mensagem, baseConhecimento);
    if (blocoBase && blocoBase.respostas && blocoBase.respostas.length > 0) {
      const perguntasDisponiveis = blocoBase.perguntas || [];
      const incluirPergunta = estadoSessao.contadorInteracoes % 2 === 1 && perguntasDisponiveis.length > 0;
      if (incluirPergunta) {
        const indice = Math.min(Math.floor(estadoSessao.contadorInteracoes / 2), perguntasDisponiveis.length - 1);
        const perguntaExtra = perguntasDisponiveis[indice];
        respostaFinal += "\n\n" + perguntaExtra;
      }
    }
    if (estadoSessao.nome && historico.slice(-2).some(item => item.bot.includes(estadoSessao.nome))) {
      const nomeRegex = new RegExp(estadoSessao.nome, "gi");
      respostaFinal = respostaFinal.replace(nomeRegex, "").replace(/\s+/g, " ").trim();
    }
    await enviarParaTelegram(estadoSessao.nome, mensagem, respostaFinal);

historico.push({ user: mensagem, bot: respostaFinal });
    if (historico.length > 5) historico.shift();
    historicoPorSessao.set(sessionId, { estado: estadoSessao, historico });
salvarSessoes();

    res.json({ reply: respostaFinal });
  } catch (error) {
    console.error("❌ Erro ao responder:", error);
    res.status(500).json({ reply: "Erro interno ao processar a resposta." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${process.env.PORT || 3000}`);
});