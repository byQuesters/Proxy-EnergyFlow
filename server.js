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

// ======================
// Función para consolidar datos mensuales
// ======================
async function consolidateMonthlyData(deviceId = "photon-001") {
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // mes actual

    const startDate = new Date(Date.UTC(year, month, 1)).toISOString();
    const endDate = new Date(Date.UTC(year, month + 1, 1)).toISOString();

    // Leer datos del mes
    const resp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ElectricalData?timestamp=gte.${startDate}&timestamp=lt.${endDate}&device_id=eq.${deviceId}`,
      {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const records = await resp.json();
    if (!records.length) return console.log("No hay datos que consolidar");

    // Calcular promedios y totales
    const sum = records.reduce((acc, r) => {
      Object.keys(r).forEach(k => {
        if (!acc[k] && typeof r[k] === "number") acc[k] = 0;
        if (acc[k] !== undefined) acc[k] += r[k];
      });
      return acc;
    }, {});

    const count = records.length;
    const monthlyData = {
      year: new Date(startDate).getUTCFullYear(),
      month: new Date(startDate).getUTCMonth() + 1,
      avg_i_rmsa: sum.I_RMSA / count,
      avg_i_rmsb: sum.I_RMSB / count,
      avg_i_rmsc: sum.I_RMSC / count,
      avg_v_rmsa: sum.V_RMSA / count,
      avg_v_rmsb: sum.V_RMSB / count,
      avg_v_rmsc: sum.V_RMSC / count,
      avg_v_rmsab: sum.V_RMSAB / count,
      avg_v_rmsbc: sum.V_RMSBC / count,
      avg_v_rmsca: sum.V_RMSCA / count,
      total_kwha: sum.kWhA,
      total_kwhb: sum.kWhB,
      total_kwhc: sum.kWhC,
      avg_pprom_a: sum.PPROM_A / count,
      avg_pprom_b: sum.PPROM_B / count,
      avg_pprom_c: sum.PPROM_C / count,
      record_count: count,
      device_id: deviceId,
    };

    // Insertar en MonthlyElectricalData
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/MonthlyElectricalData`, {
      method: "POST",
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(monthlyData),
    });

    // Borrar registros antiguos
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ElectricalData?timestamp=gte.${startDate}&timestamp=lt.${endDate}&device_id=eq.${deviceId}`,
      {
        method: "DELETE",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    console.log(`✅ Consolidado y borrados ${count} registros del mes ${month + 1}`);
  } catch (err) {
    console.error("💥 Error consolidando datos:", err);
  }
}

// ======================
// Endpoint que recibe datos del Photon
// ======================
app.post("/api/data", async (req, res) => {
  try {
    const data = req.body;

    const requiredFields = [
      "I_RMSA","I_RMSB","I_RMSC",
      "V_RMSA","V_RMSB","V_RMSC",
      "V_RMSAB","V_RMSBC","V_RMSCA",
      "kWhA","kWhB","kWhC",
      "PPROM_A","PPROM_B","PPROM_C"
    ];

    const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null);
    if (missing.length) return res.status(400).json({ error: "Faltan campos", missing });

    const processed = {};
    requiredFields.forEach(f => processed[f] = parseFloat(data[f]) || 0);

    const supabaseData = {
      device_id: "photon-001",
      timestamp: new Date().toISOString(),
      ...processed,
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

// ======================
// Cron mensual con protección contra overflow
// ======================
const MAX_TIMEOUT = 2147483647; // ~24.8 días en ms

function scheduleMonthlyConsolidation() {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  let msUntilNextMonth = nextMonth - now;

  if (msUntilNextMonth > MAX_TIMEOUT) {
    console.warn("⏱ Timeout demasiado grande, se limitará a 24 días");
    msUntilNextMonth = MAX_TIMEOUT;
  }

  setTimeout(async () => {
    await consolidateMonthlyData();
    scheduleMonthlyConsolidation(); // reprograma
  }, msUntilNextMonth);
}

scheduleMonthlyConsolidation();

app.listen(PORT, () => {
  console.log(`🚀 Proxy escuchando en http://0.0.0.0:${PORT}`);
});
