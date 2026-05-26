import type { Metadata } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Jesús Peralta Peluqueros | Madrid',
  description:
    'Salón de peluquería y estética en Madrid. C/ José Abascal 61. Especialistas en coloración orgánica, cortes y tratamientos capilares.',
  keywords: ['peluquería Madrid', 'salón belleza Madrid', 'coloración orgánica', 'José Abascal'],
  openGraph: {
    title: 'Jesús Peralta Peluqueros',
    description: 'Salón de peluquería y estética en Madrid · C/ José Abascal 61',
    locale: 'es_ES',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="bg-bg text-[#F0F0F0] font-sans antialiased">{children}</body>
    </html>
  )
}
