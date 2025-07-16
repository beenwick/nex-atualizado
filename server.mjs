
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

let vectorStore;

// Load vector store once at startup
async function initializeVectorStore() {
  try {
    vectorStore = await FaissStore.load(VECTORSTORE_PATH, new OpenAIEmbeddings());
    console.log("✅ VectorStore loaded successfully.");
  } catch (err) {
    console.error("❌ Error loading VectorStore:", err);
    process.exit(1);
  }
}

// Immediately initialize
initializeVectorStore();

// Utility to process a question using the pre-loaded vector store
async function processQuestion(question, visitorName = "visitante") {
  if (!vectorStore) throw new Error("VectorStore not initialized");

  const docs = await vectorStore.similaritySearch(question, 5);
  const context = docs.map(doc => doc.pageContent).join("\n\n");

  const chat = new ChatOpenAI({ temperature: 0.7, modelName: "gpt-3.5-turbo" });

  const prompt = `
Você é o Nex, um assistente virtual sarcástico e inteligente da Forma Nexus.
Seu criador se chama Jefter. Use o seguinte contexto para responder a pergunta de ${visitorName}:

CONTEXTO:
${context}

Pergunta:
${question}
`;

  const response = await chat.invoke([['human', prompt]]);
  return response.content;
}

// Endpoint uses pre-loaded vector store
app.post("/ask", async (req, res) => {
  console.log("🧾 Corpo recebido:", req.body);

  const { mensagem, historico = [], sessionId = "" } = req.body;
  if (!mensagem || typeof mensagem !== "string") {
    return res.status(400).json({ reply: "Mensagem não fornecida ou inválida." });
  }

  try {
    const answer = await processQuestion(mensagem, sessionId);
    res.json({ reply: answer });
  } catch (error) {
    console.error("❌ Erro ao responder:", error);
    res.status(500).json({ reply: "Erro interno ao processar a resposta." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor rodando em http://localhost:${process.env.PORT || 3000}`);
});
