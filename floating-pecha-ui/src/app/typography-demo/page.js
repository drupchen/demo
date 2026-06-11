"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Jomolhari } from 'next/font/google';
import { inter } from '@/lib/theme';
import './typography-demo.css';

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------
const jomolhari = Jomolhari({
  weight: '400',
  subsets: ['tibetan'],
  display: 'swap',
  variable: '--font-jomolhari',
});

// ---------------------------------------------------------------------------
// Text samples (from rpn_ngondro_1/manifest.json, indices 25-86)
// ---------------------------------------------------------------------------
const BIG_TEXT = '༄༅། །ན་མོ་གུ་རུ་བྷྱཿ ';
const SMALL_TEXT =
  'འདིར་རྩ་གསུམ་གཅིག་དྲིལ་ཐུགས་སྒྲུབ་དངོས་གྲུབ་སྙིང་པོའི་དབང་བཞིའི་ལམ་ཡོངས་སུ་རྫོགས་པ་ཉམས་སུ་ལེན་པ་ལ་མེད་དུ་མི་རུང་བ་སྔོན་འགྲོའི་ངག་འདོན་འཇུག་བདེར་བསྡེབ་པ་ལ་གསུམ། ཐུན་གྱི་སྔོན་འགྲོ། ཐུན་མོང་གི་སྔོན་འགྲོ། ཁྱད་པར་གྱི་སྔོན་འགྲོའོ། །';

// Longer passage for text-box demo
const LONG_TIBETAN =
  'དང་པོ་ནི། ཐོག་མར་བདེ་བའི་སྟན་ལ་སྒོ་གསུམ་བག་ཕབ་སྟེ་ངལ་གསོ། རླུང་རོ་བསལ། ལུས་སེམས་ཁོང་ལྷོད་ནས་ཀུན་སློང་ལེགས་པར་བཅོས།';

// Mixed script samples
const MIXED_SANS =
  'Session A1 begins at the mantra ན་མོ་གུ་རུ་བྷྱཿ and covers the refuge section (སྐྱབས་འགྲོ) as taught by Dilgo Khyentse Rinpoche.';
const MIXED_SERIF =
  'The text of the Ngondro (སྔོན་འགྲོ) practice, composed by Jamyang Khyentse Wangpo (འཇམ་དབྱངས་མཁྱེན་བརྩེའི་དབང་པོ), includes preliminary practices essential for all students.';

const SMALL_RATIO = 0.70;

// The Tibetan "x" — བ covers the trunk height perfectly:
// no ascenders (like gi-gu ི) or long descenders (like ཀ's leg).
// Same role as 'x' in Latin: defines the core body height.
const TIB_YARDSTICK = 'བ';

// For mixed script scaling, we match Latin x-height to 6/7 of the བ height.
const MIXED_TRUNK_FRACTION = 6 / 7;

// ---------------------------------------------------------------------------
// Font configs
// ---------------------------------------------------------------------------
const FONT_CONFIGS = [
  { key: 'jomolhari', label: 'Jomolhari', css: 'Jomolhari' },
  { key: 'sadri', label: 'Sadri Yigchen', css: 'Sadri Yigchen' },
  { key: 'chogyal', label: 'Tibetan Chogyal', css: 'Tibetan Chogyal' },
];

const LATIN_FONTS = [
  { key: 'sans', label: 'Inter (sans-serif)', css: 'Inter, system-ui, sans-serif' },
  { key: 'serif', label: 'Georgia (serif)', css: 'Georgia, "Times New Roman", serif' },
];

// ---------------------------------------------------------------------------
// Measurement helper: extract trunk metrics from Canvas
// ---------------------------------------------------------------------------
function measureTrunk(ctx, char, fontCss, sizePx) {
  ctx.font = `${sizePx}px ${fontCss}`;
  const m = ctx.measureText(char);
  return {
    ascent: m.actualBoundingBoxAscent,   // top of ink above alphabetic baseline
    descent: m.actualBoundingBoxDescent, // bottom of ink below alphabetic baseline
    height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, // total ink height
  };
}

// ---------------------------------------------------------------------------
// Hook: comprehensive typography measurements
//
// 1. Yig chung alignment: measure བ at BIG and SMALL sizes for each Tibetan
//    font. The ascent difference = vertical-align offset to align head-strokes.
//
// 2. Mixed script trunk matching: for each (Latin font × Tibetan font) pair,
//    measure Latin 'x' trunk and Tibetan 'བ' trunk. Compute:
//    - scaleRatio: font-size multiplier so བ height = x height
//    - verticalShift: offset so top of scaled བ = top of x
// ---------------------------------------------------------------------------
function useTypographyMetrics(baseSizePx = 28) {
  const [metrics, setMetrics] = useState(null);

  const measure = useCallback(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bigSize = baseSizePx;
    const smallSize = bigSize * SMALL_RATIO;

    // --- Yig chung offsets (same font, two sizes) ---
    const yigchung = {};
    for (const font of FONT_CONFIGS) {
      const fontStr = `"${font.css}"`;
      const big = measureTrunk(ctx, TIB_YARDSTICK, fontStr, bigSize);
      const small = measureTrunk(ctx, TIB_YARDSTICK, fontStr, smallSize);

      // Shift yig chung UP so head-strokes (top of བ trunk) align.
      // Key: vertical-align in em resolves against the ELEMENT's own font-size,
      // not the parent's. Since the child has font-size: 0.70em, we must divide
      // by smallSize (the child's computed size), not bigSize.
      const offsetPx = big.ascent - small.ascent;
      const offsetEm = offsetPx / smallSize;

      yigchung[font.key] = {
        bigAscent: round(big.ascent),
        bigDescent: round(big.descent),
        bigHeight: round(big.height),
        smallAscent: round(small.ascent),
        smallHeight: round(small.height),
        offsetPx: round(offsetPx),
        offsetEm: round3(offsetEm),
      };
    }

    // --- Mixed script alignment (Latin font × Tibetan font) ---
    const mixed = {};
    for (const latin of LATIN_FONTS) {
      for (const tibetan of FONT_CONFIGS) {
        const latTrunk = measureTrunk(ctx, 'x', latin.css, bigSize);
        const tibTrunk = measureTrunk(ctx, TIB_YARDSTICK, `"${tibetan.css}"`, bigSize);

        // Scale: match Latin x-height to 6/7 of བ height.
        // Using the full བ makes Tibetan too small; 6/7 gives better proportion.
        const targetTibHeight = tibTrunk.height * MIXED_TRUNK_FRACTION;
        const scaleRatio = latTrunk.height / targetTibHeight;

        // After scaling, the Tibetan ascent above alphabetic baseline changes:
        const scaledTibAscent = tibTrunk.ascent * scaleRatio;

        // To align tops: shift Tibetan up so top of scaled བ = top of x
        const verticalShift = latTrunk.ascent - scaledTibAscent;

        const pairKey = `${latin.key}_${tibetan.key}`;
        mixed[pairKey] = {
          latinXHeight: round(latTrunk.height),
          latinXAscent: round(latTrunk.ascent),
          tibBaHeight: round(tibTrunk.height),
          tibBaAscent: round(tibTrunk.ascent),
          scaleRatio: round3(scaleRatio),
          scaledFontSize: round(bigSize * scaleRatio),
          verticalShiftPx: round(verticalShift),
          verticalShiftEm: round3(verticalShift / bigSize),
        };
      }
    }

    setMetrics({ yigchung, mixed });
  }, [baseSizePx]);

  useEffect(() => {
    document.fonts.ready.then(measure);
  }, [measure]);

  return metrics;
}

function round(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

// ---------------------------------------------------------------------------
// Helper: wrap Tibetan Unicode ranges in <span> with computed styling
// ---------------------------------------------------------------------------
function MixedText({ text, tibetanClass, tibetanStyle }) {
  const parts = text.split(/([\u0F00-\u0FFF\u200B-\u200D]+)/g);
  return (
    <span>
      {parts.map((part, i) =>
        /[\u0F00-\u0FFF]/.test(part) ? (
          <span key={i} className={tibetanClass} style={tibetanStyle} lang="bo">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TypographyDemoPage() {
  const [latinSize, setLatinSize] = useState(18);
  const metrics = useTypographyMetrics(28);

  // Helper to get tibetan inline style for a mixed pair
  function getMixedTibStyle(latinKey, tibKey, tibCss, nominalSize) {
    const m = metrics?.mixed?.[`${latinKey}_${tibKey}`];
    if (!m) return { fontFamily: tibCss };
    const scaledSize = nominalSize * m.scaleRatio;
    return {
      fontFamily: tibCss,
      fontSize: `${scaledSize}px`,
      verticalAlign: `${m.verticalShiftPx * (nominalSize / 28)}px`,
    };
  }

  // Helper to get jomolhari class + inline style for mixed
  function getJomolhariMixedStyle(latinKey, nominalSize) {
    const m = metrics?.mixed?.[`${latinKey}_jomolhari`];
    if (!m) return {};
    const scaledSize = nominalSize * m.scaleRatio;
    return {
      fontSize: `${scaledSize}px`,
      verticalAlign: `${m.verticalShiftPx * (nominalSize / 28)}px`,
    };
  }

  return (
    <main className={`typo-page ${inter.variable} ${jomolhari.variable}`}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      <h1 className="typo-page-title" style={{ fontFamily: 'Inter, sans-serif' }}>
        Tibetan Typography CSS Techniques
      </h1>
      <p className="typo-page-subtitle">
        Modern CSS solutions for yig chung alignment, cross-script trunk matching, and metric normalisation.
        Using བ as yardstick (the Tibetan &ldquo;x&rdquo;).
      </p>

      {/* ================================================================
          SECTION 1 — Yig Chung Alignment: Old vs New
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">1. Yig Chung Alignment</h2>
        <p className="typo-section-desc">
          BIG text followed by inline SMALL (yig chung) text. The top of the trunk (བ level)
          must align — not the gi-gu or other vowel marks above, and not the long leg of ཀ below.
        </p>

        <div className="typo-comparison">
          {/* OLD approach */}
          <div className="typo-panel">
            <div className="typo-panel-label typo-label-old">Old — hardcoded vertical-align: 0.33em</div>
            <p style={{ fontSize: '1.75rem', lineHeight: 2 }}>
              <span className={jomolhari.className}>{BIG_TEXT}</span>
              <span className={jomolhari.className} style={{ fontSize: '0.70em', verticalAlign: '0.33em' }}>
                {SMALL_TEXT}
              </span>
            </p>
            <div className="typo-code">{`.yig-chung {
  font-size: 0.70em;
  vertical-align: 0.33em;   /* hardcoded — fragile, font-dependent */
}`}</div>
          </div>

          {/* NEW approach: TextMetrics-computed from བ */}
          <div className="typo-panel">
            <div className="typo-panel-label typo-label-new">
              New — TextMetrics (བ yardstick)
            </div>
            <p style={{ fontSize: '1.75rem', lineHeight: 2 }}>
              <span className={jomolhari.className}>{BIG_TEXT}</span>
              <span
                className={jomolhari.className}
                style={{
                  fontSize: '0.70em',
                  verticalAlign: metrics?.yigchung?.jomolhari
                    ? `${metrics.yigchung.jomolhari.offsetEm}em`
                    : '0.33em',
                }}
              >
                {SMALL_TEXT}
              </span>
            </p>
            <div className="typo-code">{`// བ = Tibetan "x": covers the trunk, no ascenders/descenders
ctx.font = '28px "Jomolhari"';
const bigTrunk = ctx.measureText('བ').actualBoundingBoxAscent;
ctx.font = '19.6px "Jomolhari"';  // 28 × 0.70
const smallTrunk = ctx.measureText('བ').actualBoundingBoxAscent;
const offsetEm = (bigTrunk - smallTrunk) / 28;
// → vertical-align: \${offsetEm}em`}</div>

            {metrics?.yigchung?.jomolhari && (
              <div className="typo-metrics">
                <div className="typo-metrics-title">Measured (Jomolhari @ 28px, yardstick: བ):</div>
                <table className="typo-metrics-table">
                  <tbody>
                    <tr><td>བ ascent (BIG)</td><td>{metrics.yigchung.jomolhari.bigAscent}px</td></tr>
                    <tr><td>བ descent (BIG)</td><td>{metrics.yigchung.jomolhari.bigDescent}px</td></tr>
                    <tr><td>བ trunk height (BIG)</td><td>{metrics.yigchung.jomolhari.bigHeight}px</td></tr>
                    <tr><td>བ ascent (SMALL)</td><td>{metrics.yigchung.jomolhari.smallAscent}px</td></tr>
                    <tr><td>Computed offset</td><td><strong>{metrics.yigchung.jomolhari.offsetPx}px = {metrics.yigchung.jomolhari.offsetEm}em</strong></td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="typo-note">
          <strong>Why བ and not ཀ?</strong> Just as Latin uses &lsquo;x&rsquo; (not &lsquo;p&rsquo; or &lsquo;l&rsquo;)
          to define the core body height, Tibetan uses བ (or མ, ང, ས, ར, ལ) — letters whose ink covers
          exactly the &ldquo;trunk&rdquo; without ascenders (like gi-gu ི) or long descenders (like ཀ&rsquo;s leg).
          Measuring ཀ overestimates the trunk because its descending stroke extends well below the baseline of ordinary letters.
        </div>
      </section>

      {/* ================================================================
          SECTION 2 — Mixed Script: Trunk-to-Trunk Alignment
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">2. Mixed Latin / Tibetan — Trunk Alignment</h2>
        <p className="typo-section-desc">
          Goal: Latin x-height = 6/7 of Tibetan བ-height, with tops aligned.
          Tibetan is scaled and shifted to match.
        </p>

        {/* No adjustment */}
        <div className="typo-mixed-row">
          <div className="typo-mixed-label">Sans-serif (Inter) + Jomolhari — no adjustment</div>
          <p style={{ fontSize: '1.1rem', lineHeight: 2 }}>
            <MixedText text={MIXED_SANS} tibetanClass={jomolhari.className} />
          </p>
        </div>

        {/* Trunk-matched */}
        <div className="typo-mixed-row">
          <div className="typo-mixed-label">Sans-serif (Inter) + Jomolhari — trunk-matched (x = 6/7 བ)</div>
          <p style={{ fontSize: '17.6px', lineHeight: 2 }}>
            <MixedText
              text={MIXED_SANS}
              tibetanClass={jomolhari.className}
              tibetanStyle={getJomolhariMixedStyle('sans', 17.6)}
            />
          </p>
        </div>

        {/* No adjustment serif */}
        <div className="typo-mixed-row">
          <div className="typo-mixed-label">Serif (Georgia) + Jomolhari — no adjustment</div>
          <p style={{ fontSize: '1.1rem', lineHeight: 2, fontFamily: 'Georgia, "Times New Roman", serif' }}>
            <MixedText text={MIXED_SERIF} tibetanClass={jomolhari.className} />
          </p>
        </div>

        {/* Trunk-matched serif */}
        <div className="typo-mixed-row">
          <div className="typo-mixed-label">Serif (Georgia) + Jomolhari — trunk-matched (x = 6/7 བ)</div>
          <p style={{ fontSize: '17.6px', lineHeight: 2, fontFamily: 'Georgia, "Times New Roman", serif' }}>
            <MixedText
              text={MIXED_SERIF}
              tibetanClass={jomolhari.className}
              tibetanStyle={getJomolhariMixedStyle('serif', 17.6)}
            />
          </p>
        </div>

        {metrics?.mixed?.sans_jomolhari && (
          <div className="typo-metrics" style={{ marginTop: '1rem' }}>
            <div className="typo-metrics-title">Trunk measurements (@ 28px nominal):</div>
            <table className="typo-metrics-table">
              <tbody>
                <tr><td>Latin &lsquo;x&rsquo; height (Inter)</td><td>{metrics.mixed.sans_jomolhari.latinXHeight}px</td></tr>
                <tr><td>Latin &lsquo;x&rsquo; ascent (Inter)</td><td>{metrics.mixed.sans_jomolhari.latinXAscent}px</td></tr>
                <tr><td>Tibetan བ height (Jomolhari)</td><td>{metrics.mixed.sans_jomolhari.tibBaHeight}px</td></tr>
                <tr><td>Tibetan བ ascent (Jomolhari)</td><td>{metrics.mixed.sans_jomolhari.tibBaAscent}px</td></tr>
                <tr><td>Scale ratio</td><td><strong>{metrics.mixed.sans_jomolhari.scaleRatio}</strong> (Tibetan font-size × this)</td></tr>
                <tr><td>Vertical shift</td><td><strong>{metrics.mixed.sans_jomolhari.verticalShiftPx}px</strong> (align tops)</td></tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="typo-code">{`// Trunk matching: Latin 'x' height = 6/7 of Tibetan 'བ' height
const latX = measureTrunk(ctx, 'x', 'Inter', size);   // x-height
const tibBa = measureTrunk(ctx, 'བ', 'Jomolhari', size); // བ-height

// Scale Tibetan so x-height matches 6/7 of བ
const scale = latX.height / (tibBa.height * 6/7);
const tibFontSize = nominalSize * scale;

// Shift so tops align (hanging line = x-top)
const shift = latX.ascent - (tibBa.ascent * scale);

// Apply to Tibetan spans:
//   font-size: \${tibFontSize}px
//   vertical-align: \${shift}px`}</div>
      </section>

      {/* ================================================================
          SECTION 3 — Font Comparison
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">3. Font Comparison — BIG + Yig Chung with English</h2>
        <p className="typo-section-desc">
          Same passage in three fonts. Yig chung aligned via བ-based offset.
          Mixed English uses trunk-matched scaling.
        </p>

        <div className="typo-font-stack">
          {FONT_CONFIGS.map(({ key, label, css }) => {
            const yc = metrics?.yigchung?.[key];
            const offsetVal = yc ? `${yc.offsetEm}em` : '0.33em';
            const tibCss = key === 'jomolhari' ? undefined : `'${css}', serif`;
            const tibClass = key === 'jomolhari' ? jomolhari.className : undefined;
            const tibInline = tibCss ? { fontFamily: tibCss } : undefined;

            return (
              <div key={key} className="typo-font-card">
                <div className="typo-font-name">
                  {label}
                  {yc && <span className="typo-font-offset"> (yig chung offset: {yc.offsetEm}em)</span>}
                </div>

                {/* BIG + yig chung */}
                <p style={{ fontSize: '1.75rem', lineHeight: 2 }}>
                  <span className={tibClass} style={tibInline}>{BIG_TEXT}</span>
                  <span
                    className={tibClass}
                    style={{
                      ...tibInline,
                      fontSize: '0.70em',
                      verticalAlign: offsetVal,
                    }}
                  >
                    {SMALL_TEXT}
                  </span>
                </p>

                {/* Sans-serif mixed — trunk-matched */}
                <p style={{ fontSize: '17.6px', lineHeight: 2, marginTop: '0.75rem' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif' }}>Sans-serif: </span>
                  <MixedText
                    text={MIXED_SANS}
                    tibetanClass={tibClass}
                    tibetanStyle={
                      key === 'jomolhari'
                        ? getJomolhariMixedStyle('sans', 17.6)
                        : getMixedTibStyle('sans', key, tibCss, 17.6)
                    }
                  />
                </p>

                {/* Serif mixed — trunk-matched */}
                <p style={{ fontSize: '17.6px', lineHeight: 2, fontFamily: 'Georgia, serif', marginTop: '0.5rem' }}>
                  <span>Serif: </span>
                  <MixedText
                    text={MIXED_SERIF}
                    tibetanClass={tibClass}
                    tibetanStyle={
                      key === 'jomolhari'
                        ? getJomolhariMixedStyle('serif', 17.6)
                        : getMixedTibStyle('serif', key, tibCss, 17.6)
                    }
                  />
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================================================================
          SECTION 4 — Interactive Size Scaling
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">4. Interactive Size Scaling</h2>
        <p className="typo-section-desc">
          Change the Latin font size — Tibetan is scaled and shifted to keep trunks aligned (x = བ).
        </p>

        <div className="typo-slider-group">
          <span className="typo-slider-label">Latin font size</span>
          <input
            type="range"
            className="typo-slider"
            min={12}
            max={32}
            step={1}
            value={latinSize}
            onChange={(e) => setLatinSize(Number(e.target.value))}
          />
          <span className="typo-slider-value">{latinSize}px</span>
        </div>

        <div className="typo-font-stack">
          {FONT_CONFIGS.map(({ key, label, css }) => {
            const tibCss = key === 'jomolhari' ? undefined : `'${css}', serif`;
            const tibClass = key === 'jomolhari' ? jomolhari.className : undefined;
            const sansMixed = metrics?.mixed?.[`sans_${key}`];
            const serifMixed = metrics?.mixed?.[`serif_${key}`];

            return (
              <div key={key} className="typo-font-card">
                <div className="typo-font-name">
                  {label}
                  {sansMixed && <span className="typo-font-offset"> (scale: {sansMixed.scaleRatio}, shift: {sansMixed.verticalShiftEm}em)</span>}
                </div>

                {/* Sans-serif */}
                <p style={{ fontSize: `${latinSize}px`, lineHeight: 2, fontFamily: 'Inter, sans-serif' }}>
                  <MixedText
                    text={MIXED_SANS}
                    tibetanClass={tibClass}
                    tibetanStyle={
                      key === 'jomolhari'
                        ? getJomolhariMixedStyle('sans', latinSize)
                        : getMixedTibStyle('sans', key, tibCss, latinSize)
                    }
                  />
                </p>

                {/* Serif */}
                <p style={{ fontSize: `${latinSize}px`, lineHeight: 2, fontFamily: 'Georgia, serif', marginTop: '0.5rem' }}>
                  <MixedText
                    text={MIXED_SERIF}
                    tibetanClass={tibClass}
                    tibetanStyle={
                      key === 'jomolhari'
                        ? getJomolhariMixedStyle('serif', latinSize)
                        : getMixedTibStyle('serif', key, tibCss, latinSize)
                    }
                  />
                </p>
              </div>
            );
          })}
        </div>

        <div className="typo-code">{`// The scale ratio is font-size-independent (it's a metric ratio).
// So we can compute it once and apply at any Latin font size:
//   tibetanFontSize = latinFontSize × scaleRatio
//   verticalAlign   = latinFontSize × verticalShiftEm`}</div>
      </section>

      {/* ================================================================
          SECTION 5 — text-box Trimming
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">5. text-box Trimming</h2>
        <p className="typo-section-desc">
          Jomolhari&rsquo;s massive OpenType ascenders blow out <code>line-height</code>.
          Compare default rendering vs <code>text-box: trim-both cap alphabetic</code>.
        </p>

        <div className="typo-comparison">
          <div className="typo-panel">
            <div className="typo-panel-label typo-label-old">Default — line-height blowout</div>
            <div className="typo-bg-lines" style={{ lineHeight: 1.5 }}>
              <p className={jomolhari.className} style={{ fontSize: '1.5rem' }}>
                {BIG_TEXT}{LONG_TIBETAN}
              </p>
              <p style={{ fontSize: '1rem', fontFamily: 'Inter, sans-serif', marginTop: '0.5rem' }}>
                Adjacent Latin paragraph with line-height: 1.5 — notice the gap above.
              </p>
            </div>
            <div className="typo-code">{`/* Default: Jomolhari's sTypoAscender
   causes massive half-leading */
line-height: 1.5;`}</div>
          </div>

          <div className="typo-panel">
            <div className="typo-panel-label typo-label-new">Trimmed — text-box: trim-both</div>
            <div className="typo-bg-lines" style={{ lineHeight: 1.5 }}>
              <p className={`${jomolhari.className} typo-trimmed`} style={{ fontSize: '1.5rem' }}>
                {BIG_TEXT}{LONG_TIBETAN}
              </p>
              <p className="typo-trimmed" style={{ fontSize: '1rem', fontFamily: 'Inter, sans-serif', marginTop: '0.5rem' }}>
                Adjacent Latin paragraph with line-height: 1.5 — tighter spacing, stacks render as ink overflow.
              </p>
            </div>
            <div className="typo-code">{`.tibetan-block {
  text-box: trim-both cap alphabetic;
  line-height: 1.5;
}`}</div>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 6 — @font-face Metric Overrides
          ================================================================ */}
      <section className="typo-section">
        <h2 className="typo-section-title">6. @font-face Metric Overrides</h2>
        <p className="typo-section-desc">
          Taming volatile fonts with <code>ascent-override</code> / <code>descent-override</code>.
        </p>

        <div className="typo-comparison">
          <div className="typo-panel">
            <div className="typo-panel-label typo-label-old">Raw Jomolhari — line-height: 1.5</div>
            <div style={{ background: 'repeating-linear-gradient(to bottom, rgba(212,175,55,0.08) 0px, rgba(212,175,55,0.08) 1.5em, transparent 1.5em, transparent 3em)', fontSize: '1.5rem' }}>
              <p className={jomolhari.className} style={{ fontSize: '1.5rem', lineHeight: 1.5, margin: 0 }}>
                {BIG_TEXT}{LONG_TIBETAN}
              </p>
              <p className={jomolhari.className} style={{ fontSize: '1.5rem', lineHeight: 1.5, margin: 0 }}>
                {SMALL_TEXT}
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'Inter, sans-serif', margin: '0.5rem 0 0' }}>
                Adjacent Latin text — same line-height: 1.5. Notice how Jomolhari&rsquo;s native metrics
                push lines apart far more than the Latin text above.
              </p>
            </div>
          </div>

          <div className="typo-panel">
            <div className="typo-panel-label typo-label-new">Jomolhari Tamed — same line-height: 1.5</div>
            <div style={{ background: 'repeating-linear-gradient(to bottom, rgba(22,163,74,0.06) 0px, rgba(22,163,74,0.06) 1.5em, transparent 1.5em, transparent 3em)', fontSize: '1.5rem' }}>
              <p style={{ fontFamily: "'Jomolhari Tamed', serif", fontSize: '1.5rem', lineHeight: 1.5, margin: 0 }}>
                {BIG_TEXT}{LONG_TIBETAN}
              </p>
              <p style={{ fontFamily: "'Jomolhari Tamed', serif", fontSize: '1.5rem', lineHeight: 1.5, margin: 0 }}>
                {SMALL_TEXT}
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'Inter, sans-serif', margin: '0.5rem 0 0' }}>
                Same Latin text — with tamed metrics, line spacing is consistent and predictable.
                The glyphs are identical; only the line box calculation changes.
              </p>
            </div>
            <div className="typo-code">{`@font-face {
  font-family: 'Jomolhari Tamed';
  src: url('/fonts/jomolhari.woff2') format('woff2');
  ascent-override: 100%;   /* normalize ascender */
  descent-override: 40%;   /* normalize descender */
  line-gap-override: 0%;   /* remove line gap */
}
/* Glyphs are identical — only line spacing changes.
   Total metric height: 140% vs raw ~250%+ */`}</div>
          </div>
        </div>
      </section>

      {/* ================================================================
          Appendix: All Measurements
          ================================================================ */}
      {metrics && (
        <section className="typo-section">
          <h2 className="typo-section-title">Appendix: TextMetrics Measurements</h2>
          <p className="typo-section-desc">
            Trunk heights measured via <code>Canvas.measureText(&lsquo;བ&rsquo;)</code> and
            <code>measureText(&lsquo;x&rsquo;)</code> at 28px.
          </p>

          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>
            Yig Chung Offsets (same font, BIG→SMALL)
          </h3>
          <table className="typo-full-table">
            <thead>
              <tr>
                <th>Font</th>
                <th>བ ascent (BIG)</th>
                <th>བ height (BIG)</th>
                <th>བ ascent (SMALL)</th>
                <th>Offset (px)</th>
                <th>Offset (em)</th>
              </tr>
            </thead>
            <tbody>
              {FONT_CONFIGS.map(({ key, label }) => {
                const o = metrics.yigchung[key];
                if (!o) return null;
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{o.bigAscent}px</td>
                    <td>{o.bigHeight}px</td>
                    <td>{o.smallAscent}px</td>
                    <td>{o.offsetPx}px</td>
                    <td><strong>{o.offsetEm}em</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            Mixed Script Scaling (Latin x → 6/7 Tibetan བ)
          </h3>
          <table className="typo-full-table">
            <thead>
              <tr>
                <th>Latin × Tibetan</th>
                <th>x height</th>
                <th>བ height</th>
                <th>Scale ratio</th>
                <th>Vertical shift</th>
              </tr>
            </thead>
            <tbody>
              {LATIN_FONTS.map(latin =>
                FONT_CONFIGS.map(tib => {
                  const m = metrics.mixed[`${latin.key}_${tib.key}`];
                  if (!m) return null;
                  return (
                    <tr key={`${latin.key}_${tib.key}`}>
                      <td>{latin.label} × {tib.label}</td>
                      <td>{m.latinXHeight}px</td>
                      <td>{m.tibBaHeight}px</td>
                      <td><strong>{m.scaleRatio}</strong></td>
                      <td>{m.verticalShiftPx}px ({m.verticalShiftEm}em)</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="typo-code">{`// Production: compute ratios once after font load, store as CSS vars
document.fonts.ready.then(() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const sz = 100; // measure at large size for precision

  // Latin trunk
  ctx.font = \`\${sz}px Inter\`;
  const xm = ctx.measureText('x');
  const xH = xm.actualBoundingBoxAscent + xm.actualBoundingBoxDescent;

  // Tibetan trunk
  ctx.font = \`\${sz}px "Jomolhari"\`;
  const bm = ctx.measureText('བ');
  const bH = bm.actualBoundingBoxAscent + bm.actualBoundingBoxDescent;

  const scale = xH / (bH * 6/7);
  const shift = (xm.actualBoundingBoxAscent - bm.actualBoundingBoxAscent * scale) / sz;

  document.documentElement.style.setProperty('--tib-scale', scale);
  document.documentElement.style.setProperty('--tib-shift', shift + 'em');
});`}</div>
        </section>
      )}

      <footer style={{ textAlign: 'center', padding: '2rem 0', color: '#9CA3AF', fontSize: '0.8rem' }}>
        Shechen Archives — Tibetan Typography Demo
      </footer>
    </main>
  );
}
