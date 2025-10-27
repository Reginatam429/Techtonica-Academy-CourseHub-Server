/**
 * @openapi
 * /users:
 *   get:
 *     summary: Search users (?query=)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */


import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Allowed roles 
const ROLES = ["STUDENT", "TEACHER", "ADMIN"];

// Validate payload for create/update
function validateUserPayload(body, { isCreate = false } = {}) {
    const errors = [];

    // role
    if (!body.role || !ROLES.includes(body.role)) {
        errors.push("Invalid or missing role (STUDENT, TEACHER, ADMIN).");
    }

    // name + email
    if (isCreate) {
        if (!body.name) errors.push("name is required.");
        if (!body.email) errors.push("email is required.");
        if (!body.password) errors.push("password is required.");
    }

    // Student-only field: student_id (duplicate prevention requirement)
    if (body.role === "STUDENT") {
        if (isCreate && !body.studentId) {
        errors.push("studentId is required for STUDENT.");
        }
    }

    return errors;
}

// CREATE Admin
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
    try {
        const { role, name, email, password, studentId, major } = req.body;

        const errors = validateUserPayload(req.body, { isCreate: true });
        if (errors.length) return res.status(400).json({ errors });

        const hash = await bcrypt.hash(password, 10);

        const q = `
        INSERT INTO users (role, name, email, password, student_id, major)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, role, name, email, student_id AS "studentId", major, created_at, updated_at
        `;
        const values = [role, name, email, hash, studentId || null, major || null];

        const { rows } = await pool.query(q, values);
        return res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code === "23505") {
        // unique error on email or student_id
        return res.status(409).json({ error: "Email or studentId already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// LIST + SEARCH (role-aware)
// GET /users?query=foo
// ADMIN: all users
// TEACHER: only STUDENT users
// STUDENT: 403
router.get("/", requireAuth, async (req, res) => {
        try {
        const q = (req.query.query || "").trim();
        const like = `%${q}%`;
    
        let sql, params;
    
        if (req.user.role === "ADMIN") {
            sql = `
            SELECT u.id, u.role, u.name, u.email,
                    u.student_id AS "studentId", u.major,
                    u.created_at, u.updated_at
            FROM users u
            WHERE ($1 = '' OR
                    u.name ILIKE $2 OR
                    u.email ILIKE $2 OR
                    COALESCE(u.student_id,'') ILIKE $2 OR
                    COALESCE(u.major,'') ILIKE $2)
            ORDER BY u.id ASC
            LIMIT 200
            `;
            params = [q, like];
    
        } else if (req.user.role === "TEACHER") {
            sql = `
            SELECT u.id, u.role, u.name, u.email,
                    u.student_id AS "studentId", u.major,
                    u.created_at, u.updated_at
            FROM users u
            WHERE u.role = 'STUDENT'
                AND ($1 = '' OR
                    u.name ILIKE $2 OR
                    u.email ILIKE $2 OR
                    COALESCE(u.student_id,'') ILIKE $2 OR
                    COALESCE(u.major,'') ILIKE $2)
            ORDER BY u.id ASC
            LIMIT 200
            `;
            params = [q, like];
    
        } else {
            return res.status(403).json({ error: "Forbidden" });
        }
    
        const { rows } = await pool.query(sql, params);
        return res.json(rows);
    
        } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
        }
});

// READ Admin
router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { rows: userRows } = await pool.query(
            `SELECT id, role, name, email, student_id AS "studentId", major, created_at, updated_at
            FROM users WHERE id=$1`,
            [id]
        );
        const user = userRows[0];
        if (!user) return res.status(404).json({ error: "Not found" });

        // Teachers can only view students they teach
        if (req.user.role === "TEACHER" && user.role === "STUDENT") {
            const { rows: teaching } = await pool.query(
                `SELECT 1
                FROM enrollments e
                JOIN courses c ON c.id = e.course_id
                WHERE e.student_id = $1 AND c.teacher_id = $2
                LIMIT 1`,
                [id, req.user.id]
            );
            if (teaching.length === 0) {
                return res.status(403).json({ error: "Not authorized to view this student" });
            }
        }

        // GPA calculation (only for student users)
        let gpa = null;
        let totalCredits = 0;

        if (user.role === "STUDENT") {
            const { rows: gradeRows } = await pool.query(`
                WITH latest AS (
                    SELECT DISTINCT ON (g.course_id)
                        g.course_id, g.value
                    FROM grades g
                    WHERE g.student_id = $1
                    ORDER BY g.course_id, g.assigned_at DESC
                )
                SELECT c.credits,
                    CASE latest.value
                        WHEN 'A_PLUS'  THEN 4.0
                        WHEN 'A'       THEN 4.0
                        WHEN 'A_MINUS' THEN 3.7
                        WHEN 'B_PLUS'  THEN 3.3
                        WHEN 'B'       THEN 3.0
                        WHEN 'B_MINUS' THEN 2.7
                        WHEN 'C_PLUS'  THEN 2.3
                        WHEN 'C'       THEN 2.0
                        WHEN 'C_MINUS' THEN 1.7
                        WHEN 'D'       THEN 1.0
                        WHEN 'F'       THEN 0.0
                    END AS points
                FROM latest
                JOIN courses c ON c.id = latest.course_id
            `, [id]);

            let totalPoints = 0;
            for (const r of gradeRows) {
                if (r.points != null) {
                    totalPoints += r.points * r.credits;
                    totalCredits += r.credits;
                }
            }
            if (totalCredits > 0) {
                gpa = Number((totalPoints / totalCredits).toFixed(2));
            }
        }

        return res.json({
            ...user,
            gpa
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// UPDATE Admin
router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { role, name, email, password, studentId, major } = req.body;

        if (role && !ROLES.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
        }

        // Build dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        const add = (col, v) => {
        fields.push(`${col} = $${idx++}`);
        values.push(v);
        };

        if (role) add("role", role);
        if (name) add("name", name);
        if (email) add("email", email);
        if (typeof major !== "undefined") add("major", major);
        if (typeof studentId !== "undefined") add("student_id", studentId || null);
        if (password) {
        const hash = await bcrypt.hash(password, 10);
        add("password", hash);
        }

        if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
        }

        // Always update timestamp
        fields.push(`updated_at = NOW()`);

        const sql = `
        UPDATE users
            SET ${fields.join(", ")}
        WHERE id = $${idx}
        RETURNING id, role, name, email, student_id AS "studentId", major, created_at, updated_at
        `;
        values.push(id);

        const { rows } = await pool.query(sql, values);
        if (!rows[0]) return res.status(404).json({ error: "Not found" });
        return res.json(rows[0]);
    } catch (e) {
        if (e.code === "23505") {
        return res.status(409).json({ error: "Email or studentId already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// DELETE Admin
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        // Deleting a TEACHER with courses will fail 
        const { rowCount } = await pool.query(`DELETE FROM users WHERE id=$1`, [id]);
        if (rowCount === 0) return res.status(404).json({ error: "Not found" });
        return res.status(204).send();
    } catch (e) {
        if (e.code === "23503") {
        // foreign key violation 
        return res.status(409).json({ error: "User has related records; reassign or delete dependents first" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;
