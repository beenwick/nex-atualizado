import fs from 'fs';

const key = fs.readFileSync('./nex-docs-reader.json', 'utf8');
const json = JSON.parse(key);

const privateKey = json.private_key;

// Verifica se precisa de conversão (já é PKCS8 se começa com `-----BEGIN PRIVATE KEY-----`)
if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  console.error('❌ Essa chave não está no formato esperado. Abortando.');
  process.exit(1);
}

const oneLine = JSON.stringify(json).replace(/\n/g, '\\n');
fs.writeFileSync('./GOOGLE_CREDENTIALS_JSON_ready.txt', oneLine);

console.log('✅ Chave convertida com sucesso! Conteúdo salvo em GOOGLE_CREDENTIALS_JSON_ready.txt');
