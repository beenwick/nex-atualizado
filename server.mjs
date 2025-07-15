// server.mjs
import dotenv from "dotenv";
dotenv.config();

import {
  limparMensagem,
  detectarNome,
  detectarIntencao,
  // temMultiplasPerguntas,  // mantido por compatibilidade, mas não usado para múltiplas perguntas
  personalizarResposta,
  respostaEhRuim
} from './utils.mjs';
import { instrucoesNex } from './instrucoesNex.mjs';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import bodyParser from 'body-parser';
import { ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { baseConhecimento } from './nexBaseConhecimento.mjs';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Função para detectar múltiplas perguntas relevantes (apenas por interrogação)
function temMultiplasPerguntasRelevantes(msg) {
  const count = (msg.match(/\?/g) || []).length;
  return count > 1;
}

let baseConhecimentoTexto = '';
try {
  baseConhecimentoTexto = fs.readFileSync('./nexBaseConhecimento.mjs', 'utf8');
} catch (err) {
  console.error('Erro ao ler base de conhecimento:', err);
}

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
const docs = await splitter.createDocuments([baseConhecimentoTexto]);
const embeddings = new OpenAIEmbeddings();
const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
const chat = new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0.7 });

const sessoes = new Map();

function mensagemEhVaga(msg) {
  const termosVagos = ['e o', 'sobre isso', 'e a', 'e o site', 'e o feed', 'e a identidade'];
  return termosVagos.some(t => msg.toLowerCase().includes(t)) || msg.trim().split(' ').length <= 3;
}

app.post('/ask', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou sessionId ausente.' });
  }

  if (!sessoes.has(sessionId)) {
    sessoes.set(sessionId, {
      historico: [],
      nome: null,
      saudacaoFeita: false,
      ultimaIntencao: null,
      temaForaCount: 0
    });
  }
  const sessao = sessoes.get(sessionId);

  const mensagemOriginal = message;
  const mensagemLimpa = limparMensagem(message);

  // Substituído: não bloqueia mais mensagens com múltiplas sentenças por pontos
  if (temMultiplasPerguntasRelevantes(mensagemOriginal)) {
    return res.json({ reply: 'Percebi várias perguntas; vou responder na ordem. Primeiro, vamos lá:' });
  }

  // Fluxo de nome e saudação
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
      return res.json({ reply: `Tamo junto, ${sessao.nome}. Pode mandar ver, tô aqui!` });
    }
    if (mensagemLimpa === sessao.nome.toLowerCase()) {
      return res.json({ reply: `Tô ligado que você é o ${sessao.nome}. Me diz o que você quer saber! 😎` });
    }
  }

  // Detectar intenção
  let intencoes = detectarIntencao(mensagemLimpa, baseConhecimento.intencaoUsuario);
  if (mensagemEhVaga(mensagemLimpa) && sessao.ultimaIntencao) {
    intencoes.push(sessao.ultimaIntencao);
  }

  // Intenção "orcamento" com botão
  if (intencoes.includes('orcamento')) {
    const texto = 'Os valores variam conforme o projeto, mas o melhor jeito de conseguir um orçamento direto, rápido e certeiro é falando com o criador. Pode clicar no botão abaixo pra abrir o WhatsApp e tirar essa dúvida:';
    const respostaFinal = personalizarResposta(texto, sessao.nome, false);
    sessao.historico.push({ user: mensagemOriginal, bot: respostaFinal });
    sessao.ultimaIntencao = 'orcamento';
    return res.json({
      reply: respostaFinal,
      button: `<a href="https://wa.me/5511939014504" target="_blank">Abrir WhatsApp</a>`
    });
  }

  // Respostas da base manual
  const respostaComposta = [];
  for (const chave of new Set(intencoes)) {
    const resp = baseConhecimento.intencaoUsuario[chave]?.resposta;
    if (resp && !sessao.historico.some(h => h.bot.trim() === resp.trim())) {
      respostaComposta.push(resp);
    }
  }
  if (respostaComposta.length) {
    sessao.ultimaIntencao = intencoes[intencoes.length - 1] || null;
    const texto = respostaComposta.join('\n\n');
    const respostaFinal = personalizarResposta(texto, sessao.nome, false);
    sessao.historico.push({ user: mensagemOriginal, bot: respostaFinal });
    return res.json({ reply: respostaFinal });
  }

  // Fallback via embeddings
  const retriever = vectorStore.asRetriever();
  const docsRelevantes = await retriever.getRelevantDocuments(mensagemLimpa);
  const contexto = docsRelevantes.map(d => d.pageContent).join('\n\n');

  const recentMsgs = sessao.historico.slice(-3).flatMap(h => [
    new HumanMessage(h.user),
    new SystemMessage(h.bot)
  ]);

  const messages = [
    new SystemMessage(instrucoesNex),
    new SystemMessage(`Base de conhecimento:\n${contexto}`),
    ...recentMsgs,
    new HumanMessage(mensagemLimpa)
  ];

  let respostaIA;
  try {
    respostaIA = await chat.call(messages);
  } catch (err) {
    console.error('Erro ao chamar IA:', err);
    return res.status(500).json({ reply: 'Tô meio bugado agora... tenta de novo mais tarde 😵‍💫' });
  }

  let texto = respostaIA.content.trim();

  // Controle de off-topic
  const foraRegex = /(forma nexus|site|feed|texto|portf[oó]lio|cria[cç][aã]o|servi[cç]o|instagram|blog|landing page|pre[cç]o|pacote|conte[úu]do)/i;
  const ehFora = !foraRegex.test(texto) && !foraRegex.test(mensagemLimpa);

  if (ehFora) {
    sessao.temaForaCount++;
    if (sessao.temaForaCount >= 2) {
      const lembrete = 'Aliás, só pra lembrar: meu foco aqui é te ajudar com os serviços da Forma Nexus — sites, feeds, textos e muito mais. Se quiser transformar isso num conteúdo profissional, clica no botão abaixo pra falar com o criador direto.';
      const lembreteFinal = personalizarResposta(lembrete, sessao.nome, false);
      sessao.temaForaCount = 0;
      return res.json({
        reply: lembreteFinal,
        button: `<a href=\"https://wa.me/5511939014504\" target=\"_blank\">Abrir WhatsApp</a>`
      });
    }
  } else {
    sessao.temaForaCount = 0;
  }

  if (respostaEhRuim(texto)) {
    const fallback = await chat.call([
      new SystemMessage(instrucoesNex),
      new HumanMessage(mensagemLimpa)
    ]);
    texto = fallback.content.trim();
  }

  const encerrar = intencoes.includes('agradecimento') || intencoes.includes('despedida');
  const respostaFinal = personalizarResposta(texto, sessao.nome, encerrar);

  sessao.ultimaIntencao = intencoes[0] || null;
  sessao.historico.push({ user: mensagemOriginal, bot: respostaFinal });
  return res.json({ reply: respostaFinal });
});

app.listen(port, () => console.log(`[NEX] Servidor rodando na porta ${port}`));
