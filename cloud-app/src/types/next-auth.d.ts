import "next-auth";
import "next-auth/jwt";

export type AppRole = "ADMIN" | "OPERATOR" | "USER";

declare module "next-auth" {
  interface User {
    role?: AppRole;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: AppRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: AppRole;
  }
}
