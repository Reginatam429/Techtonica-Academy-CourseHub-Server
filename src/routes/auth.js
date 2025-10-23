import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../../server.js";

const router = express.Router();

// Student self-register
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, studentId, major } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });
        const hash = await bcrypt.hash(password, 10);
        const q = `
        INSERT INTO users (role,name,email,password,student_id,major)
        VALUES ('STUDENT',$1,$2,$3,$4,$5)
        RETURNING id, role, name, email, student_id AS "studentId", major
        `;
        const { rows } = await pool.query(q, [name, email, hash, studentId || null, major || null]);
        const user = rows[0];
        const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, process.env.JWT_SECRET);
        res.status(201).json({ token, user });
    } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "Email or student_id already exists" });
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

// Login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, role: user.role, name: user.name, email: user.email, studentId: user.student_id, major: user.major } });
});

export default router;
