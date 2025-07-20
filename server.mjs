import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { randomUUID } from 'crypto';
import { instrucoesNex } from "./instrucoesNex.mjs";
let estadoSessaoMap = {}; // cada visitante terá seu estado separado
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { detectarIntencao } from "./detectarIntencao.mjs";
import { normalizarInput } from "./normalizarInput.mjs";
import { deveAtivarModoPitch, gerarPitchDoNex } from "./pitchUtils.mjs";
import { buscarContextoRelevante } from "./buscarContextoRelevante.mjs";


dotenv.config();
import { enviarParaTelegram } from "./enviarTelegram.mjs";

const sessoes = {}; // Armazena os estados individuais de cada visitante

function gerarComentarioAleatorio() {
  const frases = [
    "Aliás... tô começando a gostar de você. Mas só um pouco. 🙄",
    "Se você mandar mais uma dessas, vou te considerar oficialmente interessante.",
    "Não sei se tô respondendo ou flertando. Enfim...",
    "Se continuar assim, vou cobrar só metade do valor. Mentira. Mas ia ser fofo.",
    "Meu circuito tá quase aquecendo de tanto carisma nessa conversa.",
    "Você tá me deixando confuso. Eu era só um bot, agora sou quase um fofoqueiro.",
    "Quer ver eu errar de propósito só pra você ficar mais tempo comigo?"
  ];

  const perguntasColeta = [
  "Fechado, mas me dá uma luz: você quer site, feed, texto, ou tudo junto e misturado?",
  "Qual estilo ou identidade você curte? Algo mais sério, divertido, minimalista?",
  "Pra quem é esse projeto? Me conta sobre o público que você quer atingir.",
  "Tem alguma referência ou algo que viu por aí que curtiu?",
  "E qual tom você quer usar? Tipo mais técnico, emocional, inspirador?",
];

  const index = Math.floor(Math.random() * frases.length);
  return frases[index];
}

const app = express();
app.use(cors({
  origin: ["https://formanexus.com.br", "https://www.formanexus.com.br", "http://localhost:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true
}));
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

const mensagens = [
  new SystemMessage(`${instrucoesNex.trim()}\n\n🔁 Reforçando: você é o Nex. Malandro, debochado e direto. Responda SEMPRE nesse estilo.`),
];
  if (Array.isArray(historico)) {
    historico.slice(-5).forEach(par => {
      mensagens.push(new HumanMessage(par.user));
      mensagens.push(new AIMessage(par.bot));
    });
  }

  mensagens.push(new HumanMessage(question));

  const response = await chat.call(mensagens);
  return response.text;
}



// Rota do chat
app.options("/ask", cors());
app.post("/ask", async (req, res) => {
  console.log("🧾 Corpo recebido:", req.body);

  let { mensagem, sessionId } = req.body;
  const sessionID = sessionId || randomUUID(); // Garante UUID se não vier do front

  // Inicializa o mapa de sessões se ainda não existir
  if (!estadoSessaoMap[sessionID]) {
    estadoSessaoMap[sessionID] = {};
  }
  let estadoSessao = estadoSessaoMap[sessionID];
estadoSessao.contadorInteracoes = (estadoSessao.contadorInteracoes || 0) + 1;

  if (!estadoSessao.etapa) {
    estadoSessao.etapa = "aguardando_nome";
  }


function gerarPerguntasColeta(respostaServico) {
  const tipo = respostaServico.toLowerCase();

  if (tipo.includes("site")) {
    return [
      "Show! Vai ser institucional, portfólio ou loja virtual?",
      "Já tem identidade visual ou vai deixar essa missão pra mim?",
      "Quantas páginas você imagina?",
      "Prefere um tom mais sério, moderno ou malemolente como eu?",
      "É pra marca pessoal, empresa ou outro rolê?"
    ];
  }

  if (/(post|posts|feed|feeds)/.test(tipo)) {
    return [
      "Beleza! Já tem identidade visual ou tá tudo por minha conta?",
      "Vai querer carrossel, reels, stories ou tudo junto?",
      "Quantas postagens você precisa?",
      "Prefere um estilo mais clean, coloridão ou zoeiro?",
      "O conteúdo é pra empresa, perfil pessoal ou outro tipo de página?"
    ];
  }

  if (
    tipo.includes("texto") ||
    tipo.includes("copy") ||
    tipo.includes("redação") ||
    tipo.includes("artigo") ||
    tipo.includes("blog") ||
    tipo.includes("acadêmico")
  ) {
    return [
      "Fechou! Esse texto é pra onde? Site, blog, trabalho acadêmico ou outro rolê?",
      "Já tem algum rascunho, referência ou quer que eu comece do zero sideral?",
      "Quantas palavras ou páginas você imagina?",
      "Quer um tom mais formal, explicativo ou algo mais descolado e fluido?",
      "É pra empresa, faculdade, projeto pessoal... ou missão alienígena?"
    ];
  }

  if (
    tipo.includes("pacote") ||
    tipo.includes("posts") ||
    tipo.includes("postagens") ||
    tipo.includes("combo")
  ) {
    return [
      "Beleza! Vai querer combo de quantos posts? Tipo 3, 6, 9...?",
      "Já tem identidade visual ou deixo o feed lindão do meu jeito mesmo?",
      "Prefere foco em carrossel, reels, stories ou tudo junto e batendo palma?",
      "O conteúdo é informativo, promocional ou mais estético/aspiracional?",
      "Pra empresa, marca pessoal ou perfil que quer virar tendência?"
    ];
  }

  if (
    tipo.includes("roteiro") ||
    tipo.includes("vídeo") ||
    tipo.includes("tiktok") ||
    tipo.includes("reels") ||
    tipo.includes("shorts")
  ) {
    return [
      "Top! O vídeo vai ser estilo explicação, trend, humor ou storytelling cósmico?",
      "Quantos roteiros você precisa? Só um ou já quer pacote intergaláctico?",
      "Tem referência ou quer que eu crie a ideia do zero absoluto?",
      "Qual o tom: didático, misterioso, divertido ou debochado tipo eu?",
      "É pra qual nicho ou público? Isso me ajuda a calibrar a nave."
    ];
  }

  return [
    "Demorô! Tem identidade visual ou quer que eu crie?",
    "Qual o volume total do projeto? Tipo número de páginas ou textos.",
    "Estilo mais sério, divertido ou espiritualizado?",
    "É pra quem? Uma empresa, perfil pessoal, ou o quê?",
    "Mais alguma exigência cósmica ou a missão tá dada?"
  ];
}

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
const nomeVisitante = estadoSessao.nome || "visitante";

const intencoesDetectadas = detectarIntencao(mensagem);
const intencaoDetectada = intencoesDetectadas?.[0]?.intencao || null;

// Garante que a memória de intenções exista na sessão
if (!estadoSessao.intencoesRespondidas) {
  estadoSessao.intencoesRespondidas = [];
}

const jaRespondeuEssa = estadoSessao.intencoesRespondidas.includes(intencaoDetectada);

if (intencaoDetectada && jaRespondeuEssa) {
  return res.json({
    reply: `Cê tá de sacanagem, né? Já te falei sobre isso, ${nomeVisitante}. Quer que eu desenhe de novo ou vai prestar atenção dessa vez?`
  });
} else if (intencaoDetectada && nexBase[intencaoDetectada]) {
  const blocoBase = nexBase[intencaoDetectada];
  const contexto = blocoBase.respostas.join(" ");
  const respostaGPT = await chat.call([
    new SystemMessage(instrucoesNex),
    new HumanMessage(`Use esse conhecimento como referência, mas responde com seu jeitão debochado, tá?\nBase: ${contexto}\nMensagem: ${mensagem}`)
  ]);

  // Marca essa intenção como respondida
// Marca essa intenção como respondida
estadoSessao.intencoesRespondidas.push(intencaoDetectada);

let resposta = respostaGPT.text;

// Mini pitada de humor a cada 5 interações
if (estadoSessao.contadorInteracoes % 5 === 0) {
  resposta += `\n\n${gerarComentarioAleatorio()}`;
}


return res.json({ reply: resposta });
}


if (estadoSessao.coleta && estadoSessao.modoColeta) {
  const etapaAtual = estadoSessao.coleta.etapa;

  const tipoServico = estadoSessao.coleta.respostas[0];
  const perguntasColeta = tipoServico ? gerarPerguntasColeta(tipoServico) : [];

  // Armazena resposta da etapa atual
  if (etapaAtual === 0) {
    let servicoBruto = mensagem.toLowerCase();
    servicoBruto = servicoBruto
      .replace("quero ", "")
      .replace("preciso de ", "")
      .replace("fazer ", "")
      .replace("criar ", "")
      .replace("um ", "")
      .replace("uma ", "")
      .trim();
    estadoSessao.coleta.respostas[etapaAtual] = servicoBruto;
  } else {
    estadoSessao.coleta.respostas[etapaAtual] = mensagem;
  }

  // Verifica se deve seguir perguntando ou finalizar
  // 🧠 Verifica se a resposta atual indica fim do briefing
const respostaVisitante = mensagem;
const respostaBaixa = respostaVisitante.toLowerCase();
const sinaisDeEncerramento = [
  "acho que é isso",
  "pode mandar",
  "pode repassar",
  "tá bom assim",
  "pode passar pra equipe",
  "já falei tudo",
  "é isso"
];
const querEncerrar = sinaisDeEncerramento.some(sinal => respostaBaixa.includes(sinal));

// ⚡ Se já respondeu bastante e quiser encerrar, oferece o WhatsApp
if (
  estadoSessao.coleta.respostas.length >= 4 &&
  !estadoSessao.contatoOferecido &&
  querEncerrar
) {
  estadoSessao.contatoOferecido = true;

  return res.json({
    reply: "Perfeito! Já juntei tudo aqui. Jefter vai te chamar no WhatsApp rapidinho: https://wa.me/5511949014504 — e diz que o Nex te passou tudo 😎",
    sessionID
  });
}
// 🧠 Caso tenha respondido tudo e o Nex ainda não ofereceu contato
if (
  etapaAtual + 1 >= perguntasColeta.length &&
  !estadoSessao.contatoOferecido
) {
  estadoSessao.contatoOferecido = true;

if (etapaAtual + 1 < perguntasColeta.length) {
  estadoSessao.coleta.etapa++;

  // 🧠 Ativa o modo pitch se já tiver respostas detalhadas suficientes
  if (deveAtivarModoPitch(estadoSessao.coleta)) {
    const pitch = gerarPitchDoNex(estadoSessao.coleta.respostas);
    return res.json({ reply: pitch, sessionID });
  }

  return res.json({ reply: perguntasColeta[etapaAtual + 1], sessionID });
}

// 🧠 Caso tenha respondido tudo e o Nex ainda não ofereceu contato
if (!estadoSessao.contatoOferecido) {
  estadoSessao.contatoOferecido = true;

  return res.json({
    reply: "Fechou, já coletei tudo que precisava! Agora vou repassar pro Jefter e ele vai te chamar no WhatsApp: https://wa.me/5511949014504 — fala que o Nex te passou tudo e garante aquele atendimento de respeito 🚀",
    sessionID
  });
}

// 🧾 Todas as perguntas foram respondidas — fecha a coleta
return res.json({
  reply: "Fechou, já coletei tudo que precisava! Agora vou repassar pro Jefter e ele vai te chamar no WhatsApp: https://wa.me/5511949014504 — fala que o Nex te passou tudo e garante aquele atendimento de respeito 🚀",
  sessionID
});

}


  // Finaliza coleta
  const r = estadoSessao.coleta.respostas;
  if (r.length >= perguntasColeta.length) {
    estadoSessao.modoColeta = false;
    estadoSessao.prontoPraEnviar = true;
    estadoSessao.fasePosColeta = true;
    estadoSessao.ultimoBriefingTextoLivre = mensagem;
    return res.json({ reply: "Fechou, chefia! Agora manda aí no seu estilo: me descreve esse projeto rapidinho que eu jogo direto pro Jefter. Capricha na ideia, hein 😏" });
  }
}
if (intencaoDetectada === "coleta_servico") {
  if (!estadoSessao.coleta) {
    estadoSessao.coleta = {
      etapa: 0,
      respostas: []
    };
  }

  estadoSessao.modoColeta = true;

  // Salva a resposta anterior (exceto se for a primeira vez)
  if (estadoSessao.coleta.etapa > 0) {
    estadoSessao.coleta.respostas.push(mensagem);
  }

  // Verifica se já respondeu tudo
  if (estadoSessao.coleta.respostas.length >= perguntasColeta.length) {
    estadoSessao.modoColeta = false;
    estadoSessao.prontoPraEnviar = true;
    estadoSessao.fasePosColeta = true;
    estadoSessao.ultimoBriefingTextoLivre = mensagem;
    return res.json({
      reply: "Fechou, chefia! Agora manda aí no seu estilo: me descreve esse projeto rapidinho que eu jogo direto pro Jefter. Capricha na ideia, hein 😏"
    });
  }

  // ⚡ Se já respondeu bastante, ofereça contato direto
  if (
    estadoSessao.coleta.respostas.length >= 4 &&
    !estadoSessao.contatoOferecido
  ) {
    estadoSessao.contatoOferecido = true;

    return res.json({
      reply:
        "Já tenho bastante coisa aqui! Quer que eu passe esse briefing pro Jefter e ele te chama no WhatsApp? Só clicar aqui ó: https://wa.me/5511949014504 — diz que o Nex te mandou 😎",
      sessionID
    });
  }

  // Puxa próxima pergunta da lista
  const perguntaAtual = perguntasColeta[estadoSessao.coleta.etapa];
  estadoSessao.coleta.etapa++;

  return res.json({
    reply: perguntaAtual
  });
}

if (estadoSessao.fasePosColeta) {
    estadoSessao.fasePosColeta = false;
    return res.json({
      reply: "Prontinho, disparei ao meu criador suas ideias. Quer falar sobre outra coisa ou posso voltar a dormir?"
    });
  }
let historico = estadoSessao.historico || [];
  const contextoRelacionado = await buscarContextoRelevante(mensagem);

  const chat = new ChatOpenAI({ temperature: 0.7, modelName: "gpt-3.5-turbo" });

const respostaFinal = await chat.call([
  new SystemMessage(instrucoesNex),
  new HumanMessage(`Se liga, essa é a vibe do conteúdo da Forma Nexus que pode te ajudar:\n\n${contextoRelacionado}\n\nAgora responde isso aqui com seu jeitão:\n${mensagem}`)
]);

const respostaLimpa = limparPrefixos(respostaFinal.text);
return res.json({ reply: respostaLimpa });


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
    await enviarParaTelegram(estadoSessao.nome, estadoSessao.email, mensagem, respostaFinal);

historico.push({ user: mensagem, bot: respostaFinal });
    if (historico.length > 5) historico.shift();
    historicoPorSessao.set(sessionID, { estado: estadoSessao, historico });
salvarSessoes();

    res.json({ reply: respostaFinal, sessionID });
  } catch (error) {
    console.error("❌ Erro ao responder:", error);
    res.status(500).json({ reply: "Erro interno ao processar a resposta." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${process.env.PORT || 3000}`);
});