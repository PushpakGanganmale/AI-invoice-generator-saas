
import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

/* ---------------- GROQ ---------------- */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ---------------- TAX CALCULATION ---------------- */

function calculateTotals(items, taxPercent) {
  const subtotal = Number(
    items
      .reduce(
        (sum, item) => sum + item.qty * item.unitPrice,
        0
      )
      .toFixed(2)
  );

  const tax = Number(
    ((subtotal * taxPercent) / 100).toFixed(2)
  );

  const total = Number(
    (subtotal + tax).toFixed(2)
  );

  return {
    subtotal,
    tax,
    total,
  };
}

/* ---------------- GENERATE AI INVOICE ---------------- */

router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (
      !prompt ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "GROQ_API_KEY is missing",
      });
    }

    // AI invoice default GST is 18%.
    // An explicitly supplied percentage overrides it.
    const taxPercent = Number(req.body.taxPercent ?? 18);

    if (
      !Number.isFinite(taxPercent) ||
      taxPercent < 0 ||
      taxPercent > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Tax percentage must be between 0 and 100",
      });
    }

    const userPrompt = `
Extract structured invoice information from the input.

Return ONLY valid JSON.
Do not include explanations or Markdown.

STRICT RULES:
- Extract the client name, email, address and phone separately.
- Extract every product or service separately.
- Never put the entire input sentence in an item description.
- Extract quantity and unit price accurately.
- If quantity is missing, use 1.
- If price is missing, use 0.
- Do not invent customer details or prices.
- Do not calculate GST or invoice totals.
- Return only the requested JSON structure.

REQUIRED STRUCTURE:

{
  "client": {
    "name": "",
    "email": "",
    "address": "",
    "phone": ""
  },
  "items": [
    {
      "description": "",
      "qty": 1,
      "unitPrice": 0
    }
  ]
}

EXAMPLE:

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

ANOTHER EXAMPLE:

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

USER INPUT:

${prompt}
`;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
          role: "system",
          content:
            "You extract invoice information and return only valid JSON matching the required structure.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],

      temperature: 0,

      response_format: {
        type: "json_object",
      },
    });

    const rawText =
      completion.choices[0]?.message?.content || "";

    let parsed;

    try {
      const cleanText = rawText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      parsed = JSON.parse(cleanText);
    } catch (error) {
      console.error("AI JSON Parse Error:", error.message);

      return res.status(500).json({
        success: false,
        message: "AI returned invalid invoice data",
      });
    }

    if (
      !parsed ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    ) {
      return res.status(422).json({
        success: false,
        message: "No invoice items could be extracted",
      });
    }

    /* ---------------- VALIDATE ITEMS ---------------- */

    const items = parsed.items.map((item) => {
      const qty = Number(item.qty);
      const unitPrice = Number(item.unitPrice);

      if (
        !Number.isFinite(qty) ||
        !Number.isFinite(unitPrice) ||
        qty <= 0 ||
        unitPrice < 0
      ) {
        throw new Error(
          "AI returned invalid item quantity or unit price"
        );
      }

      return {
        description: String(
          item.description || "Item"
        ).trim(),

        qty,
        unitPrice,
      };
    });

    /* ---------------- CALCULATE TAX ---------------- */

    const totals = calculateTotals(items, taxPercent);

    /* ---------------- RESPONSE ---------------- */

    const data = {
      client: {
        name: parsed.client?.name || "",
        email: parsed.client?.email || "",
        address: parsed.client?.address || "",
        phone: parsed.client?.phone || "",
      },

      items,

      // Canonical database fields.
      taxPercent,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,

      // Backward compatibility with old frontend.
      taxRate: taxPercent,
      taxAmount: totals.tax,
    };

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("AI Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Something went wrong during AI invoice generation",
    });
  }
});

export default router;
