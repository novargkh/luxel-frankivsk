import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { findUserByLogin } from "@/lib/clientAccount";
import { captchaOk, clearFailures, clientIp, isBlocked, recordFailure } from "@/lib/loginGuard";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many";
}
class CaptchaFailed extends CredentialsSignin {
  code = "captcha";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email або телефон", type: "text" },
        password: { label: "Password", type: "password" },
        captcha: { type: "text" },
      },
      authorize: async (credentials, request) => {
        // The "email" field takes an email or a phone number.
        const login = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!login || !password) return null;

        const ip = clientIp(request);
        if (await isBlocked(login, ip)) throw new TooManyAttempts();
        if (!(await captchaOk(credentials?.captcha as string | undefined, ip))) throw new CaptchaFailed();

        const user = await findUserByLogin(login);
        // No password issued yet, or blocked by an admin: no entry.
        const valid = !!user && !!user.passwordHash && user.isActive && (await bcrypt.compare(password, user.passwordHash));
        if (!user || !valid) {
          await recordFailure(login, ip);
          return null;
        }
        await clearFailures(login);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { role?: string; id?: string }).role =
          token.role as string;
        (session.user as typeof session.user & { role?: string; id?: string }).id =
          token.id as string;
      }
      return session;
    },
  },
});
