import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../server.js";

const router = express.Router();

// helper: escape string for use inside a RegExp
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unique emails
async function generateUniqueEmail(firstName, lastName) {
    const left = String(firstName).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const right = String(lastName).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const base = `${left}.${right}`.replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "");
    const domain = "@coursehub.io";

    // Find any existing emails that match base, base2, base3, ... at our domain
    const like = `${base}%@coursehub.io`;
    const { rows } = await pool.query(
        `SELECT email FROM users WHERE email ILIKE $1 ORDER BY email ASC`,
        [like]
    );

    if (rows.length === 0) return `${base}${domain}`;

    // Build a safe regex: ^base(\d+)?@coursehub\.io$
    const safeBase = escapeRegExp(base);
    const safeDomain = escapeRegExp(domain);
    const re = new RegExp(`^${safeBase}(\\d+)?${safeDomain}$`, "i");

    let next = 2; // if base is taken, start from 2
    for (const r of rows) {
        const m = r.email.match(re);
        if (!m) continue;
        if (m[1]) {
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n) && n >= next) next = n + 1;
        } else {
            // exact base@domain exists
            next = Math.max(next, 2);
        }
    }
    return `${base}${next}${domain}`;
}

/** Auto-generate a studentId */
async function ensureStudentId(studentId) {
    if (studentId) return studentId;

    // find max numeric from IDs that look like S\d+
    const { rows } = await pool.query(
        `SELECT COALESCE(MAX((regexp_matches(student_id, '^S(\\d+)$'))[1]::int), 1000) AS max_num
        FROM users
        WHERE student_id ~ '^S\\d+$'`
    );
    const next = (rows[0]?.max_num || 1000) + 1;
    return `S${next}`;
}

/** POST /auth/register
 * Body: { firstName, lastName, password, major?, studentId? }
 * Creates a STUDENT with unique academy email and returns token + user.
 */
router.post("/register", async (req, res) => {
    try {
        const { firstName, lastName, password, major, studentId } = req.body || {};
        if (!firstName || !lastName || !password) {
        return res.status(400).json({ error: "firstName, lastName, and password are required" });
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
        const { rows } = await pool.query(insertQ, [name, email, hash, finalStudentId, major || null]);
        const user = rows[0];

        const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email, name: user.name },
        process.env.JWT_SECRET
        );

        return res.status(201).json({
        message: "Registration successful",
        email: user.email,
        token,
        user
        });
    } catch (e) {
        if (e.code === "23505") {
        // Unique violation on email or student_id
        return res.status(409).json({ error: "Email or studentId already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

/** POST /auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};
    const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
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
        major: user.major
        }
    });
});

export default router;
