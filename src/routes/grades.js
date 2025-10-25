import express from "express";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const ALLOWED_GRADES = [
    "A_PLUS","A","A_MINUS",
    "B_PLUS","B","B_MINUS",
    "C_PLUS","C","C_MINUS",
    "D","F"
];

const GRADE_POINTS = {
    A_PLUS: 4.3, A: 4.0, A_MINUS: 3.7,
    B_PLUS: 3.3, B: 3.0, B_MINUS: 2.7,
    C_PLUS: 2.3, C: 2.0, C_MINUS: 1.7,
    D: 1.0, F: 0.0
};

// Points mapping for grade_letter enum

const GRADE_POINTS_SQL = `
    CASE g.value
        WHEN 'A_PLUS'  THEN 4.3
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
    END
`;

router.post(
    "/",
    requireAuth,
    requireRole("TEACHER", "ADMIN"),
    async (req, res) => {
        const { studentId, courseId, value } = req.body;
        if (!studentId || !courseId || !value) {
        return res.status(400).json({ error: "studentId, courseId, value required" });
        }
        if (!ALLOWED_GRADES.includes(value)) {
        return res.status(400).json({ error: "Invalid grade value" });
        }

    try {
        if (req.user.role === "TEACHER") {
            const { rows: owner } = await pool.query(
            "SELECT teacher_id FROM courses WHERE id=$1",
            [courseId]
            );
            if (!owner[0]) return res.status(404).json({ error: "Course not found" });
            if (owner[0].teacher_id !== req.user.id) {
            return res.status(403).json({ error: "Not your course" });
            }
        }

        const { rows } = await pool.query(
            `INSERT INTO grades (student_id, course_id, value)
            VALUES ($1,$2,$3::grade_letter)
            RETURNING *`,
            [studentId, courseId, value]
        );
        return res.status(201).json(rows[0]);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
    }
);

// GET /grades/me Student: full grade history (all courses, newest first)

router.get(
    "/me",
    requireAuth,
    requireRole("STUDENT"),
    async (req, res) => {
        try {
        const { rows } = await pool.query(
            `SELECT g.id, g.course_id, c.code, c.name, g.value::text AS grade, g.assigned_at
            FROM grades g
            JOIN courses c ON c.id = g.course_id
            WHERE g.student_id = $1
            ORDER BY g.assigned_at DESC`,
            [req.user.id]
        );
        return res.json(rows);
        } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
        }
    }
);

// GET /grades/me/current Student: latest (current) grade per course

router.get(
    "/me/current",
    requireAuth,
    requireRole("STUDENT"),
    async (req, res) => {
        try {
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (g.course_id)
                    g.course_id, c.code, c.name, g.value::text AS grade, g.assigned_at
            FROM grades g
            JOIN courses c ON c.id = g.course_id
            WHERE g.student_id = $1
            ORDER BY g.course_id, g.assigned_at DESC`,
            [req.user.id]
        );
        return res.json(rows);
        } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
        }
    }
);

// GET /grades/me/gpa Student: GPA computed from latest grade per course

router.get(
    "/me/gpa",
    requireAuth,
    requireRole("STUDENT"),
    async (req, res) => {
        try {
        const { rows } = await pool.query(
            `WITH latest AS (
            SELECT DISTINCT ON (g.course_id)
                    g.course_id, g.value::text AS grade
                FROM grades g
                WHERE g.student_id = $1
                ORDER BY g.course_id, g.assigned_at DESC
            )
            SELECT grade FROM latest`,
            [req.user.id]
        );

        if (rows.length === 0) return res.json({ gpa: null, courses: 0 });

        const vals = rows.map(r => GRADE_POINTS[r.grade] ?? 0);
        const gpa = vals.reduce((a, b) => a + b, 0) / vals.length;
        return res.json({ gpa: Number(gpa.toFixed(2)), courses: rows.length });
        } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
        }
    }
);

// GET /grades/course/:courseId Teacher/Admin: view grade history for a course - Teachers restricted to their own course

router.get(
    "/course/:courseId",
    requireAuth,
    requireRole("TEACHER", "ADMIN"),
    async (req, res) => {
        const courseId = Number(req.params.courseId);
        try {
        if (req.user.role === "TEACHER") {
            const { rows: owner } = await pool.query(
            "SELECT teacher_id FROM courses WHERE id=$1",
            [courseId]
            );
            if (!owner[0]) return res.status(404).json({ error: "Course not found" });
            if (owner[0].teacher_id !== req.user.id) {
            return res.status(403).json({ error: "Not your course" });
            }
        }

        const { rows } = await pool.query(
            `SELECT g.id, g.student_id, u.name AS student_name, u.email,
                    g.value::text AS grade, g.assigned_at
            FROM grades g
            JOIN users u ON u.id = g.student_id
            WHERE g.course_id = $1
            ORDER BY g.assigned_at DESC`,
            [courseId]
        );
        return res.json(rows);
        } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
        }
    }
);

export default router;
