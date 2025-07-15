// utils.mjs

export function limparMensagem(texto) {
  return texto.trim()
    .replace(/^[^\wÀ-ÿ0-9]+|[^\wÀ-ÿ0-9]+$/g, '')
    .replace(/\s{2,}/g, ' ');
}

export function detectarNome(texto) {
  const padroes = [
    /(?:meu nome é|me chamo|sou o|sou a|pode me chamar de)\s+([\wÀ-ÿ]+)/i
  ];
  for (const padrao of padroes) {
    const m = texto.match(padrao);
    if (m && m[1]) return m[1].trim();
  }

  const trimmed = texto.trim();
  if (/^[A-Za-zÀ-ÿ]+$/.test(trimmed) && trimmed.split(' ').length === 1) {
    return trimmed;
  }
  return null;
} 
