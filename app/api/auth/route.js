import { NextResponse } from 'next/server'

export async function POST(req) {
  // Auth temporarily disabled — always grant access
  const res = NextResponse.json({ ok: true })
  res.cookies.set('wkt_host', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('wkt_host')
  return res
}
