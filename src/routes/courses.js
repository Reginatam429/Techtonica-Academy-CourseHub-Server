import express from "express";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// List courses (+ available seats)
router.get("/", async (_req, res) => {
    const q = `
        SELECT c.*,
            GREATEST(c.enrollment_limit - COALESCE(en.count,0), 0) AS available_seats
        FROM courses c
        LEFT JOIN (
        SELECT course_id, COUNT(*)::int AS count FROM enrollments GROUP BY course_id
        ) en ON en.course_id = c.id
        ORDER BY c.code;
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
});

// Create course (Teacher/Admin)
router.post("/", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const { code, name, credits, enrollment_limit } = req.body;
    const teacherId = req.user.role === "TEACHER" ? req.user.id : req.body.teacherId || req.user.id;
    try {
    const { rows } = await pool.query(
        `INSERT INTO courses (code,name,credits,enrollment_limit,teacher_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *`,
        [code, name, credits, enrollment_limit, teacherId]
        );
        res.status(201).json(rows[0]);
    } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "Course code already exists" });
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

// Update (only owner teacher or admin)
router.put("/:id", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(`SELECT teacher_id FROM courses WHERE id=$1`, [id]);
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
    }
    const { code, name, credits, enrollment_limit } = req.body;
    const { rows } = await pool.query(
        `UPDATE courses SET code=$1, name=$2, credits=$3, enrollment_limit=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
        [code, name, credits, enrollment_limit, id]
    );
    res.json(rows[0]);
});

// Delete (only owner teacher or admin)
router.delete("/:id", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(`SELECT teacher_id FROM courses WHERE id=$1`, [id]);
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
    }
    await pool.query(`DELETE FROM courses WHERE id=$1`, [id]);
    res.status(204).send();
});

export default router;
