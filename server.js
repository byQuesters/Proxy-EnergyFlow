import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(bodyParser.json());

// Endpoint que recibe datos del Photon
app.post("/api/data", async (req, res) => {
  try {
    const data = req.body;

    // Campos obligatorios
    const requiredFields = [
      "I_RMSA","I_RMSB","I_RMSC",
      "V_RMSA","V_RMSB","V_RMSC",
      "V_RMSAB","V_RMSBC","V_RMSCA",
      "kWhA","kWhB","kWhC",
      "PPROM_A","PPROM_B","PPROM_C"
    ];

    const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null);
    if (missing.length) {
      return res.status(400).json({ error: "Faltan campos", missing });
    }

    // Procesar valores numéricos
    const processed = {};
    requiredFields.forEach(f => processed[f] = parseFloat(data[f]) || 0);

    const supabaseData = {
      device_id: "photon-001",
      timestamp: new Date().toISOString(),
      ...processed
    };

    console.log("➡️ Enviando a Supabase:", supabaseData);

    const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ElectricalData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(supabaseData)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("❌ Error Supabase:", resp.status, errText);
      return res.status(resp.status).json({ error: "Supabase failed", details: errText });
    }

    const result = await resp.json();
    return res.status(200).json({ message: "✅ Datos insertados", data: result });

  } catch (err) {
    console.error("💥 Error proxy:", err);
    return res.status(500).json({ error: "Error interno", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy escuchando en http://0.0.0.0:${PORT}`);
});
