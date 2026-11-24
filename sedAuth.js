const SED_BASE = 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi';

function getSedHeaders() {
  return {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/json',
    'X-Product-Name': 'SalaDoFuturo',
    'Origin': 'https://saladofuturo.educacao.sp.gov.br',
    'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };
}

export async function autenticarSalaDoFuturo(raCompleto, senha) {
  const userFormatado = raCompleto.trim().toUpperCase();

  const loginRes = await fetch(`${SED_BASE}/credenciais/api/LoginCompletoToken`, {
    method: 'POST',
    headers: getSedHeaders(),
    body: JSON.stringify({
      user: userFormatado,
      senha
    })
  });

  const rawBody = await loginRes.text();
  let loginData = {};

  try {
    loginData = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`HTTP ${loginRes.status} — Resposta não-JSON: ${rawBody.slice(0, 200)}`);
  }

  if (!loginRes.ok) {
    const detalhe = loginData?.message || loginData?.Message || rawBody.slice(0, 200);
    throw new Error(`HTTP ${loginRes.status} no login SED: ${detalhe}`);
  }

  const sedToken = loginData?.token;
  if (!sedToken) {
    throw new Error(`HTTP 200 sem token. Resposta: ${rawBody.slice(0, 200)}`);
  }

  const nomeAluno =
    loginData?.DadosUsuario?.NAME ||
    loginData?.DadosUsuario?.Nome ||
    loginData?.nome ||
    'Estudante';

  return {
    nome: nomeAluno,
    ra: userFormatado.toLowerCase(),
    sedToken,
    elefanteToken: null
  };
}
