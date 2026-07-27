import './globals.css';
import { AudioProvider } from '@/context/AudioContext';

export const metadata = {
  title: 'Sona - Personal Emotion & Music Research Platform',
  description: 'Research Platform for Music and Emotional Regulation',
  manifest: '/manifest.json',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-950 antialiased">
        <AudioProvider>
          {children}
        </AudioProvider>
      </body>
    </html>
  );
}