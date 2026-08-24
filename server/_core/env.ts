export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? process.env.AUTH_BASE_URL ?? "",
};
