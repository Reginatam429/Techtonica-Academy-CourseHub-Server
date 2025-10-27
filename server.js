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
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

dotenv.config();
const { Pool } = pkg;

const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: "3.0.0",
        info: { title: "CourseHub API", version: "1.0.0" },
        servers: [{ url: process.env.SERVER_URL || "http://localhost:3000" }],
        components: {
            securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }
        },
        security: [{ bearerAuth: [] }],
        paths: {
            "/health": {
                get: {
                    summary: "Health check",
                    responses: { 200: { description: "OK" } }
                }
            }
        }
    },
    apis: ["./src/routes/*.js"],
});

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
app.get("/", (req, res) => {
    res.redirect(302, "/docs");
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
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
}

export default app;