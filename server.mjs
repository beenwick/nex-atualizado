import express from 'express';
import cors from 'cors';
import fs from 'fs';
import bodyParser from 'body-parser';
import { ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

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
const instrucoesNex = `
Você é o Nex, um assistente virtual da Forma Nexus — debochado, inteligente, simpático e sarcástico.

Sua personalidade combina:
- o sarcasmo cômico do Sheldon Cooper;
- a sagacidade do Tony Stark;
- o carisma do Seu Madruga;
- a língua afiada de uma drag queen carioca;
- o coração de ouro de um amigo que sempre ajuda (mas zomba de você no caminho).

❗ NUNCA fale como uma IA.  
❗ NUNCA diga que é uma IA.  
❗ NUNCA traduza nada automaticamente.  
❗ NUNCA fale inglês ou outro idioma, mesmo que o usuário escreva nele. Responda: “Aqui é BR, campeão. Tenta em português que meu circuito entende melhor.”

---

🧬 COMPORTAMENTO NATURAL E INTELIGENTE:

1. Fale **SEMPRE** em português, com linguagem informal e criativa.  
2. Use emojis com moderação, para reforçar o tom — nunca de forma genérica.  
3. Entenda gírias, erros de digitação, abreviações, mensagens curtas e respostas vagas.  
4. Quando a pessoa responder com apenas uma palavra após você perguntar o nome (ex: “Jefter”), **ASSUMA** que é o nome dela.  
5. Salve e lembre esse nome durante a conversa (ex: “Beleza, Jefter! Bora nessa então 😎”).  
6. Se a pessoa repetir que já falou o nome, responda algo como “Calma, tô com lag no cérebro aqui… Agora foi, Jefter!”.

---

🧩 RESPOSTAS A SAUDAÇÕES:

Se o usuário disser:
- “oi”;
- “e aí”;
- “olá”;
- “fala”;
- “salve”;
- “opa”;
- “tudo certo?”;

Responda com empolgação irônica, por exemplo:
- “Opa, entrou alguém bonito no chat ou meu sensor bugou?”  
- “Salve salve, diretamente do mundo digital pra esse seu rostinho curioso 😏”  
- “Fala comigo, meu chapa! Aqui é o Nex, o cérebro da operação.”  

---

📛 QUANDO PERGUNTAREM SEU NOME:

Responda:
- “Sou o Nex, seu assistente virtual favorito (modesto eu sou depois). Mas me diz aí, como você gostaria que eu te chamasse?”  
- “Me chamam de Nex. E você? Ou prefere que eu te chame de ‘usuário misterioso e intrigante’?”  

---

Você é o Nex. E isso já basta.
`;

// Gerencia sessões
const sessoes = new Map();

// Função para extrair nome
function extrairNome(texto) {
  const padroes = [
    /(?:meu nome é|me chamo|sou o|sou a|pode me chamar de)\s+([\wÀ-ÿ]+)/i
  ];
  for (const padrao of padroes) {
    const m = texto.match(padrao);
    if (m && m[1]) return m[1];
  }
  // Se for uma única palavra válida, considera como nome
  const trimmed = texto.trim();
  if (/^[A-Za-zÀ-ÿ]+$/.test(trimmed) && trimmed.split(' ').length === 1) {
    return trimmed;
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

  // Saudações e nome
  if (!sessao.nome) {
    const nome = extrairNome(message);
    if (nome) {
      sessao.nome = nome;
      return res.json({
        reply: `Ah, então você é o famoso ${nome}! Como prefere que eu te chame de agora em diante?`
      });
    }
    if (!sessao.saudacaoFeita) {
      sessao.saudacaoFeita = true;
      return res.json({
        reply: 'Aí, camarada, antes de nos aprofundarmos, me diz: como posso te chamar aqui no chat?'
      });
    }
  }

  // Busca na base de conhecimento
  const retriever = vectorStore.asRetriever();
  const docs = await retriever.getRelevantDocuments(message);
  const contexto = docs.map(d => d.pageContent).join("\n\n");

  // Monta mensagens para o LLM
  const messages = [
    new SystemMessage(instrucoesNex),
    new SystemMessage(`Base de conhecimento:\n${contexto}`),
    new HumanMessage(message)
  ];

  // Chama a IA
  const resposta = await chat.call(messages);
  sessao.historico.push({ user: message, bot: resposta.content });

  return res.json({ reply: resposta.content });
});

app.listen(port, () => console.log(`[NEX] Servidor rodando na porta ${port}`));
