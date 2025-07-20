import { OpenAIEmbeddings } from "@langchain/openai"; // ✅ CERTA
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { loadQARefineChain } from "langchain/chains";
import { readFile } from "fs/promises";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { ChatOpenAI } from "@langchain/openai"; // ✅ forma correta a partir de 0.1.16+
import path from "path";

const filePath = path.resolve("./nexBaseConhecimento.json");

export async function buscarContextoRelevante(mensagem) {
  const fileData = await readFile(filePath, "utf-8");
  const jsonData = JSON.parse(fileData);

  const conteudoBase = Object.values(jsonData)
.map((b) => Array.isArray(b.respostas) ? b.respostas.join(" ") : "")
    .join("\n\n");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 60,
  });

  const docs = await splitter.createDocuments([conteudoBase]);

  const vectorStore = await MemoryVectorStore.fromDocuments(
    docs,
    new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  );

  const resultados = await vectorStore.similaritySearch(mensagem, 3);
  return resultados.map((r) => r.pageContent).join("\n\n");
}
