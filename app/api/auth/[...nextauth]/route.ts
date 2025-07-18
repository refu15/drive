
import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { SupabaseAdapter } from "@next-auth/supabase-adapter"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !NEXTAUTH_SECRET) {
  throw new Error("Missing NextAuth or Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXTAUTH_SECRET).")
}

export const authOptions: NextAuthOptions = {
  // Supabaseアダプターを使用して、ユーザー、アカウント、セッションを同期
  adapter: SupabaseAdapter({
    url: SUPABASE_URL,
    secret: SUPABASE_SERVICE_ROLE_KEY,
  }),

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        // Supabaseクライアントを作成してユーザーをサインイン
        const supabaseAdmin = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );

        // Supabase Authでユーザーをサインイン
        const { data: userData, error } = await supabaseAdmin.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error) {
          console.error("Supabase sign-in error:", error.message);
          return null; // 認証失敗
        }

        if (!userData.user) {
          return null;
        }

        // Supabaseでの認証成功後、publicの`users`テーブルからユーザープロファイルを取得
        // ここで役割(role)を取得します
        const { data: user, error: userError } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("id", userData.user.id)
          .single();

        if (userError) {
          console.error("Error fetching user profile:", userError.message);
          return null;
        }

        // NextAuthのためにユーザーオブジェクトを返す
        return user;
      },
    }),
  ],

  // セッションに役割(role)を永続化するためのコールバック
  callbacks: {
    async session({ session, user }) {
      // `user`オブジェクトは`authorize`コールバックまたはアダプターから返されたもの
      if (session.user) {
        // @ts-ignore
        session.user.id = user.id;
        // @ts-ignore
        session.user.role = user.role;
      }
      return session;
    },
  },

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  secret: NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
