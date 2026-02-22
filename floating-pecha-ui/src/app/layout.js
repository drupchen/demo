import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script"; // <-- REQUIRED IMPORT
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Tibetan Teaching Player",
  description: "Synchronized media and transcript player",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}

        {/* These tags load the scripts so window.HyperaudioLite becomes available */}
        <Script src="/js/hyperaudio-lite.js" strategy="beforeInteractive" />
        <Script src="/js/hyperaudio-lite-extension.js" strategy="beforeInteractive" />
        <Script src="/js/caption.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}