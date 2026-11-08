// testGemini.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Say hello",
  });

  console.log(res.text);
}

test();