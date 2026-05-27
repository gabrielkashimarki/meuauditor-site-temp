const DEFAULT_OWNER = 'gabrielkashimarki';
const DEFAULT_REPO = 'meuauditor-site-temp';
const DEFAULT_BRANCH = 'main';

function send(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(data);
}

function toBase64Utf8(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.message || 'Erro na API do GitHub.');
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Método não permitido.' });
  }

  const editorPassword = process.env.EDITOR_PASSWORD;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!editorPassword || !githubToken) {
    return send(res, 500, { error: 'API sem configuração de senha ou token.' });
  }

  const { password, html, filePath } = req.body || {};

  if (password !== editorPassword) {
    return send(res, 401, { error: 'Senha incorreta.' });
  }

  if (!html || typeof html !== 'string') {
    return send(res, 400, { error: 'HTML inválido.' });
  }

  const safeFilePath = String(filePath || 'index.html').replace(/^\/+/, '') || 'index.html';
  if (!safeFilePath.endsWith('.html')) {
    return send(res, 400, { error: 'Arquivo inválido.' });
  }

  const owner = process.env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const encodedPath = safeFilePath.split('/').map(encodeURIComponent).join('/');
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
  const authHeaders = { Authorization: `Bearer ${githubToken}` };

  try {
    const current = await githubRequest(`${baseUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: authHeaders,
    });

    const result = await githubRequest(baseUrl, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Atualiza ${safeFilePath} pelo editor visual`,
        content: toBase64Utf8(html),
        sha: current.sha,
        branch,
      }),
    });

    return send(res, 200, {
      ok: true,
      commitUrl: result.commit && result.commit.html_url,
    });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
};
