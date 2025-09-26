// api/data.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Método no permitido" });

  try {
    const data = req.body;
    const requiredFields = [
      'I_RMSA','I_RMSB','I_RMSC',
      'V_RMSA','V_RMSB','V_RMSC',
      'V_RMSAB','V_RMSBC','V_RMSCA',
      'kWhA','kWhB','kWhC',
      'PPROM_A','PPROM_B','PPROM_C'
    ];

    const missingFields = requiredFields.filter(f => data[f] === undefined || data[f] === null);
    if (missingFields.length) return res.status(400).json({ error: "Faltan campos", missingFields });

    const processedData = {};
    requiredFields.forEach(f => processedData[f] = parseFloat(data[f]) || 0);

    const supabaseData = { device_id: "photon-001", timestamp: new Date().toISOString(), ...processedData };

    console.log("Enviando a Supabase:", supabaseData);

    const resp = await fetch("https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/ElectricalData", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(supabaseData)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Error Supabase:", resp.status, errText);
      return res.status(resp.status).json({ error: "Supabase failed", details: errText });
    }

    return res.status(200).json({ message: "Datos insertados", timestamp: supabaseData.timestamp });

  } catch (err) {
    console.error("Error proxy:", err);
    return res.status(500).json({ error: "Error interno", details: err.message });
  }
}
