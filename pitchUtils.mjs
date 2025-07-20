
/**
 * Verifica se o Nex deve ativar o modo pitch, baseado nas respostas da coleta.
 * Retorna true se houver ao menos 3 respostas com conteúdo mínimo.
 */
export function deveAtivarModoPitch(coleta) {
  if (!coleta || !Array.isArray(coleta.respostas)) return false;

  const respostasValidas = coleta.respostas.filter(r => typeof r === "string" && r.trim().length > 25);
  return respostasValidas.length >= 3;
}

/**
 * Gera um pitch estiloso baseado nas respostas da coleta.
 * Por enquanto, o combo é fixo. Pode ser expandido com lógica mais dinâmica depois.
 */
export function gerarPitchDoNex(respostas) {
  const combo = "identidade visual + 6 posts + landing page";
  const linkWhatsApp = "https://wa.me/5511999999999?text=Oi%20Nex,%20me%20mostra%20esse%20combo%20aí";

  return `🎯 Com esse nível de detalhe, eu já consigo te sugerir um combo que fecha com teu projeto: ${combo}.\n\nQuer ver quanto sai?\n👉 Bora pro WhatsApp: ${linkWhatsApp}`;
}
