import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { id, role, email, name }
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        if (!roles.length || roles.includes(req.user.role)) return next();
        return res.status(403).json({ error: "Forbidden" });
    };
}
