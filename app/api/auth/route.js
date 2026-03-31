import { NextResponse } from 'next/server'

const PASSWORD = process.env.HOST_PASSWORD || 'Robhastrivia123'

export async function POST(req) {
  const { password } = await req.json()
  if (password === PASSWORD) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('wkt_host', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return res
  }
  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('wkt_host')
  return res
}
