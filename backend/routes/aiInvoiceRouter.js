import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    const userPrompt = `
Extract structured invoice data from the input.

Return ONLY valid JSON. No explanation.

Strict rules:
- Extract item name separately (NOT full sentence)
- Extract quantity and unitPrice correctly
- NEVER put full input in description
- Split multiple items

Schema:
{
  "client":{
    "name":"",
    "email":"",
    "address":"",
    "phone":""
  },
  "items":[
    {
      "description":"",
      "qty":1,
      "unitPrice":0
    }
  ]
}

Example 1:

Input:
"2 laptops 50000 each for Rahul Sharma"

Output:
{
  "client": {
    "name": "Rahul Sharma",
    "email": "",
    "address": "",
    "phone": ""
  },
  "items": [
    {
      "description": "Laptop",
      "qty": 2,
      "unitPrice": 50000
    }
  ]
}

Example 2:

Input:
"3 chairs 2000 each and 2 tables 5000 each for Amit"

Output:
{
  "client": {
    "name": "Amit",
    "email": "",
    "address": "",
    "phone": ""
  },
  "items": [
    {
      "description": "Chair",
      "qty": 3,
      "unitPrice": 2000
    },
    {
      "description": "Table",
      "qty": 2,
      "unitPrice": 5000
    }
  ]
}

Now process:

${prompt}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // ✅ FIXED: updated from deprecated llama-3.1-70b-versatile
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON generator. Always return only valid JSON. Never include explanations.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0,
    });

    const text = completion.choices[0]?.message?.content || "";

    console.log("RAW AI OUTPUT:", text);

    const clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/^[^{]*/, "")
      .replace(/[^}]*$/, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch (err) {
      console.error("JSON PARSE ERROR:", clean);

      return res.status(500).json({
        success: false,
        message: "Invalid JSON returned by AI",
        raw: text,
      });
    }

    const subtotal = parsed.items.reduce(
      (sum, item) => sum + item.qty * item.unitPrice,
      0
    );

    const taxRate = 18;
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;

    return res.json({
      success: true,
      data: {
        ...parsed,
        subtotal,
        taxRate,
        taxAmount,
        total,
      },
    });
  } catch (err) {
    console.error("AI ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong in AI generation",
    });
  }
});

export default router;