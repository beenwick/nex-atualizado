// server.mjs

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleDocsLoader } from './googleDocsLoader.mjs';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';
import { VectorStoreRetrieverMemory } from 'langchain/memory';

// Config
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

let retriever; // Cache global de memória vetorial

async function gerarVectorStoreDoGoogleDocs() {
  try {
    const loader = new GoogleDocsLoader({
      documentId: process.env.GOOGLE_DOC_ID,
    });

    const docs = await loader.load();
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

// Atualiza a cada 30 minutos (1800000 ms)
await gerarVectorStoreDoGoogleDocs();
setInterval(gerarVectorStoreDoGoogleDocs, 30 * 60 * 1000);

const memory = new VectorStoreRetrieverMemory({
  retriever,
  memoryKey: 'chat_history',
});

const model = new ChatOpenAI({
  modelName: 'gpt-4',
  temperature: 0.7,
});

const chain = RunnableSequence.from([
  async (input) => {
    const context = await memory.loadMemoryVariables({ prompt: input });
    return {
      input,
      chat_history: context.chat_history,
    };
  },
  model,
]);

app.post('/nex', async (req, res) => {
  const { message, sessionId } = req.body;
  try {
    const resposta = await chain.invoke(message);
    await memory.saveContext({ input: message }, { output: resposta.content });
    res.json({ reply: resposta.content });
  } catch (error) {
    console.error('[NEX] Erro ao processar mensagem:', error);
    res.status(500).json({ reply: 'Erro ao responder. Tente novamente mais tarde.' });
  }
});

app.listen(port, () => {
  console.log(`[NEX] Servidor rodando na porta ${port}`);
});
