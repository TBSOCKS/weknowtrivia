import { Bebas_Neue, DM_Sans } from 'next/font/google'
import './globals.css'

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
})

const dm = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  display: 'swap',
})

export const metadata = {
  title: 'We Know Trivia',
  description: 'Reality TV Trivia — A Rob Has a Podcast Experience',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bebas.variable} ${dm.variable}`}>
      <body className="font-body antialiased">{children}</body>
    </html>
  )
}
