import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("../frontend"));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

import {
    getMovies,
    getMovieById,
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    getWatched,
    addWatched,
    getUserByEmail,
    createUser,
} from "./utils.js";

const JWT_SECRET = process.env.JWT_SECRET || "sigmaboi";
const EXP_TIME = process.env.EXP_TIME || "1h";

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.use(
    ["/api/watchlist", "/api/watched", "/api/movies/recommend"],
    authenticateToken,
);

app.use(
    "/api/movies/recommend",
    rateLimit({
        windowMs: 60 * 1000,
        limit: 5,
        keyGenerator: (req) => String(req.user.id),
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            error: "Rate limit exceeded.",
        },
    }),
);

app.post("/api/movies/recommend", async (req, res) => {
    const { prompt } = req.body ?? {};
    if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        const movies = await getMovies();
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
            contents: JSON.stringify({
                preferences: prompt,
                movies: movies.map(({ title, id, genres, synopsis }) => ({
                    id: id,
                    title: title,
                    genres: genres,
                    synopsis: synopsis,
                })),
            }),
            config: {
                systemInstruction:
                    "Pilih satu film hanya dari daftar yang diberikan. " +
                    "Berikan alasan dalam bahasa Indonesia.",
                responseMimeType: "application/json",
                responseJsonSchema: {
                    type: "object",
                    properties: {
                        movie_id: { type: "integer" },
                        reasoning: { type: "string" },
                    },
                    required: ["movie_id", "reasoning"],
                    additionalProperties: false,
                },
            },
        });
        const result = JSON.parse(response.text);
        if (!movies.some((movie) => movie.id === result.movie_id)) {
            return res.status(502).json({
                error: "AI returned an unknown movie",
            });
        }

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (
        typeof email !== "string" ||
        !email.trim() ||
        typeof password !== "string" ||
        !password
    ) {
        return res
            .status(400)
            .json({ error: "Email and password are required" });
    }

    try {
        const user = await getUserByEmail(email);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
            expiresIn: EXP_TIME,
        });

        res.json({
            token,
            user: { id: user.id, username: user.username, email: user.email },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/auth/register", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (
        typeof email !== "string" ||
        !email.trim() ||
        typeof password !== "string" ||
        !password
    ) {
        return res
            .status(400)
            .json({ error: "Email and password are required" });
    }

    try {
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: "Email already in use" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await createUser({
            username: email.split("@")[0],
            email,
            passwordHash,
        });

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: EXP_TIME },
        );

        res.status(201).json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/movies", async (req, res) => {
    const { genre, search } = req.query;
    try {
        const movies = await getMovies({ genre, search });
        res.json(movies);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/movies/:id", async (req, res) => {
    const movieId = parseInt(req.params.id, 10);
    try {
        const movie = await getMovieById(movieId);
        if (!movie) {
            return res.status(404).json({ error: "Movie not found" });
        }
        res.json(movie);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/watchlist", async (req, res) => {
    const userId = req.user.id;
    try {
        const watchlist = await getWatchlist(userId);
        res.json(watchlist);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/watchlist", async (req, res) => {
    const userId = req.user.id;
    const { movieId } = req.body;
    try {
        const added = await addToWatchlist(userId, movieId);
        if (!added) {
            return res
                .status(400)
                .json({ error: "Movie already in watchlist" });
        }
        res.status(201).json(added);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete("/api/watchlist/:movieId", async (req, res) => {
    const userId = req.user.id;
    const movieId = parseInt(req.params.movieId, 10);
    try {
        const removed = await removeFromWatchlist(userId, movieId);
        if (!removed) {
            return res
                .status(404)
                .json({ error: "Movie not found in watchlist" });
        }
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/watched", async (req, res) => {
    const userId = req.user.id;
    try {
        const watched = await getWatched(userId);
        res.json(watched);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/watched", async (req, res) => {
    const userId = req.user.id;
    const { movieId, rating, review } = req.body ?? {};
    if (
        !Number.isInteger(movieId) ||
        movieId < 1 ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        typeof review !== "string" ||
        !review.trim()
    ) {
        return res.status(400).json({
            error: "A valid movieId, rating (1-5), and review are required",
        });
    }

    try {
        const added = await addWatched(userId, {
            movieId,
            rating,
            review: review.trim(),
        });
        res.status(201).json(added);
    } catch (error) {
        if (error.code === "23503") {
            return res.status(404).json({ error: "Movie not found" });
        }
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${server.address().port}`);
});
