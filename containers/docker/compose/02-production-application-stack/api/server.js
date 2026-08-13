const express = require("express");
const { Pool } = require("pg");
const { createClient } = require("redis");

const app = express();

const port = Number(process.env.PORT || 3000);

const dbPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379)
    }
});

redisClient.on("error", (error) => {
    console.error("Redis client error:", error.message);
});

async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
}

app.get("/", (_req, res) => {
    res.json({
        application: "compose-lab-02-api",
        status: "running"
    });
});

app.get("/health", async (_req, res) => {
    try {
        await dbPool.query("SELECT 1");
        await connectRedis();
        await redisClient.ping();

        res.status(200).json({
            status: "healthy",
            postgres: "reachable",
            redis: "reachable"
        });
    } catch (error) {
        res.status(503).json({
            status: "unhealthy",
            error: error.message
        });
    }
});

app.get("/db", async (_req, res) => {
    try {
        const result = await dbPool.query(
            "SELECT current_database() AS database"
        );

        res.json({
            status: "connected",
            database: result.rows[0].database
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

app.get("/cache", async (_req, res) => {
    try {
        await connectRedis();

        const key = "compose:lab:cache";

        await redisClient.set(key, "redis-is-working", {
            EX: 60
        });

        const value = await redisClient.get(key);

        res.json({
            status: "connected",
            value
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on port ${port}`);
});