import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUserByUsername } from "@/lib/users";
import { verifyPassword } from "@/lib/passwords";

// Pre-computed bcryptjs hash of a value no real password will match. Used as a
// constant-time stand-in in authorize() so wrong-username and wrong-password
// requests take comparable time (prevents user enumeration via timing).
const DUMMY_HASH = "$2a$10$ItGWTLxsSWg5sRn4E3sK8elipiuGCQXTluiwE01FD7EZiHCaagVRu";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Infer the origin from the incoming request rather than requiring AUTH_URL.
  // Lets sign-in work under `next dev` on any port (and on the Workers domain),
  // not just the AUTH_URL configured for `npm run dev:cf`.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    // Use our custom sign-in page instead of the Auth.js default chrome.
    signIn: "/signin",
  },
  providers: [
    Credentials({
      name: "Archive Account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.toString().trim();
        const password = credentials?.password?.toString();
        if (!username || !password) return null;

        const { env } = getCloudflareContext();
        const row = await getUserByUsername(env.DB, username);
        // Always run verifyPassword to keep response time uniform regardless of whether
        // the username exists — prevents user enumeration via timing.
        const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
        if (!row || !ok) return null;

        return {
          id: row.id,
          name: row.name,
          username: row.username,
          accessLevel: row.access_level,
          role: row.role ?? "member",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessLevel = user.accessLevel;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.accessLevel = token.accessLevel ?? 0;
        session.user.username = token.username;
        session.user.role = token.role ?? "member";
      }
      return session;
    },
  },
});
