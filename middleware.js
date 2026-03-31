import { NextResponse } from 'next/server'

export function middleware(request) {
  const cookie = request.cookies.get('wkt_host')
  if (!cookie || cookie.value !== '1') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('redirect', 'host')
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/host/:path*'],
}
