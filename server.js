const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const natural = require("natural");

dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Gemini API setup
const API_KEY = "AIzaSyAn8CQ-t0twkA-n8S0At6TVkjfaaPg-aBg"; // Fallback in case .env is not used
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// Load predefined responses
const responsesFile = path.join(__dirname, "responses.json");
let predefinedResponses = fs.existsSync(responsesFile)
  ? JSON.parse(fs.readFileSync(responsesFile, "utf-8"))
  : {};

// Function to match predefined responses using Dice Coefficient
function getPredefinedResponse(question) {
  const tokenizer = new natural.WordTokenizer();
  const inputTokens = tokenizer.tokenize(question.toLowerCase());

  let bestMatch = null;
  let highestSimilarity = 0;

  for (const key in predefinedResponses) {
    const predefinedTokens = tokenizer.tokenize(key.toLowerCase());
    const similarity = natural.DiceCoefficient(
      inputTokens.join(" "),
      predefinedTokens.join(" ")
    );

    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = key;
    }
  }

  return highestSimilarity > 0.5 ? predefinedResponses[bestMatch] : null;
}

// Fetch reply from Gemini 2.5 Flash
async function fetchBotReply(question) {
  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ],
    };

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${API_KEY}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const result =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return result || "I couldn't generate a response.";
  } catch (error) {
    console.error("❌ Gemini API Error:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Error:", error.message);
    }

    return "Sorry, I'm having trouble generating a response.";
  }
}

// API route to handle chat
app.post("/api/chat", async (req, res) => {
  const { question } = req.body;
  console.log("❓ User Question:", question);

  // Check predefined responses first
  const predefinedResponse = getPredefinedResponse(question);
  if (predefinedResponse) {
    console.log("✅ Matched predefined response");
    return res.json({ reply: predefinedResponse });
  }

  // If no predefined match, use Gemini
  const geminiReply = await fetchBotReply(question);
  console.log("🤖 Gemini Reply:", geminiReply);
  res.json({ reply: geminiReply });
});

// Serve the homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
