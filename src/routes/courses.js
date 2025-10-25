import express from "express";
import { pool } from "../../server.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// helpers
function validateCourseCreate({ code, name, credits, enrollment_limit }) {
    const errors = [];
    if (!code || !code.trim()) errors.push("code is required.");
    if (!name || !name.trim()) errors.push("name is required.");
    if (credits == null || Number.isNaN(Number(credits)) || Number(credits) < 0) {
        errors.push("credits must be a number >= 0.");
    }
    if (
        enrollment_limit == null ||
        Number.isNaN(Number(enrollment_limit)) ||
        Number(enrollment_limit) < 0
    ) {
        errors.push("enrollment_limit must be a number >= 0.");
    }
    return errors;
}

// update partial; only validate provided fields
function validateCourseUpdate({ code, name, credits, enrollment_limit }) {
    const errors = [];
    if (code != null && !String(code).trim()) errors.push("code cannot be empty.");
    if (name != null && !String(name).trim()) errors.push("name cannot be empty.");
    if (credits != null && (Number.isNaN(Number(credits)) || Number(credits) < 0)) {
        errors.push("credits must be a number >= 0.");
    }
    if (
        enrollment_limit != null &&
        (Number.isNaN(Number(enrollment_limit)) || Number(enrollment_limit) < 0)
    ) {
        errors.push("enrollment_limit must be a number >= 0.");
    }
    return errors;
}

// Search Course

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

// Get a Course by ID

router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await pool.query(`SELECT * FROM courses WHERE id=$1`, [id]);
        if (!rows[0]) return res.status(404).json({ error: "Not found" });

        const { rows: prereqs } = await pool.query(
        `SELECT p.prereq_id AS id, c.code, c.name
        FROM course_prereqs p
        JOIN courses c ON c.id = p.prereq_id
        WHERE p.course_id = $1
        ORDER BY c.code`,
        [id]
        );

        return res.json({ ...rows[0], prereqs });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

// Create (include prereqs)

router.post("/", requireAuth, requireRole("TEACHER", "ADMIN"), async (req, res) => {
    const { code, name, credits, enrollment_limit, prereqIds } = req.body || {};
    const teacherId =
        req.user.role === "TEACHER" ? req.user.id : req.body.teacherId || req.user.id;

    const errors = validateCourseCreate({ code, name, credits, enrollment_limit });
    if (errors.length) return res.status(400).json({ errors });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { rows: created } = await client.query(
        `INSERT INTO courses (code, name, credits, enrollment_limit, teacher_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *`,
        [code.trim(), name.trim(), Number(credits), Number(enrollment_limit), teacherId]
        );
        const course = created[0];

        if (Array.isArray(prereqIds) && prereqIds.length) {
        const uniq = [...new Set(prereqIds.map(Number))].filter((pid) => pid !== course.id);
        if (uniq.length) {
            // ensure prereq courses exist
            const { rows: exist } = await client.query(
            `SELECT id FROM courses WHERE id = ANY($1::int[])`,
            [uniq]
            );
            if (exist.length !== uniq.length) throw new Error("One or more prereqIds do not exist");

            await client.query(
            `INSERT INTO course_prereqs (course_id, prereq_id)
            SELECT $1, x FROM unnest($2::int[]) AS u(x)
            ON CONFLICT (course_id,prereq_id) DO NOTHING`,
            [course.id, uniq]
            );
        }
        }

        await client.query("COMMIT");
        return res.status(201).json(course);
    } catch (e) {
        await client.query("ROLLBACK");
        if (e.code === "23505") return res.status(409).json({ error: "Course code already exists" });
        console.error(e);
        return res.status(400).json({ error: e.message || "Server error" });
    } finally {
        client.release();
    }
});

// Update (replace prereqs)
router.put("/:id", requireAuth, requireRole("TEACHER", "ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    const { code, name, credits, enrollment_limit, prereqIds } = req.body || {};

    const errors = validateCourseUpdate({ code, name, credits, enrollment_limit });
    if (errors.length) return res.status(400).json({ errors });

    // teacher ownership enforcement
    if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(
        `SELECT teacher_id FROM courses WHERE id=$1`,
        [id]
        );
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id)
        return res.status(403).json({ error: "Not your course" });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { rows } = await client.query(
        `UPDATE courses
            SET code = COALESCE($1, code),
                name = COALESCE($2, name),
                credits = COALESCE($3, credits),
                enrollment_limit = COALESCE($4, enrollment_limit),
                updated_at = NOW()
        WHERE id=$5
        RETURNING *`,
        [
            code != null ? code.trim() : null,
            name != null ? name.trim() : null,
            credits != null ? Number(credits) : null,
            enrollment_limit != null ? Number(enrollment_limit) : null,
            id,
        ]
        );
        if (!rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Not found" });
        }
        const course = rows[0];

        // If prereqIds provided, replace the set
        if (Array.isArray(prereqIds)) {
        const uniq = [...new Set(prereqIds.map(Number))].filter((pid) => pid !== id);

        await client.query(`DELETE FROM course_prereqs WHERE course_id=$1`, [id]);

        if (uniq.length) {
            const { rows: exist } = await client.query(
            `SELECT id FROM courses WHERE id = ANY($1::int[])`,
            [uniq]
            );
            if (exist.length !== uniq.length) throw new Error("One or more prereqIds do not exist");

            await client.query(
            `INSERT INTO course_prereqs (course_id, prereq_id)
            SELECT $1, x FROM unnest($2::int[]) AS u(x)
            ON CONFLICT (course_id,prereq_id) DO NOTHING`,
            [id, uniq]
            );
        }
        }

        await client.query("COMMIT");
        return res.json(course);
    } catch (e) {
        await client.query("ROLLBACK");
        if (e.code === "23505") return res.status(409).json({ error: "Course code already exists" });
        console.error(e);
        return res.status(400).json({ error: e.message || "Server error" });
    } finally {
        client.release();
    }
});

// Delete Course

router.delete("/:id", requireAuth, requireRole("TEACHER", "ADMIN"), async (req, res) => {
    const id = Number(req.params.id);
    try {
        if (req.user.role === "TEACHER") {
        const { rows: ownerRows } = await pool.query(`SELECT teacher_id FROM courses WHERE id=$1`, [
            id,
        ]);
        if (!ownerRows[0]) return res.status(404).json({ error: "Not found" });
        if (ownerRows[0].teacher_id !== req.user.id)
            return res.status(403).json({ error: "Not your course" });
        }

        await pool.query(`DELETE FROM courses WHERE id=$1`, [id]);
        return res.status(204).send();
    } catch (e) {
        if (e.code === "23503") {
        // FK present: enrollments or prereqs referencing this course
        return res
            .status(409)
            .json({ error: "Course has related records; remove dependencies first" });
        }
        console.error(e);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;
