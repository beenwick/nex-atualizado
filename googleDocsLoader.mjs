import dotenv from 'dotenv';
dotenv.config(); // necessário para rodar localmente

import fs from 'fs';
import { google } from 'googleapis';
import { Document } from 'langchain/document';
import { GoogleAuth } from 'google-auth-library';
import { TextLoader } from 'langchain/document_loaders/fs/text';

const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
const DOC_ID = process.env.GOOGLE_DOC_ID;

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

export async function loadGoogleDoc() {
  const auth = new GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const docs = google.docs({ version: 'v1', auth: client });

  const res = await docs.documents.get({ documentId: DOC_ID });
  const content = res.data.body.content;

  const textoExtraido = content
    .map(element => element.paragraph?.elements?.map(e => e.textRun?.content).join('') || '')
    .join('\n')
    .trim();

  // Salvar texto em um arquivo temporário
  const tempFilePath = './docs/google-doc-temp.txt';

  // Usar loader da LangChain para transformar em documento
  const loader = new TextLoader(tempFilePath);
  const docsProcessados = await loader.load();

  return docsProcessados;
}
