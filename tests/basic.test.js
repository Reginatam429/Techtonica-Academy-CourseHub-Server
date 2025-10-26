import request from "supertest";
import app from "../server.js";

describe("Basic API tests", () => {
    it("should hit the base route successfully", async () => {
        const res = await request(app).get("/");
        expect(res.statusCode).toBe(200);
    });

    it("should reject invalid login", async () => {
        const res = await request(app)
        .post("/auth/login")
        .send({ email: "fake@coursehub.io", password: "wrongpass" });
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty("error");
    });

    it("POST /auth/login accepts valid admin", async () => {
        const res = await request(app)
            .post("/auth/login")
            .send({ email: "admin@coursehub.io", password: "adminpass" });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("token");
        expect(res.body.user).toMatchObject({ email: "admin@coursehub.io", role: "ADMIN" });
    });
});
