import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { responderComOpenAI } from './openai.mjs'; // Deixe esse arquivo criado
// (Você pode comentar essa linha caso ainda não tenha o openai.mjs)

// Temporariamente desative a memória e logs até criarmos:
// import { lembrarNome, salvarNome } from './memory.mjs';
// import { logarMensagem } from './sheetsLogger.mjs';

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
    const reply = await responderComOpenAI(message, sessionId);
    res.json({ reply });
  } catch (err) {
    console.error('Erro ao gerar resposta:', err);
    res.status(500).json({ reply: 'Falhei aqui, vida... culpa do meu servidor que tá de TPM. Tenta de novo já já!' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Nex rodando debochadamente na porta ${PORT}`);
});
