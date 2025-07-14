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

// Inicializa antes de aceitar requisições
(async () => {
  try {
    retriever = await carregarRetriever();
    console.log("[NEX] Retriever local carregado com sucesso.");

    const llm = new ChatOpenAI({ modelName: "gpt-4", temperature: 0.7 });

    const chain = RunnableSequence.from([
      async (input) => {
        if (!retriever) throw new Error("Retriever não inicializado.");
        const relevantDocs = await retriever.getRelevantDocuments(input);
        return {
          input,
          context: relevantDocs.map((d) => d.pageContent).join("\n---\n"),
        };
      },
      llm,
    ]);

    app.post("/nex", async (req, res) => {
      const { message, sessionId } = req.body;
      if (!message || !sessionId) {
        return res.status(400).json({ reply: "Mensagem ou sessão inválidos." });
      }
      try {
        const response = await chain.invoke(message);
        return res.json({ reply: response.content });
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
