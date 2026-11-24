const SED_BASE = 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi';
const ELEFANTE_ACCOUNTS = 'https://prod-apiaccounts.elefanteletrado.com.br';

function getSedHeaders(bearerToken = null) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/json',
    'X-Product-Name': 'SalaDoFuturo',
    'Origin': 'https://saladofuturo.educacao.sp.gov.br',
    'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };

  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  return headers;
}

export async function autenticarSalaDoFuturo(raCompleto, senha) {
  const userFormatado = raCompleto.trim().toUpperCase();

  // 1. Login na SED (sem Ocp-Apim-Subscription-Key)
  const loginRes = await fetch(`${SED_BASE}/credenciais/api/LoginCompletoToken`, {
    method: 'POST',
    headers: getSedHeaders(),
    body: JSON.stringify({
      user: userFormatado,
      senha
    })
  });

  if (!loginRes.ok) {
    throw new Error(`Falha no login SED (HTTP ${loginRes.status}). Verifique RA e senha.`);
  }

  const loginData = await loginRes.json();
  const sedToken = loginData?.token;

  if (!sedToken) {
    throw new Error('Token SED não retornado. Verifique suas credenciais.');
  }

  const nomeAluno =
    loginData?.DadosUsuario?.NAME ||
    loginData?.DadosUsuario?.Nome ||
    loginData?.nome ||
    'Estudante';

  // 2. Token de integração LeiaSP+
  const intRes = await fetch(`${SED_BASE}/integracoes/Token?plataforma=LeiaSP%2B`, {
    method: 'GET',
    headers: getSedHeaders(sedToken)
  });

  if (!intRes.ok) {
    throw new Error(`Erro ao obter integração LeiaSP+ (HTTP ${intRes.status}).`);
  }

  const intData = await intRes.json();
  const leiaSpJwt = intData?.data;

  if (!leiaSpJwt) {
    throw new Error('Token de integração LeiaSP+ vazio.');
  }

  // 3. Troca pelo access_token do Elefante Letrado
  const oauthUrl = `${ELEFANTE_ACCOUNTS}/api/oauth/seducsp/token?token=${encodeURIComponent(leiaSpJwt)}`;
  const oauthRes = await fetch(oauthUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  let elefanteToken = null;

  if ([301, 302, 307, 308].includes(oauthRes.status)) {
    const location = oauthRes.headers.get('location') || '';
    const parsedUrl = new URL(location, ELEFANTE_ACCOUNTS);
    const tParam = parsedUrl.searchParams.get('t');

    if (tParam) {
      const decoded = JSON.parse(Buffer.from(tParam, 'base64').toString('utf8'));
      elefanteToken = decoded?.access_token || decoded?.token || null;
    }
  } else if (oauthRes.ok) {
    const body = await oauthRes.json().catch(() => ({}));
    elefanteToken = body?.access_token || body?.token || null;
  }

  if (!elefanteToken) {
    throw new Error('Não foi possível obter o token de acesso do LeiaSP / Elefante Letrado.');
  }

  return {
    nome: nomeAluno,
    ra: userFormatado.toLowerCase(),
    sedToken,
    elefanteToken
  };
}
