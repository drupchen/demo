import './globals.css'; // Ensure your global styles remain imported

export const metadata = {
  title: 'Khyentse Önang Digital Archive',
  description: 'Digital Archive, Virtual Museum, and Scholar’s Teaching Portal',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}