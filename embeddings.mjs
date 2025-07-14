import 'dotenv/config';
import fs from 'fs';
import { Document } from 'langchain/document';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { loadGoogleDoc } from './googleDocsLoader.mjs'; // ⬅️ agora usa o loader certo

async function generateEmbeddings() {
  console.log('📄 Carregando conteúdo do Google Docs...');
  const rawText = await loadGoogleDoc();

  const docs = [new Document({ pageContent: rawText })];
  console.log('✂️ Dividindo o texto em pedaços...');

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splitDocs = await splitter.splitDocuments(docs);

  console.log('🧠 Gerando embeddings com OpenAI...');
  const vectorStore = await MemoryVectorStore.fromDocuments(
    splitDocs,
    new OpenAIEmbeddings()
  );

  console.log('💾 Salvando vetores localmente...');
  const vectors = vectorStore.memoryVectors;

  fs.writeFileSync('nex-embeddings.json', JSON.stringify(vectors, null, 2));
  console.log('✅ Embeddings gerados e salvos com sucesso!');
}

generateEmbeddings();
