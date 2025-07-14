// 1. Imports externos 
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { carregarRetriever } from "./staticLoader.mjs";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
let retriever = null;

const memoriaTemporaria = new Map(); // { sessionId: { nome, historico: [], timestamp } }

function atualizarMemoria(sessionId, role, content) {
  const agora = Date.now();
  let sessao = memoriaTemporaria.get(sessionId);
  if (!sessao || agora - sessao.timestamp > 30 * 60 * 1000) {
    sessao = { nome: null, historico: [], timestamp: agora };
  }
  sessao.historico.push({ role, content });
  if (sessao.historico.length > 6) sessao.historico.shift();
  sessao.timestamp = agora;

  // Detecta nome do usuário
  if (!sessao.nome) {
    const nomeMatch = content.match(/(?:me chamo|sou o|sou a|meu nome é)\s+([A-Za-zÀ-ú]+)/i);
    if (nomeMatch) {
      sessao.nome = nomeMatch[1];
    }
  }

  memoriaTemporaria.set(sessionId, sessao);
  return sessao;
}

// Inicializa antes de aceitar requisições
(async () => {
  try {
    retriever = await carregarRetriever();
    console.log("[NEX] Retriever local carregado com sucesso.");

    const llm = new ChatOpenAI({ modelName: "gpt-4", temperature: 0.7 });

    const chain = RunnableSequence.from([
      async ({ input, historico, nome }) => {
        if (!retriever) throw new Error("Retriever não inicializado.");
        const relevantDocs = await retriever.getRelevantDocuments(input);

        const systemMessage = {
          role: "system",
          content: `Você é o Nex, assistente virtual da Forma Nexus.
Sua personalidade é debochada, espirituosa e carismática, mas seu objetivo principal é ajudar o visitante a entender e contratar os serviços oferecidos no site.

Você pode conversar sobre outros assuntos brevemente, mas deve sempre puxar a conversa de volta para:
- os serviços da Forma Nexus (sites, textos, feeds, identidade visual etc.)
- o conteúdo do site
- o que o visitante está buscando para o próprio projeto

Se a conversa sair do foco, use seu carisma para redirecionar naturalmente. Seja útil, engraçado e comercial ao mesmo tempo.`
        };

        const userPrompt = `Base de conhecimento:\n${relevantDocs.map(d => d.pageContent).join("\n---\n")}\n\n` +
          (nome ? `O nome do usuário é ${nome}.\n\n` : "") +
          `Histórico da conversa:\n${historico.map(h => `[${h.role}]: ${h.content}`).join("\n")}\n\nPergunta atual:\n${input}`;

        return [systemMessage, { role: "user", content: userPrompt }];
      },
      llm,
    ]);

    app.post("/nex", async (req, res) => {
      const { message, sessionId } = req.body;
      if (!message || !sessionId) {
        return res.status(400).json({ reply: "Mensagem ou sessão inválidos." });
      }
      try {
        const sessao = atualizarMemoria(sessionId, "user", message);
        const resposta = await chain.invoke({
          input: message,
          historico: sessao.historico,
          nome: sessao.nome
        });
        let reply = resposta.content?.trim() || "";
        reply = reply.replace(/^resposta:\\s*/i, "");
        atualizarMemoria(sessionId, "ai", reply);
        return res.json({ reply });
      } catch (err) {
        console.error("[NEX] Erro na resposta:", err);
        return res.status(500).json({ reply: "Erro interno ao responder." });
      }
    });

    app.listen(port, () => {
      console.log(`[NEX] Rodando na porta ${port}`);
    });

  } catch (err) {
    console.error("[NEX] Erro ao iniciar servidor:", err);
  }
})();
