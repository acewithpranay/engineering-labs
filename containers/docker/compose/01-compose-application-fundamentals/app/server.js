const express = require("express");
const { Pool } = require("pg");

const app = express();

const port = Number(process.env.PORT || 3000);

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "compose_lab",
    user: process.env.DB_USER || "compose",
    password: process.env.DB_PASSWORD || "compose_password"
});

app.get("/", (_req, res) => {
    res.json({
        application: "compose-lab-01-api",
        status: "running"
    });
});

app.get("/health", async (_req, res) => {
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            status: "healthy",
            database: "reachable"
        });
    } catch (error) {
        res.status(503).json({
            status: "unhealthy",
            database: "unreachable"
        });
    }
});

app.get("/db", async (_req, res) => {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database, NOW() AS server_time"
        );

        res.status(200).json({
            status: "connected",
            database: result.rows[0].database,
            server_time: result.rows[0].server_time
        });
    } catch (error) {
        console.error("Database query failed:", error.message);

        res.status(500).json({
            status: "error",
            message: "Database query failed"
        });
    }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on port ${port}`);
});