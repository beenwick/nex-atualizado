import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';

dotenv.config();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMBEDDINGS_DIR = path.join(__dirname, 'embeddings');

let vectorStore;

async function initVectorStore() {
  try {
    vectorStore = await MemoryVectorStore.load(
      EMBEDDINGS_DIR,
      new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY })
    );
    console.log('✅ Vector store carregado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao carregar vector store:', error);
  }
}

await initVectorStore();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/nex', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou ID inválidos.' });
  }

  try {
    const results = await vectorStore.similaritySearch(message, 4);
    const context = results.map(d => d.pageContent).join('\n---\n');

    const chat = new ChatOpenAI({
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    const systemMsg = {
      role: 'system',
      content: 'Você é o Nex, assistente virtual debochado e carismático. Use o contexto para responder.'
    };

    const userMsg = {
      role: 'user',
      content: `Contexto:\n${context}\n\nPergunta: ${message}`
    };

    const response = await chat.call([systemMsg, userMsg]);
    return res.json({ reply: response.text });

  } catch (err) {
    console.error('Erro no endpoint /nex:', err);
    return res.status(500).json({ reply: 'Falhei aqui, vida... erro interno.' });
  }
});

app.listen(PORT, () => console.log(`✅ Nex rodando na porta ${PORT}`));
