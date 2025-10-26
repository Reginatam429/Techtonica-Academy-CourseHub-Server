import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import authRoutes from "./src/routes/auth.js";
import courseRoutes from "./src/routes/courses.js";
import enrollmentRoutes from "./src/routes/enrollments.js";
import gradeRoutes from "./src/routes/grades.js";
import userRoutes from "./src/routes/users.js";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();
const { Pool } = pkg;

// Pool config
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // local: no SSL; Heroku: SSL required
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Root
app.get("/", (_req, res) => {
    res.send("Techtonica Academy CourseHub backend is running");
});

// DB test
app.get("/db-test", async (_req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ serverTime: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database connection failed" });
    }
});

// Middleware
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Mount routes
app.use("/auth", authRoutes);
app.use("/courses", courseRoutes);
app.use("/enrollments", enrollmentRoutes);
app.use("/grades", gradeRoutes);
app.use("/users", userRoutes);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
}

export default app;