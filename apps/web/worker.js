export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)

    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    if (!URL.canParse(env.API_ORIGIN)) {
      return Response.json({ message: 'API_ORIGIN is not configured' }, { status: 503 })
    }

    const origin = new URL(env.API_ORIGIN)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin === requestUrl.origin) {
      return Response.json({ message: 'API_ORIGIN is invalid' }, { status: 503 })
    }

    const upstreamUrl = new URL(origin.origin)
    upstreamUrl.pathname = requestUrl.pathname
    upstreamUrl.search = requestUrl.search

    const upstreamRequest = new Request(upstreamUrl, request)
    upstreamRequest.headers.delete('host')

    try {
      return await fetch(upstreamRequest, { redirect: 'manual' })
    } catch {
      return Response.json({ message: 'Backend is unavailable' }, { status: 502 })
    }
  },
}
