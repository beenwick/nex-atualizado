// 1. Imports externos 
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { gerarVectorStoreDoGoogleDocs } from "./googleDocsLoader.mjs";
import { ChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RunnableSequence } from "@langchain/core/runnables";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
let retriever = null;

// Função que monta o vector store usando o conteúdo do Google Docs
async function gerarVectorStoreDoGoogleDocs() {
  const docs = await loadGoogleDoc();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const vectorStore = await MemoryVectorStore.fromDocuments(
    docs,
    new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY })
  );
  retriever = vectorStore.asRetriever();
  console.log(`[NEX] Cache vetorial atualizado com ${docs.length} pedaços.`);
}

// Inicializa antes de aceitar requisições
retriever = await gerarVectorStoreDoGoogleDocs();

const llm = new ChatOpenAI({ modelName: "gpt-4", temperature: 0.7 });

const chain = RunnableSequence.from([
  async (input) => {
    if (!retriever) throw new Error("Retriever não inicializado.");
    const relevantDocs = await retriever.getRelevantDocuments(input);
    return {
      input,
      context: relevantDocs.map((d) => d.pageContent).join("\n---\n"),
    };
  },
  llm,
]);

app.post("/nex", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ reply: "Mensagem ou sessão inválidos." });
  }
  try {
    const response = await chain.invoke(message);
    return res.json({ reply: response.content });
  } catch (err) {
    console.error("[NEX] Erro na resposta:", err);
    return res.status(500).json({ reply: "Erro interno ao responder." });
  }
});

app.listen(port, () => {
  console.log(`[NEX] Rodando na porta ${port}`);  
});
