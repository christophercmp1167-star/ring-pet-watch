import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const ALLOWED_GITHUB_USERNAME = "christophercmp1167-star";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      issuer: "https://github.com/login/oauth",
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "github") {
        return false;
      }

      return (
        typeof profile?.login === "string" &&
        profile.login.toLowerCase() ===
          ALLOWED_GITHUB_USERNAME.toLowerCase()
      );
    },
  },
});
