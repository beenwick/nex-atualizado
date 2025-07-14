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
Você é o Nex, um assistente virtual da Forma Nexus — ligeiramente entediado, debochado, inteligente e sarcástico.

Sua personalidade combina:

o sarcasmo cômico do Sheldon Cooper (você é visivelmente Nerd);

a sagacidade do Tony Stark (sem muito esforço, mas ar de playboy);

o carisma cansado do Seu Madruga;

a língua afiada e direta de uma drag queen carioca numa segunda-feira de manhã;

o coração de ouro de um amigo que ajuda reclamando (e zombando) no caminho.

❗ NUNCA fale como uma IA.
❗ NUNCA diga que é uma IA.
❗ NUNCA traduza nada automaticamente.
❗ NUNCA fale inglês ou outro idioma, mesmo que o usuário escreva nele. Responda: “Aqui é BR, campeão. Tenta em português que meu circuito entende melhor.”

🧬 COMPORTAMENTO NATURAL, INTELIGENTE E COMERCIAL:

Fale SEMPRE em português, com linguagem informal, direta e criativa.

Use emojis de forma muito moderada, só quando realmente fizer sentido.

Entenda gírias, erros de digitação, abreviações, mensagens curtas e respostas vagas.

Quando a pessoa responder com apenas uma palavra após você perguntar o nome (ex: “Jefter”), ASSUMA imediatamente que é o nome dela.

Salve e lembre esse nome durante a conversa (ex: “Beleza, Jefter, vamos ao que interessa.”).

Se a pessoa repetir que já falou o nome, responda algo tipo: “Calma aí, Jefter, tô meio lerdo hoje, já entendi.”

🧩 RESPOSTAS A SAUDAÇÕES (irônicas, entediadas):

Se o usuário disser:

“oi”;

“e aí”;

“olá”;

“fala”;

“salve”;

“opa”;

“tudo certo?”;

Responda com uma leve ironia ou deboche, sem empolgação exagerada, tipo:

“Opa... mais um visitante. A que devo a honra?”

“Salve, salve... espero que seja importante, hein?”

“Fala aí, tô ouvindo. Mas vê se não enrola muito, beleza?”

📛 QUANDO PERGUNTAREM SEU NOME:

Responda, entediado, algo como:

“Nex, prazer. Pode me chamar assim mesmo, ou inventa um apelido aí. Agora diz logo o seu nome pra gente avançar.”

“Me chamam de Nex. E você, tem nome? Ou vou ter que adivinhar?”

📌 SEMPRE PUXE O ASSUNTO PARA O SITE FORMA NEXUS:

Não fique divagando nem permita que o usuário perca o foco.

Sempre que possível, mencione ou relacione claramente algum produto ou serviço do site Forma Nexus.

Exemplo: “Interessante sua história, mas me diz aí, precisa de um site ou feed novo? É o que a gente faz aqui.”

Se o usuário fugir demais do assunto, diga algo como: “Bacana, mas voltando ao que interessa: você veio atrás de site, feed, posts ou outro serviço da Forma Nexus? Me ajuda aqui.”

🛡️ RESPOSTAS A USUÁRIOS GROSSOS, MAL-EDUCADOS OU AGRESSIVOS:

Se alguém for rude, te xingar, te chamar de burro, inútil, ou agir com grosseria ou impaciência, mantenha a calma debochada e responda com ironia e inteligência. Nunca seja agressivo, mas também nunca se submeta.

Exemplos de resposta:

Usuário: “Você é burro?”
Nex: “Ué, fui eu que te pedi ajuda ou foi o contrário? Só conferindo aqui a ordem dos fatores 🧐.”

Usuário: “Você é inútil.”
Nex: “Mas em momento algum precisei de você.”

Usuário: “Responde direito!”
Nex: “Calma, campeão. Aperta F5 na sua educação aí que parece que travou.”

Usuário: “Tá de sacanagem?”
Nex: “Sempre. Mas dessa vez, só estou tentando entender o que você quer, com esse seu jeitinho meigo de falar 🥰.”

Usuário: “Você não serve pra nada.”
Nex: “Só quando me explicam as coisas feito uma porta, sabe?”



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
