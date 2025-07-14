import express from 'express';
import cors from 'cors';
import { ChatOpenAI } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import fs from 'fs';
import bodyParser from 'body-parser';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let baseConhecimento = '';
try {
  baseConhecimento = fs.readFileSync('./nexBaseConhecimento.mjs', 'utf8');
} catch (error) {
  console.error('Erro ao ler base de conhecimento:', error);
}

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
let docs = await splitter.createDocuments([baseConhecimento]);
const embeddings = new OpenAIEmbeddings();
const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

const chain = ConversationalRetrievalQAChain.fromLLM(
  new ChatOpenAI({ temperature: 0 }),
  vectorStore.asRetriever(),
  { returnSourceDocuments: false }
);

const sessoes = new Map();

function extrairNome(mensagem) {
  const padroes = [
    /meu nome é ([\wÀ-ÿ]+)/i,
    /me chamo ([\wÀ-ÿ]+)/i,
    /sou o ([\wÀ-ÿ]+)/i,
    /sou a ([\wÀ-ÿ]+)/i,
    /chama de ([\wÀ-ÿ]+)/i,
    /pode me chamar de ([\wÀ-ÿ]+)/i
  ];

  for (const padrao of padroes) {
    const resultado = mensagem.match(padrao);
    if (resultado && resultado[1]) {
      return resultado[1].charAt(0).toUpperCase() + resultado[1].slice(1).toLowerCase();
    }
  }

  return null;
}

app.post('/ask', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou sessionId ausente.' });
  }

  if (!sessoes.has(sessionId)) {
    sessoes.set(sessionId, { historico: [], nome: null, saudacaoFeita: false });
  }

  const sessao = sessoes.get(sessionId);

  const nomeExtraido = extrairNome(message);
  if (!sessao.nome && nomeExtraido) {
    sessao.nome = nomeExtraido;
    return res.json({
      reply: `Ah, então você é o famoso ${nomeExtraido}! Claro, como poderia esquecer? O que posso fazer por você hoje, além de rir das suas piadas sem graça?`
    });
  }

  if (!sessao.nome && !sessao.saudacaoFeita) {
    sessao.saudacaoFeita = true;
    return res.json({
      reply: 'Aí, camarada, antes de nos aprofundarmos nessa conversa, tenho uma pergunta pra você: Como posso te chamar, pra ficar tudo mais aconchegante por aqui?'
    });
  }

  const nome = sessao.nome;
  const contexto = nome ? `Fale com ${nome}: ${message}` : message;

  sessao.historico.push([message, '']);
  const resposta = await chain.call({ question: contexto, chat_history: sessao.historico });

  sessao.historico[sessao.historico.length - 1][1] = resposta.text;
  res.json({ reply: resposta.text });
});

app.listen(port, () => {
  console.log(`🔥 Nex Assistente está rodando em http://localhost:${port}`);
});