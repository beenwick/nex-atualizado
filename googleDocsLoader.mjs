import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import { Document } from "langchain/document";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

const SCOPES = ["https://www.googleapis.com/auth/documents.readonly"];
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const DOC_ID = process.env.GOOGLE_DOC_ID;

export async function gerarVectorStoreDoGoogleDocs() {
  const auth = new GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const docs = google.docs({ version: "v1", auth: client });
  const res = await docs.documents.get({ documentId: DOC_ID });
  const content = res.data.body.content;

  const textoExtraido = content
    .map(element => element.paragraph?.elements?.map(e => e.textRun?.content).join("") || "")
    .join("\n")
    .trim();

  const documentos = [new Document({ pageContent: textoExtraido })];

  const vectorStore = await MemoryVectorStore.fromDocuments(documentos, new OpenAIEmbeddings());
  console.log(`[NEX] Cache vetorial atualizado com ${documentos.length} pedaços.`);
  return vectorStore.asRetriever(); // <-- RETORNA O RETRIEVER DIRETO
}
