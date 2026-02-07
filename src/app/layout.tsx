import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'memuPlanner',
  description: 'Memory-driven time planning prototype',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-deepStone">
        {children}
      </body>
    </html>
  )
}

