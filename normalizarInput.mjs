
// normalizarInput.mjs
export function normalizarInput(textoOriginal) {
  let texto = textoOriginal.toLowerCase();

  // Substituições simples
  const substituicoes = {
    "vc": "você",
    "vcs": "vocês",
    "pfv": "por favor",
    "pls": "por favor",
    "qnt": "quanto",
    "qt": "quanto",
    "custa": "custa",
    "faz": "vocês fazem",
    "tem": "vocês têm",
    "🙌": "",
    "🙏": "",
    "💻": "site",
    "📱": "celular",
    "zap": "whatsapp",
    "wpp": "whatsapp",
    "numero": "número",
    "num": "número",
    "oiii": "oi",
    "olaaa": "olá"
  };

  for (const [chave, valor] of Object.entries(substituicoes)) {
    const regex = new RegExp("\\b" + chave + "\\b", "gi");
    texto = texto.replace(regex, valor);
  }

  // Remove repetições exageradas de letras (ex: "hellooo" → "hello")
  texto = texto.replace(/([a-z])\1{2,}/g, '$1');

  // Remove pontuação repetida
  texto = texto.replace(/[?!.,]{2,}/g, match => match[0]);

  return texto.trim();
}
