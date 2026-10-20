import type { NextRequest } from 'next/server';

// Repassa /api/* para a API e põe a chave aqui no servidor, assim ela não vai para o navegador.
const API_URL = (process.env.API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const FORWARDED_HEADERS = ['content-type', 'x-user-name'];

async function forward(request: NextRequest, ctx: RouteContext<'/api/[...path]'>) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (process.env.API_KEY) headers.set('x-api-key', process.env.API_KEY);

  const body = request.method === 'GET' ? undefined : await request.text();

  try {
    const upstream = await fetch(target, { method: request.method, headers, body: body || undefined, cache: 'no-store' });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'Não foi possível conectar ao servidor do CRM. Verifique se a API está rodando.',
        },
      },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as PATCH, forward as POST };
