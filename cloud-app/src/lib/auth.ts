import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { connectDb } from "./db";
import { User } from "@/models/User";
import { verifyPassword } from "./password";
import type { AppRole } from "@/types/next-auth";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        await connectDb();
        const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).lean();
        if (!user) return null;

        const ok = await verifyPassword(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        return {
          id: String(user._id),
          email: user.email,
          name: user.name,
          role: user.role as AppRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "USER";
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid ?? session.user.id;
        session.user.role = token.role ?? "USER";
      }
      return session;
    },
  },
});
