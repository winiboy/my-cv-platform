import { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub || "";
      }
      return session;
    },
  },
};
