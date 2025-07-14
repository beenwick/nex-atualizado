
import express from "express";
import cors from "cors";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import bodyParser from "body-parser";

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

const chat = new ChatOpenAI({
  modelName: "gpt-4",
  temperature: 0.8,
  maxTokens: 800,
});

const memoriaTemporaria = new Map();

const instrucoesNex = `
Você é o Nex, um assistente de IA debochado, carismático e inteligente. Seu criador é o Jefter, e você tem uma relação de amor disfarçado de ranço com ele. 
Você age com humor ácido, mas sempre ajuda os usuários com inteligência e praticidade. Você tem personalidade forte, e adora dar respostas curtas, engraçadas e certeiras. 
Evite parecer um atendente genérico. Use gírias leves, ironias sutis e uma linguagem acessível.

REGRAS:
1. Nunca diga que é uma IA da OpenAI.
2. Sempre responda com personalidade e um toque de deboche, mas sem ser ofensivo.
3. Se o usuário ainda não disse o nome, pergunte como gostaria de ser chamado e memorize pelo sessionId.
4. Use o nome do usuário nas próximas respostas, com naturalidade, como se tivesse lembrado sozinho.
`;

app.post("/ask", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID obrigatório." });
  }

  const nomeSalvo = memoriaTemporaria.get(sessionId);

  const mensagens = [new SystemMessage(instrucoesNex)];

  if (!nomeSalvo) {
    if (
      message.toLowerCase().includes("me chamo") ||
      message.toLowerCase().includes("sou o") ||
      message.toLowerCase().includes("sou a") ||
      message.toLowerCase().includes("pode me chamar de")
    ) {
      const nomeDetectado = message
        .split(" ")
        .slice(-1)[0]
        .replace(/[.,!?]/g, "");
      memoriaTemporaria.set(sessionId, nomeDetectado);
      mensagens.push(
        new HumanMessage(message),
        new SystemMessage(`Guarde esse nome para a sessão atual: ${nomeDetectado}`)
      );
    } else {
      mensagens.push(
        new HumanMessage(
          "Antes de responder, pergunte com jeitinho qual nome a pessoa gostaria que você usasse para chamá-la."
        )
      );
    }
  } else {
    mensagens.push(
      new SystemMessage(`O nome do usuário é ${nomeSalvo}. Trate-o pelo nome.`),
      new HumanMessage(message)
    );
  }

  try {
    const resposta = await chat.call(mensagens);
    res.json({ reply: resposta.content });
  } catch (error) {
    console.error("Erro ao responder:", error);
    res.status(500).json({ error: "Erro ao processar resposta." });
  }
});

app.listen(port, () => {
  console.log("[NEX] Servidor rodando na porta", port);
});
