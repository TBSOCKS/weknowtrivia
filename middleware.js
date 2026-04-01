import { NextResponse } from 'next/server'

export function middleware(request) {
  // Auth temporarily disabled for development — re-enable before launch
  return NextResponse.next()
}

export const config = {
  matcher: ['/host/:path*'],
}
