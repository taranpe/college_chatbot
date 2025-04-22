const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const natural = require("natural");
const gtts = require("gtts");

dotenv.config();
const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";
const RASA_API_URL = "http://localhost:5005/webhooks/rest/webhook";

const responsesFile = path.join(__dirname, "responses.json");
let predefinedResponses = fs.existsSync(responsesFile) ? JSON.parse(fs.readFileSync(responsesFile, "utf-8")) : {};

function getPredefinedResponse(question) {
    const tokenizer = new natural.WordTokenizer();
    const inputTokens = tokenizer.tokenize(question.toLowerCase());
    let bestMatch = null;
    let highestSimilarity = 0.0;

    for (const key in predefinedResponses) {
        const predefinedTokens = tokenizer.tokenize(key.toLowerCase());
        const similarity = natural.DiceCoefficient(inputTokens.join(" "), predefinedTokens.join(" "));
        if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestMatch = key;
        }
    }
    return highestSimilarity > 0.5 ? predefinedResponses[bestMatch] : null;
}

async function fetchRasaResponse(question) {
    try {
        const response = await axios.post(RASA_API_URL, { message: question });
        return response.data.length > 0 ? response.data[0].text : null;
    } catch (error) {
        console.error("❌ Rasa API Error:", error.message);
        return null;
    }
}

async function fetchBotReply(question) {
    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${API_KEY}`,
            { contents: [{ role: "user", parts: [{ text: question }] }] },
            { headers: { "Content-Type": "application/json" } }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response.";
    } catch (error) {
        console.error("❌ API Error:", error.message);
        return "Server is facing issues. Try again later.";
    }
}

function generateSpeech(replyText) {
    return new Promise((resolve) => {
        const gttsSpeech = new gtts(replyText, "en");
        const audioFileName = `response_${Date.now()}.mp3`;
        const audioPath = path.join(__dirname, "public", audioFileName);

        gttsSpeech.save(audioPath, (err) => {
            if (err) {
                console.error("❌ TTS Error:", err);
                resolve(null);
            }
            resolve(`/public/${audioFileName}`);
        });
    });
}

app.post("/api/chat", async (req, res) => {
    const { question } = req.body;
    console.log("User Question:", question);

    const predefinedResponse = getPredefinedResponse(question);
    if (predefinedResponse) {
        return res.json({ reply: predefinedResponse, audio: null });
    }

    const [rasaReply, geminiReply] = await Promise.all([
        fetchRasaResponse(question),
        fetchBotReply(question),
    ]);

    const reply = rasaReply || geminiReply;
    console.log("🤖 Final Response:", reply);
    res.json({ reply, audio: null });

    // Generate speech asynchronously
    generateSpeech(reply).then((audioUrl) => {
        console.log("🎤 Speech Generated:", audioUrl);
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
