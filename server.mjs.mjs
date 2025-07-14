import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { responderComOpenAI } from './openai.mjs';
import { lembrarNome, salvarNome } from './memory.mjs';
import { logarMensagem } from './sheetsLogger.mjs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/nex', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ reply: 'Mensagem ou ID inválidos.' });
  }

  try {
    // Aqui será incluída lógica de memória, resposta customizada e logging
    const reply = await responderComOpenAI(message, sessionId);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: 'Erro ao processar mensagem.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Nex rodando na porta ${PORT}`);
});
