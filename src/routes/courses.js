import express from "express";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Helper validation for course payload
function validateCoursePayload({ code, name, credits, enrollment_limit }) {
    const errors = [];
    if (!code || !code.trim()) errors.push("code is required.");
    if (!name || !name.trim()) errors.push("name is required.");
    if (credits == null || Number.isNaN(Number(credits)) || Number(credits) < 0) {
        errors.push("credits must be a number >= 0.");
    }
    if (enrollment_limit == null || Number.isNaN(Number(enrollment_limit)) || Number(enrollment_limit) < 0) {
        errors.push("enrollment_limit must be a number >= 0.");
    }
    return errors;
}

// Public list
router.get("/", async (req, res) => {
    try {
        const q = (req.query.query || "").trim();
        const params = [];
        let where = "";

        if (q) {
        params.push(`%${q}%`, `%${q}%`);
        where = "WHERE c.code ILIKE $1 OR c.name ILIKE $2";
        }

        const sql = `
        SELECT c.*,
                GREATEST(c.enrollment_limit - COALESCE(en.count,0), 0) AS available_seats
            FROM courses c
            LEFT JOIN (
            SELECT course_id, COUNT(*)::int AS count
            FROM enrollments GROUP BY course_id
            ) en ON en.course_id = c.id
        ${where}
        ORDER BY c.code;
        `;
        const { rows } = await pool.query(sql, params);
        return res.json(rows);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Create course - Teacher/Admin only
router.post("/", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const { code, name, credits, enrollment_limit } = req.body;
    const teacherId = req.user.role === "TEACHER" ? req.user.id : (req.body.teacherId || req.user.id);

    const errors = validateCoursePayload({ code, name, credits, enrollment_limit });
    if (errors.length) return res.status(400).json({ errors });

    try {
        const { rows } = await pool.query(
        `INSERT INTO courses (code, name, credits, enrollment_limit, teacher_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *`,
        [code.trim(), name.trim(), Number(credits), Number(enrollment_limit), teacherId]
        );
        return res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "Course code already exists" });
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Update - owner teacher or admin only
router.put("/:id", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    const { code, name, credits, enrollment_limit } = req.body;

    const errors = validateCoursePayload({ code, name, credits, enrollment_limit });
    if (errors.length) return res.status(400).json({ errors });

    try {
        // Ownership enforcement for teacher
        if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(`SELECT teacher_id FROM courses WHERE id=$1`, [id]);
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
        }

        const { rows } = await pool.query(
        `UPDATE courses
            SET code=$1, name=$2, credits=$3, enrollment_limit=$4, updated_at=NOW()
            WHERE id=$5
            RETURNING *`,
        [code.trim(), name.trim(), Number(credits), Number(enrollment_limit), id]
        );
        return res.json(rows[0]);
    } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "Course code already exists" });
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Delete owner teacher or admin
router.delete("/:id", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    try {
        if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(`SELECT teacher_id FROM courses WHERE id=$1`, [id]);
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
        }

        await pool.query(`DELETE FROM courses WHERE id=$1`, [id]);
        return res.status(204).send();
    } catch (e) {
        if (e.code === "23503") {
        // FK: enrollments or prereqs referencing this course
        return res.status(409).json({ error: "Course has related records; remove dependencies first" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;
