import './globals.css';
import { AudioProvider } from '@/context/AudioContext';
import MusicPlayer from '@/components/MusicPlayer';

export const metadata = {
  title: 'Sona - Personal Emotion & Music Research Platform',
  description: 'Research Platform for Music and Emotional Regulation',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sona',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
};

export const viewport = {
  themeColor: '#090d16',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-950 antialiased">
        <AudioProvider>
          {children}
          <MusicPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
