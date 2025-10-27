/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password]
 *             properties:
 *               firstName: { type: string, example: Ada }
 *               lastName:  { type: string, example: Lovelace }
 *               email:     { type: string, example: ada@coursehub.io }
 *               password:  { type: string, example: secret }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad request }
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: ada@coursehub.io }
 *               password: { type: string, example: secret }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Invalid credentials }
 */


import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../server.js";

const router = express.Router();

// Helper: escape string for RegExp
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generate unique academy email:
async function generateUniqueEmail(firstName, lastName) {
    const left = String(firstName).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const right = String(lastName).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const base = `${left}.${right}`.replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "");
    const domain = "@coursehub.io";

    const like = `${base}%@coursehub.io`;
    const { rows } = await pool.query(
        `SELECT email FROM users WHERE email ILIKE $1 ORDER BY email ASC`,
        [like]
    );

    if (rows.length === 0) return `${base}${domain}`;

    const safeBase = escapeRegExp(base);
    const safeDomain = escapeRegExp(domain);
    const re = new RegExp(`^${safeBase}(\\d+)?${safeDomain}$`, "i");

    let next = 2; // if base is taken, start with 2
    for (const r of rows) {
        const m = r.email.match(re);
        if (!m) continue;
        if (m[1]) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n >= next) next = n + 1;
        } else {
        next = Math.max(next, 2);
        }
    }
    return `${base}${next}${domain}`;
}

// Auto-generate Student ID like S1001, S1002, ...
async function ensureStudentId(studentId) {
    if (studentId) return studentId;

    // Works on Postgres 16: use scalar regex substring
    const { rows } = await pool.query(
        `
        SELECT COALESCE(
                MAX( (substring(student_id from '^S(\\d+)$'))::int ),
                1000
            ) AS max_num
        FROM users
        WHERE student_id ~ '^S\\d+$'
        `
    );
    const next = (rows[0]?.max_num || 1000) + 1;
    return `S${next}`;
}

/**
 * POST /auth/register
 * Body: { firstName, lastName, password, major?, studentId? }
 * Creates a STUDENT with unique academy email and returns token + user.
 */
router.post("/register", async (req, res) => {
    try {
        const { firstName, lastName, password, major, studentId } = req.body || {};
        if (!firstName || !lastName || !password) {
        return res
            .status(400)
            .json({ error: "firstName, lastName, and password are required" });
        }

        const email = await generateUniqueEmail(firstName, lastName);
        const finalStudentId = await ensureStudentId(studentId);
        const name = `${firstName.trim()} ${lastName.trim()}`;
        const hash = await bcrypt.hash(password, 10);

        const insertQ = `
        INSERT INTO users (role, name, email, password, student_id, major)
        VALUES ('STUDENT', $1, $2, $3, $4, $5)
        RETURNING id, role, name, email, student_id AS "studentId", major
        `;
        const { rows } = await pool.query(insertQ, [
        name,
        email,
        hash,
        finalStudentId,
        major || null,
        ]);
        const user = rows[0];

        const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email, name: user.name },
        process.env.JWT_SECRET
        );

        return res.status(201).json({
        message: "Registration successful",
        email: user.email,
        token,
        user,
        });
    } catch (e) {
        if (e.code === "23505") {
        return res.status(409).json({ error: "Email or studentId already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
        }

        const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [
        email,
        ]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email, name: user.name },
        process.env.JWT_SECRET
        );
        return res.json({
        token,
        user: {
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email,
            studentId: user.student_id,
            major: user.major,
        },
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;
