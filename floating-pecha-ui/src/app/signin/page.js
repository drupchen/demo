"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { cormorant, outfit } from "@/lib/theme";

const colors = {
  cream: "#F8F5EE",
  creamSoft: "#F0EBDE",
  sky900: "#0A2347",
  sky800: "#123B73",
  inkSoft: "#5E6B78",
  ink: "#33414F",
  cinnabar: "#A8231B",
  vermilion: "#C22920",
  gold: "#ECB320",
  goldSoft: "#E9C56B",
  bronze: "#A28348",
  cline: "rgba(162, 131, 72, 0.26)",
  gline: "rgba(236, 179, 32, 0.42)",
  glineSoft: "rgba(236, 179, 32, 0.20)",
};

const ERROR_MESSAGES = {
  CredentialsSignin: "The username or password is incorrect.",
  Default: "Something went wrong. Please try again.",
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/archive";
  const initialError = searchParams.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ? ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.Default : null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      username: username.trim(),
      password,
      callbackUrl,
    });

    // Auth.js v5 beta returns ok=true on auth failure (it reflects HTTP
    // status, not auth success). The reliable failure signal is `error`,
    // and `url` is null on failure. Check `error` first.
    if (!result || result.error) {
      setError(ERROR_MESSAGES[result?.error] ?? ERROR_MESSAGES.Default);
      setSubmitting(false);
      return;
    }

    router.push(result.url ?? callbackUrl);
  }

  return (
    <main
      className={`${outfit.className} ${cormorant.variable} ${outfit.variable}`}
      style={{
        minHeight: "calc(100vh - 73px)",
        background: `linear-gradient(180deg, ${colors.cream} 0%, ${colors.creamSoft} 100%)`,
        color: colors.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          padding: "44px 40px 40px",
          borderRadius: 10,
          border: `1px solid ${colors.cline}`,
          boxShadow: "0 22px 50px -28px rgba(7, 27, 56, 0.32)",
          position: "relative",
        }}
      >
        {/* Brand seal */}
        <Link
          href="/"
          aria-label="Rabsal Dawa — home"
          style={{
            position: "absolute",
            top: -22,
            left: "50%",
            transform: "translateX(-50%)",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 38% 30%, #E9C56B, #ECB320 58%, #A28348)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0A2347",
            fontSize: 20,
            boxShadow:
              "0 0 0 1px rgba(236, 179, 32, 0.42), 0 0 18px rgba(236, 179, 32, 0.4)",
            textDecoration: "none",
          }}
        >
          ༀ
        </Link>

        {/* Eyebrow */}
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: colors.bronze,
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          <span style={{ position: "relative", padding: "0 16px" }}>
            <span
              style={{
                position: "absolute",
                top: "50%",
                right: "100%",
                width: 30,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${colors.gline})`,
                transform: "scaleX(-1)",
              }}
            />
            Rabsal Dawa
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "100%",
                width: 30,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${colors.gline})`,
              }}
            />
          </span>
        </div>

        {/* Title */}
        <h1
          className={cormorant.className}
          style={{
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.1,
            color: colors.sky900,
            textAlign: "center",
            margin: "0 0 8px",
            letterSpacing: "-0.005em",
          }}
        >
          Sign{" "}
          <span style={{ color: colors.cinnabar, fontStyle: "italic", fontWeight: 600 }}>
            in
          </span>
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: 13.5,
            fontWeight: 300,
            color: colors.inkSoft,
            margin: "0 0 28px",
          }}
        >
          Enter your archive credentials.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12.5,
              color: colors.cinnabar,
              background: "rgba(168, 35, 27, 0.06)",
              border: "1px solid rgba(168, 35, 27, 0.22)",
              borderRadius: 4,
              padding: "10px 14px",
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
          <Field
            label="Username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={setUsername}
            disabled={submitting}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            disabled={submitting}
          />

          <button
            type="submit"
            disabled={submitting || !username || !password}
            style={{
              marginTop: 8,
              padding: "16px 24px",
              fontSize: 12,
              fontWeight: 400,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: colors.cream,
              background:
                submitting || !username || !password
                  ? "#C7857E"
                  : `radial-gradient(120% 160% at 50% -30%, rgba(216, 92, 27, 0.55), transparent 60%), ${colors.cinnabar}`,
              border: `1px solid ${submitting || !username || !password ? "#C7857E" : colors.cinnabar}`,
              borderRadius: 3,
              cursor: submitting || !username || !password ? "default" : "pointer",
              boxShadow:
                submitting || !username || !password
                  ? "none"
                  : "inset 0 0 0 1px rgba(236, 179, 32, 0.55), 0 14px 30px -14px rgba(122, 24, 18, 0.6)",
              transition: "transform 0.35s cubic-bezier(0.22, 0.61, 0.30, 1), box-shadow 0.35s",
              opacity: submitting || !username || !password ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (submitting || !username || !password) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "inset 0 0 0 1px rgba(236, 179, 32, 0.85), 0 0 22px rgba(236, 179, 32, 0.20), 0 22px 40px -16px rgba(122, 24, 18, 0.8)";
            }}
            onMouseLeave={(e) => {
              if (submitting || !username || !password) return;
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow =
                "inset 0 0 0 1px rgba(236, 179, 32, 0.55), 0 14px 30px -14px rgba(122, 24, 18, 0.6)";
            }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p
          style={{
            marginTop: 28,
            fontSize: 11.5,
            fontWeight: 300,
            color: colors.inkSoft,
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          Public content remains visible without signing in.{" "}
          <Link href="/" style={{ color: colors.cinnabar, textDecoration: "none", fontWeight: 400 }}>
            Return home
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, type, value, onChange, autoComplete, autoFocus, disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <label
      style={{
        display: "block",
        position: "relative",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: colors.bronze,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          padding: "14px 16px",
          fontSize: 15,
          lineHeight: 1.2,
          borderRadius: 6,
          border: `1px solid ${focused ? colors.gold : colors.cline}`,
          background: disabled ? "#FAFAF7" : "#FFFCF7",
          color: colors.sky900,
          outline: "none",
          boxShadow: focused ? `0 0 0 3px ${colors.glineSoft}` : "none",
          transition: "border-color 0.3s, box-shadow 0.3s",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
