import { obterTextoDoGoogleDocs } from './docs.mjs';

const testar = async () => {
  const texto = await obterTextoDoGoogleDocs();
  console.log('Conteúdo do documento:', texto);
};

testar();
