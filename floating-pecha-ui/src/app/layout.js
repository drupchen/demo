import { Providers } from './Providers';
import ArchiveHeader from './components/ArchiveHeader'; // Ensure this matches your filename!
import './globals.css';

export const metadata = {
  title: 'Rabsal Dawa · The Brilliant Moon',
  description:
    'A digital archive of the recorded teachings of Dilgo Khyentse Rinpoche — preserved, aligned to their texts, and opened to all who wish to listen.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* 1. Wrap the app in the NextAuth Providers */}
        <Providers>

          {/* 2. Insert the Global Header (which contains the Login button) */}
          <ArchiveHeader transparent={true} />

          {/* 3. The rest of your pages (like page.js) render here */}
          {children}

        </Providers>
      </body>
    </html>
  );
}