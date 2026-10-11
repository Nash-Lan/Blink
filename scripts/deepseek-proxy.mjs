import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.BLINK_DEEPSEEK_PROXY_PORT ?? 8787);
const apiKey = process.env.DEEPSEEK_API_KEY;
const upstreamUrl = process.env.BLINK_DEEPSEEK_UPSTREAM_URL ?? 'https://api.deepseek.com/chat/completions';
const requiresDeepSeekKey = upstreamUrl.includes('api.deepseek.com');
const allowedOrigins = new Set(
  (process.env.BLINK_DEEPSEEK_ALLOWED_ORIGINS ?? [
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8164',
    'http://127.0.0.1:8164',
    'http://localhost:8170',
    'http://127.0.0.1:8170',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
  ].join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

if (requiresDeepSeekKey && !apiKey) {
  console.error('Blink DeepSeek proxy cannot start: DEEPSEEK_API_KEY is not configured in this Node.js process.');
  console.error('Set DEEPSEEK_API_KEY in the Windows environment before running npm run proxy:deepseek. The key value was not printed.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: 'Origin is not allowed.' });
    return;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/analyze-icon') {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  if (!apiKey && requiresDeepSeekKey) {
    sendJson(res, 503, { error: 'DEEPSEEK_API_KEY is not configured on the local proxy.' });
    return;
  }

  try {
    const request = await readJson(req);
    const body = buildDeepSeekRequest(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: `DeepSeek upstream failed with HTTP ${upstream.status}.` });
      return;
    }

    const raw = await upstream.json();
    const content = raw?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      sendJson(res, 502, { error: 'DeepSeek returned an empty response.' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      sendJson(res, 502, { error: 'DeepSeek returned invalid JSON.' });
      return;
    }
    sendJson(res, 200, parsed);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'DeepSeek request timed out.'
      : error instanceof Error ? error.message : 'Proxy request failed.';
    sendJson(res, 500, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Blink DeepSeek proxy listening on http://${host}:${port}`);
  console.log(`Allowed origins: ${[...allowedOrigins].join(', ')}`);
});

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && allowedOrigins.has(origin);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function buildDeepSeekRequest(request) {
  const text = String(request.text ?? '').slice(0, 2000);
  const recordType = request.recordType === 'deadline' ? 'deadline' : 'note';
  const model = String(request.model || process.env.DEEPSEEK_MODEL || 'deepseek-flash');
  const allowedIcons = Array.isArray(request.allowedIcons) ? request.allowedIcons : [];
  const iconText = allowedIcons
    .filter((item) => item && typeof item.icon === 'string' && typeof item.label === 'string')
    .map((item) => `${item.icon}=${item.label}`)
    .join(', ');
  return {
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: [
          'You choose one visual asset for a private productivity app.',
          'For notes with clear steps, cause/effect, or process flow, you may return a basic Mermaid flowchart.',
          'For ordinary notes and all deadlines, return an icon.',
          'Return only JSON. Icon shape: {"kind":"icon","version":1,"icon":"...","label":"..."}. Mermaid shape: {"kind":"mermaid","version":1,"definition":"flowchart TD\\n  A[Step] --> B[Step]"}',
          'Mermaid must use only flowchart TD, flowchart LR, graph TD, or graph LR. No click, links, HTML, styles, init directives, or scripts.',
          'If returning an icon, it must be exactly one of the allowed icon names.',
          `Allowed icons: ${iconText}`,
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Record type: ${recordType}\nText:\n${text}`,
      },
    ],
  };
}
