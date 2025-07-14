import fs from 'fs';
import { google } from 'googleapis';

const credentials = JSON.parse(
fs.readFileSync('./nex-docs-reader.json', 'utf-8')
);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/documents.readonly']
});

const docs = google.docs({ version: 'v1', auth });

const DOCUMENT_ID = '1QkEXe3R7FMd7edtcmK-ZLFAisnJHWFLH_-2kLdrwE8s';

export async function obterTextoDoGoogleDocs() {
  const res = await docs.documents.get({ documentId: DOCUMENT_ID });

  const textoPlano = res.data.body.content
    .map(b => b.paragraph?.elements?.map(e => e.textRun?.content).join(''))
    .filter(Boolean)
    .join('\n');

  return textoPlano;
}
