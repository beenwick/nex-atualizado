import fs from 'fs';
import { google } from 'googleapis';
import { Document } from 'langchain/document';
import { GoogleAuth } from 'google-auth-library';
import { TextLoader } from 'langchain/document_loaders/fs/text';

const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
const DOC_ID = '1QkEXe3R7FMd7edtcmK-ZLFAisnJHWFLH_-2kLdrwE8s';

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

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
  fs.writeFileSync(tempFilePath, textoExtraido, 'utf-8');

  // Usar loader da LangChain para transformar em documento
  const loader = new TextLoader(tempFilePath);
  const docsProcessados = await loader.load();

  return docsProcessados;
}
