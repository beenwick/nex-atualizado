import {
  limparMensagem,
  detectarNome,
  detectarIntencao,
  temMultiplasPerguntas,
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
    sessoes.set(sessionId, { historico: [], nome: null, saudacaoFeita: false, ultimaIntencao: null });
  }
  const sessao = sessoes.get(sessionId);

  const mensagemOriginal = message;
  const mensagemLimpa = limparMensagem(message);

  if (temMultiplasPerguntas(mensagemOriginal)) {
    return res.json({ reply: 'Você mandou várias coisas juntas. Me diz uma de cada vez pra eu te ajudar melhor, beleza?' });
  }

  if (!sessao.nome) {
    const nome = detectarNome(mensagemOriginal);
    if (nome) {
      sessao.nome = nome;
      return res.json({ reply: `Beleza, ${nome}, agora que sei seu nome, vamos ao que interessa. O que manda?` });
    }
    if (!sessao.saudacaoFeita) {
      sessao.saudacaoFeita = true;
      return res.json({
        reply: 'Aí, camarada, antes de nos aprofundarmos, me diz: como posso te chamar aqui no chat?'
      });
    }
  } else {
    const nomeRepetido = detectarNome(mensagemOriginal);
    if (nomeRepetido && nomeRepetido.toLowerCase() === sessao.nome.toLowerCase()) {
      return res.json({ reply: `Tamo junto, ${sessao.nome}. Pode mandar ver, tô aqui!` });
    }

    if (
      mensagemLimpa === sessao.nome.toLowerCase() ||
      mensagemOriginal.trim().toLowerCase() === sessao.nome.toLowerCase()
    ) {
      return res.json({
        reply: `Tô ligado que você é o ${sessao.nome}. Me diz o que você quer saber! 😎`
      });
    }
  }

  // 🟡 Detectar intenção
  let intencoes = detectarIntencao(mensagemLimpa, baseConhecimento.intencaoUsuario);
  let respostaComposta = [];

  if (mensagemEhVaga(mensagemLimpa) && sessao.ultimaIntencao) {
    intencoes.push(sessao.ultimaIntencao);
  }

  // 🟢 NOVO: Se intenção for "orcamento", responder com redirecionamento
  if (intencoes.includes('orcamento')) {
    const texto =
      'O melhor jeito de falarmos sobre valores é no nosso WhatsApp! Lá a gente entende rapidinho o que você quer e já passa uma ideia de orçamento:\n\n👉 https://wa.me/5511939014504';
    const respostaFinal = personalizarResposta(texto, sessao.nome, true);
    sessao.historico.push({ user: mensagemOriginal, bot: respostaFinal });
    sessao.ultimaIntencao = 'orcamento';
    return res.json({ reply: respostaFinal });
  }

  // Se encontrou respostas na base manual
  for (const chave of new Set(intencoes)) {
    const resposta = baseConhecimento.intencaoUsuario[chave]?.resposta;
    const jaEnviado = sessao.historico.some(h => h.bot.trim() === resposta?.trim());
    if (resposta && !jaEnviado) {
      respostaComposta.push(resposta);
    }
  }

  if (respostaComposta.length) {
    sessao.ultimaIntencao = intencoes[intencoes.length - 1] || null;
    const texto = respostaComposta.join('\n\n');
    const respostaFinal = personalizarResposta(texto, sessao.nome, false);
    sessao.historico.push({ user: mensagemOriginal, bot: respostaFinal });
    return res.json({ reply: respostaFinal });
  }

  const retriever = vectorStore.asRetriever();
  const docs = await retriever.getRelevantDocuments(mensagemLimpa);
  const contexto = docs.map(d => d.pageContent).join('\n\n');

  const mensagensRecentes = sessao.historico.slice(-3).flatMap(item => [
    new HumanMessage(item.user),
    new SystemMessage(item.bot)
  ]);

  const messages = [
    new SystemMessage(instrucoesNex),
    new SystemMessage(`Base de conhecimento:\n${contexto}`),
    ...mensagensRecentes,
    new HumanMessage(mensagemLimpa)
  ];

  let resposta;
  try {
    resposta = await chat.call(messages);
  } catch (err) {
    console.error('Erro ao chamar IA:', err);
    return res.status(500).json({
      reply: 'Tô meio bugado agora... tenta de novo mais tarde 😵‍💫'
    });
  }

  let texto = resposta.content.trim();

  
  
  // 🧠 MELHORIA: Controle de temas fora do escopo da Forma Nexus
  sessao.temaForaCount = sessao.temaForaCount || 0;

  const textoEhMuitoFora = !texto.toLowerCase().match(/(site|feed|instagram|texto|redação|portfólio|forma nexus|serviço|criação|layout|orcamento|preço|projeto)/);
  const intencaoFora = !intencoes.some(i => ['orcamento', 'duvida_tecnica', 'contratacao', 'servico', 'portifolio', 'blog'].includes(i));

  if (textoEhMuitoFora && intencaoFora) {
    sessao.temaForaCount++;

    if (sessao.temaForaCount >= 2) {
texto += "\\n\\nAliás, só pra lembrar: meu foco aqui é te ajudar com os serviços da Forma Nexus — sites, feeds, textos e muito mais. Se quiser transformar isso num conteúdo profissional, fala com o criador: https://wa.me/5511939014504";
      sessao.temaForaCount = 0; // reset após aviso
    }
  } else {
    sessao.temaForaCount = 0; // reset se voltou ao tema
  }


  // Fallback para IA geral se resposta ruim
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
