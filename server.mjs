import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { carregarRetriever } from "./staticLoader.mjs";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const chat = new ChatOpenAI({
  modelName: "gpt-4",
  temperature: 0.7,
});

const prompt = ChatPromptTemplate.fromMessages([
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const chain = RunnableSequence.from([
  {
    chat_history: (input) => input.chat_history ?? [],
    input: (input) => input.input,
  },
  prompt,
  chat,
]);

const memory = new Map();

function extrairNome(frase) {
  const match = frase.match(/(?:meu nome é|me chamo|sou o|sou a|nome:?)\s*([\wÀ-ÿ]+)/i);
  if (match) return match[1];
  if (frase.trim().split(/\s+/).length === 1) return frase.trim();
  return null;
}

function gerarMensagemInicial() {
  const variações = [
    "E aí, quem tá aí do outro lado da tela?",
    "Se for pra eu queimar meus circuitos, quero pelo menos saber com quem tô falando. Nome?",
    "Antes de mais nada... quem é você, bonitão(a)?",
    "Diz aí seu nome, vai que a gente vira melhores amigos.",
    "Só me diga seu nome e eu já te conto meus segredos."
  ];
  return variações[Math.floor(Math.random() * variações.length)];
}

app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId é obrigatório." });
    }

    const contexto = memory.get(sessionId) || {
      nome: null,
      chat_history: [],
      createdAt: Date.now(),
      saudado: false
    };

    // Resetar a sessão após 30 minutos
    if (Date.now() - contexto.createdAt > 30 * 60 * 1000) {
      memory.delete(sessionId);
      return res.json({ response: gerarMensagemInicial() });
    }

    let resposta = "";

    // Se ainda não saudou e não tem nome
    if (!contexto.saudado && !contexto.nome) {
      const nome = extrairNome(message);
      if (nome) {
        contexto.nome = nome;
        contexto.saudado = true;
        resposta = `Beleza, ${nome}. Agora vê se me ajuda: o que você quer saber da Forma Nexus?`;
      } else {
        resposta = gerarMensagemInicial();
      }
    } else {
      try {
        const respostaIA = await chain.invoke({
          input: message,
          chat_history: contexto.chat_history,
        });

        resposta = respostaIA.content;

        contexto.chat_history.push(new HumanMessage(message));
        contexto.chat_history.push(new AIMessage(resposta));
      } catch (error) {
        console.error("[NEX] Erro na resposta:", error);
        resposta = "Meus circuitos deram um tilt aqui... tenta de novo?";
      }
    }

    memory.set(sessionId, contexto);

    res.json({ response: resposta });
  } catch (error) {
    console.error("[NEX] Erro geral:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.listen(port, () => {
  console.log(`[NEX] Servidor rodando na porta ${port}`);
});
