import * as dotenv from "dotenv";
dotenv.config();

import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { TextLoader } from "langchain/document_loaders/fs/text";

const TXT_PATH = "nexBaseConhecimentoAtualizada.txt";
const OUTPUT_DIR = "nex_vectorstore";

const gerar = async () => {
  const loader = new TextLoader(TXT_PATH, { encoding: "utf-8" });
  const rawDocs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const docs = await splitter.splitDocuments(rawDocs);

  const embeddings = new OpenAIEmbeddings();
  const store = await FaissStore.fromDocuments(docs, embeddings);
  await store.save(OUTPUT_DIR);
  console.log("✅ Embeddings gerados com sucesso em", OUTPUT_DIR);
};

gerar();
