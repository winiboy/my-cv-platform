import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
  ],
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
console.log("GITHUB_ID =", process.env.GITHUB_ID);
console.log("GITHUB_SECRET exists =", !!process.env.GITHUB_SECRET);
