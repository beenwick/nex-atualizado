// 1. Imports externos
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { gerarVectorStoreDoGoogleDocs } from "./googleDocsLoader.mjs";
import { ChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
let retriever = null;

async function gerarVectorStoreDoGoogleDocs() {
  try {
    const docs = await loadGoogleDoc();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.splitDocuments(docs);

    const vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      new OpenAIEmbeddings()
    );

    retriever = vectorStore.asRetriever();
    console.log(`[NEX] Cache vetorial atualizado com ${splitDocs.length} pedaços.`);
  } catch (error) {
    console.error('[NEX] Erro ao atualizar vector store:', error);
  }
}

await gerarVectorStoreDoGoogleDocs();

const llm = new ChatOpenAI({ modelName: 'gpt-4', temperature: 0.7 });

const chain = RunnableSequence.from([
  async (input) => {
    if (!retriever) throw new Error('Retriever não inicializado.');
    const relevantDocs = await retriever.getRelevantDocuments(input);
    return {
      input,
      context: relevantDocs.map((doc) => doc.pageContent).join('\n'),
    };
  },
  llm,
]);

app.post('/nex', async (req, res) => {
  const pergunta = req.body.pergunta;
  try {
    const resposta = await chain.invoke(pergunta);
    res.json({ resposta: resposta.content });
  } catch (err) {
    console.error('[NEX] Erro na resposta:', err);
    res.status(500).json({ erro: 'Erro ao gerar resposta.' });
  }
});

app.listen(port, () => {
  console.log(`[NEX] Rodando em http://localhost:${port}`);
});
