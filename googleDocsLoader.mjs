import { Document } from 'langchain/document';

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

  // ✅ Retorna diretamente como Document, sem gravar no disco
  return [new Document({ pageContent: textoExtraido })];
}
