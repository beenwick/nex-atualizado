import stringSimilarity from 'string-similarity';

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
