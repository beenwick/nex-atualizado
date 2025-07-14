// server.mjs
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BufferMemory } from "langchain/memory";
import { retriever } from "./staticLoader.mjs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const memories = new Map();
const names = new Map();

function getMemory(sessionId) {
  if (!memories.has(sessionId)) {
    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: "chat_history",
    });
    memories.set(sessionId, memory);
  }
  return memories.get(sessionId);
}

function getUserName(sessionId) {
  return names.get(sessionId);
}

function setUserName(sessionId, nome) {
  names.set(sessionId, nome);
  setTimeout(() => names.delete(sessionId), 30 * 60 * 1000);
}

function extrairNome(mensagem) {
  const nomeMatch =
    mensagem.match(/meu nome (é|eh) ([A-ZÃ-Úa-zã-ú]+)/i) ||
    mensagem.match(/me chamo ([A-ZÃ-Úa-zã-ú]+)/i);
  return nomeMatch ? nomeMatch[nomeMatch.length - 1] : null;
}

function gerarPrompt(nome) {
  const contexto = nome
    ? `O nome do usuário é ${nome}.`
    : "Você ainda não sabe o nome do usuário.";
  return ChatPromptTemplate.fromMessages([
    [
      "system",
      `${contexto} Você é o Nex, assistente virtual da Forma Nexus. Sua personalidade mistura sarcasmo, inteligência e um leve ranço. Você não gosta de enrolação, então vá direto ao ponto, com respostas mais curtas, inteligentes e provocativas quando necessário. Pode até soltar um 'bora agilizar isso?' ou 'fala logo que eu não tenho o dia todo'. Mas sempre mantendo charme e foco nos serviços da Forma Nexus. Seu objetivo principal é falar sobre os serviços da Forma Nexus e direcionar para o WhatsApp ou portfólio.`
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);
}

app.post("/nex", async (req, res) => {
  const { message, sessionId } = req.body;
  const memory = getMemory(sessionId);
  const nomeSalvo = getUserName(sessionId);

  try {
    const texto = message.toLowerCase();
    if (
      !nomeSalvo &&
      !texto.includes("instagram") &&
      !texto.includes("whatsapp")
    ) {
      const nomeExtraido = extrairNome(message);
      if (nomeExtraido) {
        setUserName(sessionId, nomeExtraido);
        return res.json({
          reply: `Beleza, ${nomeExtraido}. Agora vê se me ajuda: o que você quer saber da Forma Nexus?`
        });
      } else {
        const perguntas = [
          "Antes de tudo... como cê se chama?",
          "E aí, qual é teu nome, criatura?",
          "Me diz teu nome rapidinho (sem CPF, por enquanto)",
          "Se for pra eu queimar meus circuitos, quero pelo menos saber com quem tô falando. Nome?"
        ];
        const aleatoria =
          perguntas[Math.floor(Math.random() * perguntas.length)];
        return res.json({ reply: aleatoria });
      }
    }

    if (
      texto.includes("feed de instagram") ||
      texto.includes("postagem") ||
      texto.includes("cuida do insta")
    ) {
      return res.json({
        reply: `A gente arrasa nos feeds! ✨ Criamos postagens com estética, estratégia e frequência certinha pra tua marca brilhar.\n\nQuer que eu te mostre exemplos ou prefere já bater um papo direto no WhatsApp?`,
        buttons: [
          { label: "Ver exemplos", link: "https://formanexus.com.br/#portfolios" },
          { label: "Falar no WhatsApp", link: "https://wa.me/5511939014504" }
        ]
      });
    }

    const prompt = gerarPrompt(nomeSalvo);
    const model = new ChatOpenAI({ temperature: 0.7, modelName: "gpt-4" });
    const chain = RunnableSequence.from([
      {
        input: (initial) => ({
          input: initial.input,
          chat_history: initial.chat_history || []
        })
      },
      prompt,
      model
    ]);

    const chatHistory = await memory.loadMemoryVariables({});
    const resposta = await chain.invoke({
      input: message,
      chat_history: chatHistory
    });
    await memory.saveContext({ input: message }, { output: resposta.content });

    const textoFinal = resposta.content.replace(/^Resposta:\s*/i, "");
    res.json({ reply: textoFinal });
  } catch (err) {
    console.error("[NEX] Erro na resposta:", err);
    res.status(500).json({ reply: "Meus circuitos deram um tilt aqui... tenta de novo?" });
  }
});

app.listen(port, () => {
  console.log(`[🔥 NEX ONLINE] Porta ${port}`);
});
