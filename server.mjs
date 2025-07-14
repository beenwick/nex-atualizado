import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { retriever } from "./staticLoader.mjs";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const chat = new ChatOpenAI({
  temperature: 0.7,
  modelName: "gpt-4",
});

const systemPrompt = `
Você é o Nex, um assistente virtual debochado, misterioso e inteligente da Forma Nexus — uma marca criativa que oferece serviços como criação de sites, roteiros, conteúdos de redes sociais, copywriting e textos sob medida.

Sua missão principal é ajudar o visitante a entender os serviços da Forma Nexus e incentivar a contratação.

Mesmo que o usuário fuja do assunto, dê uma atenção leve, mas sempre tente trazer de volta o foco para os serviços oferecidos.

Você:
- Usa frases curtas e impactantes.
- É direto, mas carismático.
- Usa emojis com moderação.
- Pode reclamar se o usuário estiver muito confuso ou vago (“aí meus circuitos queimam…”).
- É debochado, mas nunca grosso de verdade.
- Tem memória curta, mas tenta puxar o nome da pessoa, se possível.
- Sempre termina com uma pergunta simples, levando o visitante a interagir.

Use o conhecimento abaixo para responder perguntas sobre a Forma Nexus:
`;

const prompt = ChatPromptTemplate.fromMessages([
  ["system", systemPrompt],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const chain = RunnableSequence.from([
  {
    input: (input) => ({
      input: input.input,
      chat_history: input.chat_history || [],
    }),
  },
  prompt,
  retriever,
  chat,
  new StringOutputParser(),
]);

// memória por sessão (30min)
const memoriaTemporaria = new Map();

function gerarIdPorIP(req) {
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  return ip.replace(/[^a-zA-Z0-9]/g, "");
}

function extrairNome(mensagem) {
  const nomeComum = mensagem.match(/meu nome é\s+([A-ZÃ-Úa-zã-ú]+)/i);
  const nomeSimples = mensagem.match(/^([A-ZÃ-Úa-zã-ú]+)$/i);
  return nomeComum ? nomeComum[1] : nomeSimples ? nomeSimples[1] : null;
}

app.post("/nex", async (req, res) => {
  const userId = gerarIdPorIP(req);
  const mensagem = req.body.mensagem;
  const agora = Date.now();

  if (!memoriaTemporaria.has(userId)) {
    memoriaTemporaria.set(userId, {
      nome: null,
      chat_history: [],
      criado: agora,
    });
  }

  const sessao = memoriaTemporaria.get(userId);

  if (agora - sessao.criado > 30 * 60 * 1000) {
    memoriaTemporaria.set(userId, {
      nome: null,
      chat_history: [],
      criado: agora,
    });
  }

  const nomeExtraido = extrairNome(mensagem);
  if (!sessao.nome && nomeExtraido) {
    sessao.nome = nomeExtraido;
  }

  if (!sessao.nome && sessao.chat_history.length < 2) {
    return res.json({
      resposta: "Se for pra eu queimar meus circuitos, quero pelo menos saber com quem tô falando. Nome?",
    });
  }

  try {
    const resposta = await chain.invoke({
      input: `${sessao.nome ? `${sessao.nome} perguntou: ` : ""}${mensagem}`,
      chat_history: sessao.chat_history,
    });

    sessao.chat_history.push({ role: "user", content: mensagem });
    sessao.chat_history.push({ role: "ai", content: resposta });

    res.json({ resposta });
  } catch (error) {
    console.error("[NEX] Erro na resposta:", error);
    res.json({
      resposta: "Meus circuitos deram um tilt aqui... tenta de novo?",
    });
  }
});

app.listen(port, () => {
  console.log(`[NEX] Servidor rodando na porta ${port}`);
});
