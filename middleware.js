import { NextResponse } from 'next/server'

export function middleware(request) {
  // Auth temporarily disabled — auto-grant access for development
  const response = NextResponse.next()
  response.cookies.set('wkt_host', '1', {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}

export const config = {
  matcher: ['/host/:path*'],
}
