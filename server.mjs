import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';

// Carrega variáveis de ambiente
dotenv.config();
const PORT = process.env.PORT || 3000;
const DOC_ID = process.env.GOOGLE_DOC_ID;

// Define caminhos necessários
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYFILE = path.join(__dirname, 'nex-docs-reader.json');

// Função para carregar e extrair texto do Google Docs
async function loadGoogleDoc() {
  const auth = new GoogleAuth({
    keyFile: KEYFILE,
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  });
  const client = await auth.getClient();
  const docsApi = google.docs({ version: 'v1', auth: client });
  const res = await docsApi.documents.get({ documentId: DOC_ID });
  const content = res.data.body.content || [];
  return content
    .map(block =>
      block.paragraph?.elements
        ?.map(el => el.textRun?.content || '')
        .join('') || ''
    )
    .join('\n');
}

// Inicializa o vetor de embeddings em memória
let vectorStore;
async function initVectorStore() {
  const rawText = await loadGoogleDoc();
  const docs = [new Document({ pageContent: rawText })];
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const splitDocs = await splitter.splitDocuments(docs);
  vectorStore = await MemoryVectorStore.fromDocuments(
    splitDocs,
    new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY })
  );
  console.log('✅ Vector store inicializado com embeddings do Google Docs');
}

// Aguarda a inicialização antes de subir o servidor
await initVectorStore();

// Configura o servidor Express
const app = express();
app.use(cors());
app.use(express.json());

// Rota /nex utiliza embeddings para contexto
app.post('/nex', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou ID inválidos.' });
  }
  try {
    // Busca similaridade e cria contexto
    const results = await vectorStore.similaritySearch(message, 4);
    const context = results.map(d => d.pageContent).join('\n---\n');

    // Chama a OpenAI com contexto e tom debochado
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

// Inicia o servidor na porta definida
app.listen(PORT, () => console.log(`✅ Nex rodando na porta ${PORT}`));
