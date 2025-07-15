import stringSimilarity from 'string-similarity';

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
 * @param {string} mensagem - Mensagem do usuário.
 * @param {object} intencoes - Objeto com intenções e variações conhecidas.
 * @returns {string[]} - Lista de chaves de intenções detectadas.
 */
export function detectarIntencao(mensagem, intencoes) {
  const entrada = mensagem.toLowerCase();
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
