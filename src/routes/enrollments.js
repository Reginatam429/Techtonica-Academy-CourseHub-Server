/**
 * @openapi
 * /enrollments:
 *   post:
 *     summary: Enroll current user in a course
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId]
 *             properties:
 *               courseId: { type: integer, example: 1 }
 *     responses:
 *       201: { description: Enrolled }
 *       401: { description: Unauthorized }
 */

/**
 * @openapi
 * /enrollments/me:
 *   get:
 *     summary: List my enrollments
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */


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

// BULK ENROLL (Teacher owns course or Admin)
router.post("/bulk", requireAuth, requireRole("TEACHER","ADMIN"), async (req, res) => {
    try {
        const { courseId, studentIds } = req.body || {};
        if (!courseId || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: "courseId and studentIds[] are required" });
        }
    
        // Ownership check for teachers
        if (req.user.role === "TEACHER") {
            const { rows: owner } = await pool.query(
            `SELECT teacher_id FROM courses WHERE id=$1`, [courseId]
            );
            if (!owner[0]) return res.status(404).json({ error: "Course not found" });
            if (owner[0].teacher_id !== req.user.id) return res.status(403).json({ error: "Not your course" });
        }
    
        // Capacity left
        const { rows: cap } = await pool.query(`
            SELECT c.enrollment_limit::int - COALESCE(e.count,0)::int AS seats_left
            FROM courses c
            LEFT JOIN (SELECT course_id, COUNT(*)::int AS count FROM enrollments WHERE course_id=$1 GROUP BY 1) e
            ON e.course_id=c.id
            WHERE c.id=$1
        `, [courseId]);
        if (!cap[0]) return res.status(404).json({ error: "Course not found" });
    
        let seatsLeft = Math.max(0, cap[0].seats_left);
    
        // Get prereqs for the course
        const { rows: prereqs } = await pool.query(
            `SELECT prereq_id FROM course_prereqs WHERE course_id=$1`, [courseId]
        );
        const prereqIds = prereqs.map(r => r.prereq_id);
    
        // For each student, check duplicate, prereqs, capacity, then enroll
        const results = [];
        for (const sid of studentIds) {
            if (seatsLeft <= 0) { results.push({ studentId: sid, ok:false, reason:"capacity" }); continue; }
    
            // already enrolled?
            const { rows: exists } = await pool.query(
            `SELECT 1 FROM enrollments WHERE student_id=$1 AND course_id=$2 LIMIT 1`, [sid, courseId]
            );
            if (exists[0]) { results.push({ studentId: sid, ok:false, reason:"already_enrolled" }); continue; }
    
            // prereq check: for each prereq course, latest grade must not be 'F'
            if (prereqIds.length > 0) {
            const { rows: g } = await pool.query(`
                WITH latest AS (
                SELECT DISTINCT ON (course_id) course_id, value
                FROM grades
                WHERE student_id=$1 AND course_id = ANY($2::int[])
                ORDER BY course_id, assigned_at DESC
                )
                SELECT course_id, value FROM latest
            `, [sid, prereqIds]);
            const passedAll = prereqIds.every(pid => {
                const lg = g.find(x => x.course_id === pid)?.value || null;
                return lg && lg !== "F"; // treat anything except F as pass
            });
            if (!passedAll) { results.push({ studentId: sid, ok:false, reason:"prereq" }); continue; }
            }
    
            // insert
            await pool.query(
            `INSERT INTO enrollments (student_id, course_id) VALUES ($1,$2)`,
            [sid, courseId]
            );
            seatsLeft -= 1;
            results.push({ studentId: sid, ok:true });
        }
    
        return res.status(200).json({ results, seatsLeft });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;
