import express from "express";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Student self-enroll
 * - Checks course exists
 * - Checks capacity
 * - Checks prerequisites (latest grade must exist and != 'F')
 * - Prevents duplicate enrollment (DB unique constraint)
 */
router.post("/", requireAuth, requireRole("STUDENT"), async (req, res) => {
    const studentId = req.user.id;
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: "courseId required" });

    try {
        // 1) Capacity + existence
        const capQ = `
        SELECT c.id, c.enrollment_limit,
                COALESCE(en.count,0) AS enrolled
        FROM courses c
        LEFT JOIN (
            SELECT course_id, COUNT(*)::int AS count
            FROM enrollments GROUP BY course_id
        ) en ON en.course_id = c.id
        WHERE c.id = $1
        `;
        const { rows: capRows } = await pool.query(capQ, [courseId]);
        if (!capRows[0]) return res.status(404).json({ error: "Course not found" });
        const { enrollment_limit, enrolled } = capRows[0];
        if (enrolled >= enrollment_limit) {
        return res.status(409).json({ error: "Course is at capacity" });
        }

        // 2) Prereqs (if any)
        const prereqQ = `SELECT prereq_id FROM course_prereqs WHERE course_id = $1`;
        const { rows: prereqs } = await pool.query(prereqQ, [courseId]);

        if (prereqs.length > 0) {
        // Get latest grade (as text) for each prereq; passing if exists and != 'F'
        const passQ = `
            SELECT cp.prereq_id,
                (
                    SELECT g.value::text
                    FROM grades g
                    WHERE g.student_id = $1
                        AND g.course_id = cp.prereq_id
                    ORDER BY g.assigned_at DESC
                    LIMIT 1
                ) AS latest_grade
            FROM course_prereqs cp
            WHERE cp.course_id = $2
        `;
        const { rows: gradeRows } = await pool.query(passQ, [studentId, courseId]);

        const unmet = gradeRows.filter(r => !r.latest_grade || r.latest_grade === "F");
        if (unmet.length > 0) {
            return res.status(409).json({ error: "Prerequisites not satisfied" });
        }
    }

    // 3) Enroll
    const insQ = `
        INSERT INTO enrollments (student_id, course_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *
        `;
        const { rows: ins } = await pool.query(insQ, [studentId, courseId]);
        if (!ins[0]) return res.status(409).json({ error: "Already enrolled" });
        return res.status(201).json(ins[0]);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Unenroll self 
router.delete("/:enrollmentId", requireAuth, requireRole("STUDENT"), async (req, res) => {
    const studentId = req.user.id;
    const enrollmentId = Number(req.params.enrollmentId);
    try {
        const { rows } = await pool.query(
        "SELECT student_id FROM enrollments WHERE id = $1",
        [enrollmentId]
        );
        if (!rows[0]) return res.status(404).json({ error: "Not found" });
        if (rows[0].student_id !== studentId) {
        return res.status(403).json({ error: "Not your enrollment" });
        }

        await pool.query("DELETE FROM enrollments WHERE id = $1", [enrollmentId]);
        return res.status(204).send();
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Allow students to unenroll by courseId (might be used instead)
router.delete("/by-course/:courseId", requireAuth, requireRole("STUDENT"), async (req, res) => {
    const studentId = req.user.id;
    const courseId = Number(req.params.courseId);
    try {
    const { rowCount } = await pool.query(
        "DELETE FROM enrollments WHERE student_id=$1 AND course_id=$2",
        [studentId, courseId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Enrollment not found" });
    res.status(204).send();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

// List my enrollments (student)
router.get("/me", requireAuth, requireRole("STUDENT"), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT e.id, e.course_id, c.code, c.name, e.created_at
            FROM enrollments e
            JOIN courses c ON c.id = e.course_id
            WHERE e.student_id = $1
            ORDER BY e.created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
        } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
        }
});

// Teachers: can list enrolled students for a course
router.get("/course/:courseId", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    const courseId = Number(req.params.courseId);
    try {
      // if TEACHER, enforce ownership
        if (req.user.role === "TEACHER") {
            const { rows: owner } = await pool.query("SELECT teacher_id FROM courses WHERE id=$1", [courseId]);
            if (!owner[0]) return res.status(404).json({ error: "Course not found" });
            if (owner[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
        }

        const sql = `
        SELECT 
            e.id,                     -- enrollment id
            e.student_id,             -- student user id
            u.name, u.email, 
            u.student_id AS student_code,
            (
                SELECT g.value::text
                FROM grades g
                WHERE g.student_id = e.student_id
                AND g.course_id  = e.course_id
                ORDER BY g.assigned_at DESC
                LIMIT 1
            ) AS latest_grade
        FROM enrollments e
        JOIN users u ON u.id = e.student_id
        WHERE e.course_id = $1
        ORDER BY u.name ASC
        `;
        const { rows } = await pool.query(sql, [courseId]);
        return res.json(rows);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});


export default router;
