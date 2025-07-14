
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
  const match = frase.match(/(?:meu nome é|me chamo|sou o|sou a|nome[:\s]*)([A-Za-zÀ-ÿ]+)/i);
  return match ? match[1] : null;
}

app.post("/ask", async (req, res) => {
  const { message, sessionId } = req.body;
  const nomeDetectado = extrairNome(message);

  if (nomeDetectado) {
    memory.set(sessionId, [
      ...(memory.get(sessionId) || []),
      new HumanMessage(message),
      new AIMessage(`Prazer, ${nomeDetectado}! Anotado aqui 💜`)
    ]);
    return res.json({ reply: `Prazer, ${nomeDetectado}! Anotado aqui 💜` });
  }

  const retriever = await carregarRetriever();
  const docs = await retriever.getRelevantDocuments(message);
  const contexto = docs.map(doc => doc.pageContent).join("\n\n");

  const response = await chain.invoke({
    input: message,
    chat_history: memory.get(sessionId) || [],
    contexto,
  });

  const resposta = response?.content || "Hmm... não consegui pensar em nada agora 🤔";

  memory.set(sessionId, [
    ...(memory.get(sessionId) || []),
    new HumanMessage(message),
    new AIMessage(resposta)
  ]);

  res.json({ reply: resposta });
});

app.listen(port, () => {
  console.log(`[NEX] Servidor rodando na porta ${port}`);
});
