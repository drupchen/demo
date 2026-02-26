import { Providers } from './Providers';
import ArchiveHeader from './components/ArchiveHeader'; // Ensure this matches your filename!
import './globals.css';

export const metadata = {
  title: 'Khyentse Önang Digital Archive',
  description: 'Digital Archive, Virtual Museum, and Scholar’s Teaching Portal',
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