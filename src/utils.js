import { pool } from "./db.js";

export async function createUser({ username, email, passwordHash }) {
    const { rows } = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, created_at`,
        [username.trim(), email.trim().toLowerCase(), passwordHash],
    );
    return rows[0];
}

// Get user for login.
export async function getUserByEmail(email) {
    const { rows } = await pool.query(
        "SELECT * FROM users WHERE lower(email) = lower($1)",
        [email.trim()],
    );
    return rows[0] ?? null;
}

export async function getMovies({ genre = null, search = null } = {}) {
    const { rows } = await pool.query(
        `SELECT *, cast_members AS cast FROM movies
         WHERE ($1::text IS NULL OR genres @> ARRAY[$1]::text[])
           AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%')
         ORDER BY id`,
        [genre, search],
    );
    return rows;
}

export async function getMovieById(movieId) {
    const { rows } = await pool.query(
        "SELECT *, cast_members AS cast FROM movies WHERE id = $1",
        [movieId],
    );
    return rows[0] ?? null;
}

export async function getWatchlist(userId) {
    const { rows } = await pool.query(
        `SELECT w.*, row_to_json(m) AS movie
         FROM watchlists w JOIN movies m ON m.id = w.movie_id
         WHERE w.user_id = $1
         ORDER BY w.created_at DESC, w.movie_id`,
        [userId],
    );
    return rows;
}

export async function addToWatchlist(userId, movieId) {
    const { rows } = await pool.query(
        `INSERT INTO watchlists (user_id, movie_id) VALUES ($1, $2)
         ON CONFLICT (user_id, movie_id) DO NOTHING
         RETURNING *`,
        [userId, movieId],
    );
    return rows[0] ?? null;
}

export async function removeFromWatchlist(userId, movieId) {
    const { rowCount } = await pool.query(
        "DELETE FROM watchlists WHERE user_id = $1 AND movie_id = $2",
        [userId, movieId],
    );
    return rowCount > 0;
}

export async function getWatched(userId) {
    const { rows } = await pool.query(
        `SELECT r.*, row_to_json(m) AS movie
         FROM reviews r JOIN movies m ON m.id = r.movie_id
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC, r.id DESC`,
        [userId],
    );
    return rows;
}

export async function addWatched(userId, { movieId, rating, review }) {
    const { rows } = await pool.query(
        `INSERT INTO reviews (user_id, movie_id, rating, review)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, movie_id) DO UPDATE
         SET rating = EXCLUDED.rating, review = EXCLUDED.review
         RETURNING *`,
        [userId, movieId, rating, review],
    );
    return rows[0];
}
