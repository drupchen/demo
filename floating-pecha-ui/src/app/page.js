"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cormorant, outfit } from "@/lib/theme";
import styles from "./page.module.css";

// Six gateways into the archive. Order matters — first row is welcome / how-to,
// second row is the three teachings we have data for plus the search guide.
const GATEWAYS = [
  {
    badge: "◆ Article",
    badgeClass: "bArticle",
    grad: "tAzure",
    svg: (
      <svg viewBox="0 0 300 132" preserveAspectRatio="none">
        <path d="M-20 124 Q150 30 320 124" fill="none" stroke="#ECB320" strokeWidth="1" />
      </svg>
    ),
    title: "Dilgo Khyentse’s World",
    blurb: "Placeholder content. Yet to be created.",
    cta: "Read",
    href: "/world",
  },
  {
    badge: "❖ Collection",
    badgeClass: "bCollection",
    grad: "tJade",
    svg: (
      <svg viewBox="0 0 300 132" preserveAspectRatio="none">
        <circle cx="150" cy="66" r="48" fill="none" stroke="#F0EBDE" strokeWidth=".8" />
      </svg>
    ),
    title: "Teaching Archives",
    blurb:
      "Sample text, sample text, sample text, sample text, sample text, sample text, sample text, sample text, sample text.",
    cta: "Enter",
    href: "/archive",
  },
  {
    badge: "♫ Playlist",
    badgeClass: "bPlaylist",
    grad: "tAmber",
    svg: (
      <svg viewBox="0 0 300 132" preserveAspectRatio="none">
        <path d="M40 100 H260 M40 80 H260" stroke="#F0EBDE" strokeWidth=".6" />
      </svg>
    ),
    title: "Teachings’ Catalog - April ’26",
    blurb: "MP3 files of all the identified teaching sessions",
    cta: "Enter",
    href: "/teachings-catalog",
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const revealRefs = useRef([]);

  // Topbar darkens on scroll past ~40px
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // IntersectionObserver-driven fade-in for `.reveal` elements
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.revealIn);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16 }
    );
    revealRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const addReveal = (i) => (el) => {
    revealRefs.current[i] = el;
  };

  return (
    <div className={`${styles.page} ${outfit.className} ${cormorant.variable} ${outfit.variable}`}>
      <div className={styles.grain} />

      {/* TOPBAR */}
      <header className={`${styles.topbar} ${scrolled ? styles.topbarScrolled : ""}`}>
        <Link href="/" className={styles.brand}>
          <img src="/images/moon.png" alt="" className={styles.seal} />
          <span className={styles.brandName}>Rabsal Dawa</span>
        </Link>
        <nav className={styles.navlinks}>
          <a href="#gateways">Explore</a>
          <Link href="/archive">Archive</Link>
          <Link href="/archive?view=search">Search</Link>
        </nav>
      </header>

      {/* ACT I — THE BRILLIANCE */}
      <section className={styles.stage}>
        <div className={styles.halo}>
          <div className={`${styles.ring} ${styles.r1}`} />
          <div className={`${styles.ring} ${styles.r2}`} />
          <div className={`${styles.ring} ${styles.r3}`} />
          <div className={`${styles.ring} ${styles.r4}`} />
          <div className={`${styles.ring} ${styles.r5}`} />
          <div className={`${styles.ring} ${styles.r6}`} />
          <div className={`${styles.ring} ${styles.r7}`} />
          <div className={`${styles.ring} ${styles.r8}`} />
          <div className={styles.moon} />
        </div>
        <div className={styles.heroTop}>
          <div className={styles.eyebrow}>
            <span>Oral Teachings Archive</span>
          </div>
          <h1 className={`${cormorant.className} ${styles.title}`}>
            Rabsal <span className={styles.titleAccent}>Dawa</span>
          </h1>
        </div>

        <div className={styles.heroBottom}>
          <p className={styles.lede}>
            Sample text, sample text, sample text, sample text, sample text, sample text, sample
            text, sample text, sample text.
          </p>
        </div>

        <div className={styles.scrollHint}>
          Scroll
          <span className={styles.chev} />
        </div>
      </section>

      {/* ACT II — THE APPROACH */}
      <section ref={addReveal(0)} className={`${styles.approach} ${styles.reveal}`}>
        <div className={styles.approachMark}>❖</div>
        <h2>
          Sample text, sample text, sample text, sample text, sample text.
        </h2>
        <p>
          Sample text, sample text, sample text, sample text, sample text, sample text, sample
          text, sample text, sample text, sample text, sample text.
        </p>
      </section>

      {/* ACT III — THE RESTING PLACE */}
      <section className={styles.gateways} id="gateways">
        <div ref={addReveal(1)} className={`${styles.gatewaysHead} ${styles.reveal}`}>
          <h2>Ways to begin</h2>
          <p>Gateways into the collection — read, listen, or follow a guided path.</p>
        </div>
        <div className={styles.grid}>
          {GATEWAYS.map((g, i) => (
            <Link
              key={g.title}
              ref={addReveal(2 + i)}
              href={g.href}
              className={`${styles.card} ${styles.reveal}`}
              style={{ transitionDelay: `${(i % 3) * 0.08}s` }}
            >
              <div className={styles.thumb}>
                <div className={`${styles.grad} ${styles[g.grad]}`} />
                {g.svg}
              </div>
              <div className={styles.body}>
                <span className={`${styles.badge} ${styles[g.badgeClass]}`}>{g.badge}</span>
                <h3>{g.title}</h3>
                <p>{g.blurb}</p>
                <span className={styles.enter}>
                  {g.cta} <span className={styles.arrow}>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <footer ref={addReveal(8)} className={`${styles.footer} ${styles.reveal}`}>
          <div>
            <h4>
              Rabsal Dawa
            </h4>
            <p>
              A digital archive of the teachings of Dilgo Khyentse Rinpoche — preserved and shared
              by Shechen Archives.
            </p>
          </div>
          <div className={styles.footMeta}>
            © 2026 Shechen Archives
          </div>
        </footer>
      </section>
    </div>
  );
}
