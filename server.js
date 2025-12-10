import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

// Load environment variables from .env if present
dotenv.config();

// Use environment variable for OpenRouter API key
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY is not set.");
    process.exit(1);
}

// Use environment variable for port (Render provides this)
const PORT = process.env.PORT || 3000;

const app = express();

// --- Add CORS support ---
app.use(cors({
    origin: "*",  // Allow requests from any origin (browser/web clients)
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
}));

app.use(bodyParser.json({ limit: "100mb" }));

// Token estimation (rough: 1 token ≈ 4 chars)
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// Ensure logs directory exists
const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// --- POST route for JanitorAI proxy ---
app.post("/v1/chat/completions", async (req, res) => {
    // Log Proxy API Key
    const incomingKey = req.headers['authorization'] || req.headers['x-api-key'];
    console.log("Proxy API Key received:", incomingKey);

    // Log incoming request
    console.log("========= Incoming Request =========");
    console.log(JSON.stringify(req.body, null, 2));

    // Save request to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const promptFile = path.join(LOG_DIR, `prompt-${timestamp}.json`);
    fs.writeFileSync(promptFile, JSON.stringify(req.body, null, 2));

    // Estimate tokens
    let totalTokens = 0;
    if (req.body.messages) {
        req.body.messages.forEach((msg, idx) => {
            const t = estimateTokens(msg.content);
            totalTokens += t;
            console.log(`Message #${idx} (${msg.role}) ≈ ${t} tokens`);
        });
    }
    console.log(`Estimated total tokens: ${totalTokens}`);

    try {
        // Forward request to OpenRouter with your model
        const openrouterPayload = {
            ...req.body,
            model: "z-ai/glm-4.5-air:free" // force your model
        };

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify(openrouterPayload)
        });

        const data = await response.json();

        // Log model response
        console.log("========= Model Response =========");
        console.log(JSON.stringify(data, null, 2));

        // Save response to file
        const responseFile = path.join(LOG_DIR, `response-${timestamp}.json`);
        fs.writeFileSync(responseFile, JSON.stringify(data, null, 2));

        // Return response to JanitorAI
        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).send("Proxy Error");
    }
});

// Simple test route
app.get("/", (req, res) => {
    res.send("Local JanitorAI Proxy is running with CORS enabled.");
});

// Start server
app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
