import * as dotenv from "dotenv";
dotenv.config();

import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import fs from "fs";

const JSON_PATH = "nexBaseConhecimento.json";
const OUTPUT_DIR = "nex_vectorstore";

const gerar = async () => {
  const raw = fs.readFileSync(JSON_PATH, "utf-8");
  const data = JSON.parse(raw);

  const documents = data.map(item => new Document({
    pageContent: item.conteudo,
    metadata: {
      titulo: item.titulo,
      gatilhos: item.gatilhos
    }
  }));

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const docs = await splitter.splitDocuments(documents);

  const embeddings = new OpenAIEmbeddings();
  const store = await FaissStore.fromDocuments(docs, embeddings);
  await store.save(OUTPUT_DIR);
  console.log("✅ Embeddings gerados com sucesso a partir do JSON estruturado em", OUTPUT_DIR);
};

gerar();
