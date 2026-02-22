import './globals.css'; // Ensure your global styles remain imported

export const metadata = {
  title: 'Khyentse Önang Digital Archive',
  description: 'Digital Archive, Virtual Museum, and Scholar’s Teaching Portal',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Legacy Hyperaudio <Script> tags have been removed from here.
          They are now securely injected dynamically inside the Player component.
        */}
        {children}
      </body>
    </html>
  );
}