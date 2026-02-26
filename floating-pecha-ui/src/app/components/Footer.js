import React from 'react';
import { inter } from '@/lib/theme';

export default function Footer({ className = '' }) {
  return (
    <footer className={`w-full py-8 flex items-center justify-center ${className}`}>
      <p className={`${inter.className} text-[var(--theme-gray)] text-[10px] md:text-xs font-medium tracking-[0.2em] uppercase opacity-80`}>
        &copy; {new Date().getFullYear()} Shechen Archives
      </p>
    </footer>
  );
}