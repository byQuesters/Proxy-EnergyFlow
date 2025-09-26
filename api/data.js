// api/data.js
export default async function handler(req, res) {
  // Permitir CORS
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
    if (missingFields.length) return res.status(400).json({ error: "Faltan campos requeridos", missingFields });

    // Parsear valores
    const processedData = {};
    requiredFields.forEach(f => processedData[f] = parseFloat(data[f]) || 0);

    const deviceId = "photon-001";
    const timestamp = new Date().toISOString();

    const supabaseData = { device_id: deviceId, timestamp, ...processedData };

    console.log('Enviando datos a Supabase:', JSON.stringify(supabaseData, null, 2));

    // Insertar registro individual usando REST API (igual que tu curl)
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
      console.error('Error de Supabase:', resp.status, errText);
      return res.status(resp.status).json({ error: "Error al insertar en Supabase", details: errText });
    }

    // Calcular promedio mensual
    const year = new Date(timestamp).getFullYear();
    const month = new Date(timestamp).getMonth() + 1;

    // Insertar o actualizar promedio mensual
    const monthlyResp = await fetch(`https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/MonthlyElectricalData?device_id=eq.${deviceId}&year=eq.${year}&month=eq.${month}`, {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    const monthlyData = await monthlyResp.json();

    if (monthlyData && monthlyData.length > 0) {
      const monthRecord = monthlyData[0];
      const count = (monthRecord.record_count || 0) + 1;

      const updated = {
        avg_i_rmsa: ((monthRecord.avg_i_rmsa || 0)*(count-1) + processedData.I_RMSA)/count,
        avg_i_rmsb: ((monthRecord.avg_i_rmsb || 0)*(count-1) + processedData.I_RMSB)/count,
        avg_i_rmsc: ((monthRecord.avg_i_rmsc || 0)*(count-1) + processedData.I_RMSC)/count,
        avg_v_rmsa: ((monthRecord.avg_v_rmsa || 0)*(count-1) + processedData.V_RMSA)/count,
        avg_v_rmsb: ((monthRecord.avg_v_rmsb || 0)*(count-1) + processedData.V_RMSB)/count,
        avg_v_rmsc: ((monthRecord.avg_v_rmsc || 0)*(count-1) + processedData.V_RMSC)/count,
        avg_v_rmsab: ((monthRecord.avg_v_rmsab || 0)*(count-1) + processedData.V_RMSAB)/count,
        avg_v_rmsbc: ((monthRecord.avg_v_rmsbc || 0)*(count-1) + processedData.V_RMSBC)/count,
        avg_v_rmsca: ((monthRecord.avg_v_rmsca || 0)*(count-1) + processedData.V_RMSCA)/count,
        total_kwha: (monthRecord.total_kwha || 0) + processedData.kWhA,
        total_kwhb: (monthRecord.total_kwhb || 0) + processedData.kWhB,
        total_kwhc: (monthRecord.total_kwhc || 0) + processedData.kWhC,
        avg_pprom_a: ((monthRecord.avg_pprom_a || 0)*(count-1)+processedData.PPROM_A)/count,
        avg_pprom_b: ((monthRecord.avg_pprom_b || 0)*(count-1)+processedData.PPROM_B)/count,
        avg_pprom_c: ((monthRecord.avg_pprom_c || 0)*(count-1)+processedData.PPROM_C)/count,
        record_count: count,
        created_at: new Date().toISOString()
      };

      await fetch(`https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/MonthlyElectricalData?id=eq.${monthRecord.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(updated)
      });

    } else {
      // Crear nuevo registro mensual
      await fetch("https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/MonthlyElectricalData", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          device_id: deviceId,
          year,
          month,
          avg_i_rmsa: processedData.I_RMSA,
          avg_i_rmsb: processedData.I_RMSB,
          avg_i_rmsc: processedData.I_RMSC,
          avg_v_rmsa: processedData.V_RMSA,
          avg_v_rmsb: processedData.V_RMSB,
          avg_v_rmsc: processedData.V_RMSC,
          avg_v_rmsab: processedData.V_RMSAB,
          avg_v_rmsbc: processedData.V_RMSBC,
          avg_v_rmsca: processedData.V_RMSCA,
          total_kwha: processedData.kWhA,
          total_kwhb: processedData.kWhB,
          total_kwhc: processedData.kWhC,
          avg_pprom_a: processedData.PPROM_A,
          avg_pprom_b: processedData.PPROM_B,
          avg_pprom_c: processedData.PPROM_C,
          record_count: 1,
          created_at: new Date().toISOString()
        })
      });
    }

    // Limpiar datos antiguos para no consumir MB
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    await fetch(`https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/ElectricalData?timestamp=lt.${new Date(prevYear, prevMonth-1, 1).toISOString()}`, {
      method: "DELETE",
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });

    return res.status(200).json({
      message: "Datos insertados, promediados y limpieza completada",
      timestamp
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error interno del servidor", details: error.message });
  }
}
