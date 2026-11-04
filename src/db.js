import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=filmsuki,public",
    max: 10,
    connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => console.error(error.message));
