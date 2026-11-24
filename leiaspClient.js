const STUDENT_API = 'https://prod-apistudent.elefanteletrado.com.br';
const CDN_BASE = 'https://prod-us.elefanteletrado.com.br/cdn';

function getElefanteHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/json; charset=utf-8',
    'Origin': 'https://reader.elefanteletrado.com.br',
    'Referer': 'https://reader.elefanteletrado.com.br/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };
}

function normalizarUrlCdn(url) {
  if (!url) return '';
  if (url.startsWith('/')) return `${CDN_BASE}${url}`;
  return url;
}

export async function listarLivros(token) {
  const headers = getElefanteHeaders(token);

  const [discoverRes, readingsRes] = await Promise.all([
    fetch(`${STUDENT_API}/v1/library/discover/`, { headers }).catch(() => null),
    fetch(`${STUDENT_API}/v1/library/book/readings`, { headers }).catch(() => null)
  ]);

  const discoverList = discoverRes && discoverRes.ok ? await discoverRes.json().catch(() => []) : [];
  const readingsList = readingsRes && readingsRes.ok ? await readingsRes.json().catch(() => []) : [];

  const mapa = new Map();

  if (Array.isArray(discoverList)) {
    for (const item of discoverList) {
      const id = String(item.Id ?? item.BookId ?? '');
      if (!id) continue;
      mapa.set(id, { ...item });
    }
  }

  if (Array.isArray(readingsList)) {
    for (const item of readingsList) {
      const id = String(item.Id ?? item.BookId ?? '');
      if (!id) continue;
      const existente = mapa.get(id) || {};
      const mesclado = { ...existente };

      for (const [k, v] of Object.entries(item)) {
        if (v !== null && v !== undefined && v !== '' && v !== 0) {
          mesclado[k] = v;
        }
      }
      if (typeof item.IsReadCompleted === 'boolean') mesclado.IsReadCompleted = item.IsReadCompleted;
      if (typeof item.IsQuizCompleted === 'boolean') mesclado.IsQuizCompleted = item.IsQuizCompleted;

      mapa.set(id, mesclado);
    }
  }

  const livros = [];
  for (const [id, raw] of mapa.entries()) {
    const totalPages = Number(raw.NumberPages ?? raw.TotalPages ?? 0);
    const currentPage = Number(raw.Page ?? 0);
    let progress = Number(raw.ReadingPercent ?? 0);

    if (progress <= 0 && totalPages > 0 && currentPage > 0) {
      progress = Math.round((currentPage / totalPages) * 1000) / 10;
    }

    const isComplete = Boolean(raw.IsReadCompleted) || progress >= 100;
    const isQuizCompleted = Boolean(raw.IsQuizCompleted);

    const autor = Array.isArray(raw.Authors) && raw.Authors.length > 0
      ? raw.Authors.join(', ')
      : (raw.AuthorStr || raw.Author || 'Desconhecido');

    livros.push({
      id,
      title: raw.BookTitle || raw.Title || 'Sem Título',
      author: autor,
      publisher: raw.Publisher || '',
      totalPages,
      currentPage,
      progress,
      isComplete,
      isQuizCompleted,
      isQuizActive: Boolean(raw.IsQuizActive),
      level: raw.LevelName || raw.Level || raw.Genre || 'Leitura',
      epubUrl: normalizarUrlCdn(raw.EpubUrl || raw.UrlToEpubFile || raw.FullUrlToEpubFile || raw.EpubFilePath),
      coverUrl: normalizarUrlCdn(raw.CoverPageUrl || raw.ThumbnailCoverPic || raw.CoverUrl || raw.CoverThumbnailUrl || raw.UrlToCoverImage)
    });
  }

  livros.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return a.title.localeCompare(b.title, 'pt-BR');
  });

  return livros;
}

export async function obterDetalhesLivro(token, bookId) {
  const res = await fetch(`${STUDENT_API}/v1/student/books/${encodeURIComponent(bookId)}`, {
    headers: getElefanteHeaders(token)
  });

  if (!res.ok) {
    throw new Error(`Erro ao buscar detalhes do livro (HTTP ${res.status}).`);
  }

  return res.json();
}

export async function obterEstatisticasAluno(token) {
  const res = await fetch(`${STUDENT_API}/v1/student/stats`, {
    headers: getElefanteHeaders(token)
  });

  if (!res.ok) {
    return {};
  }

  return res.json().catch(() => ({}));
}

function formatarDataBR(date = new Date()) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export async function registrarProgressoLeitura(token, {
  bookId,
  page,
  pageCount,
  timeElapsed,
  isComplete = false,
  cfi = '',
  readType = 'Read'
}) {
  const headers = getElefanteHeaders(token);
  const payload = {
    CFI: cfi,
    BookId: String(bookId),
    TimeElapsed: Number(timeElapsed),
    ReadType: readType,
    Page: Number(page),
    IsComplete: Boolean(isComplete),
    ReadDate: formatarDataBR(),
    PageCount: Number(pageCount),
    TimezoneOffset: 180
  };

  let res = await fetch(`${STUDENT_API}/v1/student/books/${encodeURIComponent(bookId)}/progress_em/${readType}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (res.status === 404 || res.status === 405) {
    res = await fetch(`${STUDENT_API}/v1/student/books/${encodeURIComponent(bookId)}/progressbybody/${readType}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  if (!res.ok) {
    throw new Error(`Falha ao registrar progresso (HTTP ${res.status}).`);
  }

  return res.json().catch(() => ({ success: true }));
}

export async function fecharLivro(token, bookId, currentPageTime = 60, isListen = false) {
  const typeFlag = isListen ? 1 : 0;
  const url = `${STUDENT_API}/v1/book-reading/close-book/${encodeURIComponent(bookId)}/${typeFlag}?currentPageTime=${Number(currentPageTime)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getElefanteHeaders(token)
  });

  if (!res.ok) {
    throw new Error(`Falha ao fechar leitura do livro (HTTP ${res.status}).`);
  }

  return res.json().catch(() => ({ success: true }));
}

export async function consultarQuiz(token, bookId) {
  const headers = getElefanteHeaders(token);

  let res = await fetch(`${STUDENT_API}/v2/student/books/${encodeURIComponent(bookId)}/quiz`, { headers });
  if (!res.ok) {
    res = await fetch(`${STUDENT_API}/v1/student/books/${encodeURIComponent(bookId)}/quiz`, { headers });
  }

  if (!res.ok) {
    throw new Error(`Não foi possível carregar o quiz (HTTP ${res.status}).`);
  }

  return res.json();
}

export async function enviarRespostaQuiz(token, bookId, payloadResposta, v2 = true) {
  const version = v2 ? 'v2' : 'v1';
  const res = await fetch(`${STUDENT_API}/${version}/student/books/${encodeURIComponent(bookId)}/quiz`, {
    method: 'POST',
    headers: getElefanteHeaders(token),
    body: JSON.stringify(payloadResposta)
  });

  if (!res.ok) {
    throw new Error(`Erro ao enviar resposta do quiz (HTTP ${res.status}).`);
  }

  return res.json().catch(() => ({ success: true }));
}

export async function finalizarQuiz(token, bookId, v2 = true) {
  const version = v2 ? 'v2' : 'v1';
  const res = await fetch(`${STUDENT_API}/${version}/student/books/${encodeURIComponent(bookId)}/finish-quiz`, {
    method: 'POST',
    headers: getElefanteHeaders(token)
  });

  if (!res.ok) {
    throw new Error(`Erro ao finalizar quiz (HTTP ${res.status}).`);
  }

  return res.json().catch(() => ({ success: true }));
}
