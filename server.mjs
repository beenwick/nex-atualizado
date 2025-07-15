import express from 'express';
import cors from 'cors';
import fs from 'fs';
import bodyParser from 'body-parser';
import { ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { limparMensagem, detectarNome } from './utils.mjs';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Carrega a base de conhecimento
let baseConhecimento = '';
try {
  baseConhecimento = fs.readFileSync('./nexBaseConhecimento.mjs', 'utf8');
} catch (err) {
  console.error('Erro ao ler base de conhecimento:', err);
}

// Prepara o vector store
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
const docs = await splitter.createDocuments([baseConhecimento]);
const embeddings = new OpenAIEmbeddings();
const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

// Configura o chatbot
const chat = new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0.7 });

// Prompt de sistema com a personalidade do Nex
const instrucoesNex = `... (mantido conforme original)`;

// Gerencia sessões
const sessoes = new Map();

app.post('/ask', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou sessionId ausente.' });
  }

  if (!sessoes.has(sessionId)) {
    sessoes.set(sessionId, { historico: [], nome: null, saudacaoFeita: false });
  }
  const sessao = sessoes.get(sessionId);

  const mensagemOriginal = message;
  const mensagemLimpa = limparMensagem(message);

  if (!sessao.nome) {
    const nome = detectarNome(mensagemOriginal);
    if (nome) {
      sessao.nome = nome;
      return res.json({ reply: `Beleza, ${nome}, agora que sei seu nome, vamos ao que interessa. O que manda?` });
    }
    if (!sessao.saudacaoFeita) {
      sessao.saudacaoFeita = true;
      return res.json({ reply: 'Aí, camarada, antes de nos aprofundarmos, me diz: como posso te chamar aqui no chat?' });
    }
  } else {
    const nomeRepetido = detectarNome(mensagemOriginal);
    if (nomeRepetido && nomeRepetido.toLowerCase() === sessao.nome.toLowerCase()) {
      return res.json({ reply: `Calma aí, ${sessao.nome}, tô meio lerdo hoje, já entendi.` });
    }
  }

  const retriever = vectorStore.asRetriever();
  const docs = await retriever.getRelevantDocuments(mensagemLimpa);
  const contexto = docs.map(d => d.pageContent).join("\n\n");

  const messages = [
    new SystemMessage(instrucoesNex),
    new SystemMessage(`Base de conhecimento:\n${contexto}`),
    new HumanMessage(mensagemLimpa)
  ];

  let resposta;
  try {
    resposta = await chat.call(messages);
  } catch (err) {
    console.error('Erro ao chamar IA:', err);
    return res.status(500).json({ reply: 'Tô meio bugado agora... tenta de novo mais tarde 😵‍💫' });
  }

  let texto = resposta.content.trim();
  const respostasGenéricas = ['não entendi', 'pode repetir', 'tenta em português'];
  const isRespostaGenerica = respostasGenéricas.some(r => texto.toLowerCase().includes(r));
  if (isRespostaGenerica && /\bia\b/i.test(mensagemLimpa) && /chatbot/i.test(mensagemLimpa)) {
    texto = `Boa pergunta! IA é a tecnologia por trás da inteligência — tipo eu. Chatbot é a interface que conversa com você. Com IA, ele fica menos burro. 😉`;
  }

  sessao.historico.push({ user: mensagemOriginal, bot: texto });
  return res.json({ reply: texto });
});

app.listen(port, () => console.log(`[NEX] Servidor rodando na porta ${port}`));
