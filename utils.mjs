import stringSimilarity from 'string-similarity'

/**
 * Remove pontuação e espaços extras da mensagem.
 * @param {string} texto
 * @returns {string}
 */
export function limparMensagem(texto) {
  return texto.toLowerCase().replace(/[^\w\s]/gi, '').trim();
}

/**
 * Detecta o nome do usuário a partir de frases comuns como “me chamo X”.
 * @param {string} texto
 * @returns {string|null}
 */
export function detectarNome(texto) {
  const padroes = [
    /me chamo (\w+)/i,
    /sou o (\w+)/i,
    /sou a (\w+)/i,
    /sou (\w+)/i,
    /meu nome é (\w+)/i
  ];

  for (const padrao of padroes) {
    const resultado = texto.match(padrao);
    if (resultado) return resultado[1];
  }

  return null;
}

/**
 * Detecta múltiplas intenções do usuário com base em expressões conhecidas.
 * Ignora mensagens muito curtas que podem ser apenas nomes.
 * @param {string} mensagem - Mensagem do usuário.
 * @param {object} intencoes - Objeto com intenções e variações conhecidas.
 * @returns {string[]} - Lista de chaves de intenções detectadas.
 */
export function detectarIntencao(mensagem, intencoes) {
  const entrada = mensagem.toLowerCase().trim();

  // Proteção extra: se for muito curta e parecer só um nome (ex: "Hugo"), ignora
  const palavras = entrada.split(/\s+/);
  if (palavras.length === 1 && /^[a-zA-ZÀ-ÿ]+$/.test(palavras[0]) && entrada.length <= 12) {
    return [];
  }

  const limiar = 0.6;
  const intencoesDetectadas = [];

  for (const chave in intencoes) {
    const variacoes = intencoes[chave];
    const correspondencia = stringSimilarity.findBestMatch(entrada, variacoes.map(v => v.toLowerCase()));
    if (correspondencia.bestMatch.rating > limiar) {
      intencoesDetectadas.push(chave);
    }
  }

  return intencoesDetectadas;
}

/**
 * Detecta se a mensagem contém múltiplas perguntas.
 * @param {string} texto
 * @returns {boolean}
 */
export function temMultiplasPerguntas(texto) {
  const perguntas = texto.split(/[?.!]/).filter(p => p.trim().length > 5);
  return perguntas.length >= 2;
}

/**
 * Aplica estilo debochado e personalizado às respostas.
 * @param {string} texto - Texto da resposta original.
 * @param {string|null} nome - Nome do usuário, se houver.
 * @param {boolean} encerrar - Se é uma resposta de encerramento (aplica frase de efeito).
 * @returns {string} - Texto adaptado.
 */
export function personalizarResposta(texto, nome = null, encerrar = false) {
  const frasesExtras = [
    'Fácil demais pra mim.',
    'Essa foi tranquila, vai dificultar não?',
    'Essa aí até minha versão beta respondia.',
    'Achei que você vinha com algo mais difícil...',
    'Tô começando a achar que você me subestima 🤨',
    'Por isso que eu sou o Nex e você... bom, você é você 😏',
    'Vou deixar essa de presente porque gosto de você.'
  ];

  // Só adiciona frase de efeito se for encerramento
  if (!encerrar) return texto;

  const extra = frasesExtras[Math.floor(Math.random() * frasesExtras.length)];
  return `${texto}\n\n${extra}`;
}

/**
 * Detecta se a resposta gerada é genérica ou ruim.
 * @param {string} texto
 * @returns {boolean}
 */
export function respostaEhRuim(texto) {
  const ruim = [
    'não entendi',
    'não sei',
    'não tenho certeza',
    'não posso responder isso',
    'desculpe',
    'sou só um chatbot'
  ];
  return ruim.some(r => texto.toLowerCase().includes(r)) || texto.length < 15;
}

/**
 * Detecta se a conversa está saindo do tema central dos serviços da Forma Nexus.
 * @param {string[]} intencoesDetectadas
 * @returns {boolean}
 */
export function intencaoEhForaDoTema(intencoesDetectadas) {
  const intencoesPermitidas = [
    'site', 'orcamento', 'feed', 'texto', 'servicos', 'copy', 'blog', 'podcast',
    'redacao', 'instagram', 'login', 'loja', 'portfolio', 'navegacao', 'sobre'
  ];
  return intencoesDetectadas.every(intencao => !intencoesPermitidas.includes(intencao));
}