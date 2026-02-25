import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Archive Account',
      credentials: {
        username: { label: "Username (public, ngondro, or dzogrim)", type: "text" },
        password: { label: "Password (use: demo)", type: "password" }
      },
      async authorize(credentials) {
        // Our Mock "Archive Manifest"
        const users = [
          { id: "1", name: "Public Visitor", username: "public", password: "demo", accessLevel: 0 },
          { id: "2", name: "Ngondro Student", username: "ngondro", password: "demo", accessLevel: 1 },
          { id: "3", name: "Dzogrim Student", username: "dzogrim", password: "demo", accessLevel: 4 }
        ]

        const user = users.find(u => u.username === credentials?.username && u.password === credentials?.password)

        if (user) {
          return { id: user.id, name: user.name, accessLevel: user.accessLevel }
        } else {
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessLevel = user.accessLevel;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.accessLevel = token.accessLevel;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "development-secret-key-123",
}

const handler = NextAuth(authOptions)

// THIS LINE IS CRITICAL FOR NEXT.JS APP ROUTER!
export { handler as GET, handler as POST }