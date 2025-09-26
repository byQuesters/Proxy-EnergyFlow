// api/data.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Permitir CORS para el Photon
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

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

    const processedData = {};
    requiredFields.forEach(f => processedData[f] = parseFloat(data[f]) || 0);

    const deviceId = "photon-001";
    const timestamp = new Date();
    const supabaseData = { device_id: deviceId, timestamp, ...processedData };

    // 1️⃣ Insertar registro individual
    const { error: insertError } = await supabase.from('ElectricalData').insert([supabaseData]);
    if (insertError) throw insertError;

    // 2️⃣ Actualizar o crear registro mensual
    const year = timestamp.getFullYear();
    const month = timestamp.getMonth() + 1; // JS 0-indexed

    const { data: monthlyData, error: fetchError } = await supabase
      .from('MonthlyElectricalData')
      .select('*')
      .eq('device_id', deviceId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    if (monthlyData) {
      // Actualizar promedio acumulativo
      const count = (monthlyData.record_count || 0) + 1;

      const updated = {
        avg_i_rmsa: ((monthlyData.avg_i_rmsa || 0) * (count - 1) + processedData.I_RMSA)/count,
        avg_i_rmsb: ((monthlyData.avg_i_rmsb || 0) * (count - 1) + processedData.I_RMSB)/count,
        avg_i_rmsc: ((monthlyData.avg_i_rmsc || 0) * (count - 1) + processedData.I_RMSC)/count,
        avg_v_rmsa: ((monthlyData.avg_v_rmsa || 0) * (count - 1) + processedData.V_RMSA)/count,
        avg_v_rmsb: ((monthlyData.avg_v_rmsb || 0) * (count - 1) + processedData.V_RMSB)/count,
        avg_v_rmsc: ((monthlyData.avg_v_rmsc || 0) * (count - 1) + processedData.V_RMSC)/count,
        avg_v_rmsab: ((monthlyData.avg_v_rmsab || 0) * (count - 1) + processedData.V_RMSAB)/count,
        avg_v_rmsbc: ((monthlyData.avg_v_rmsbc || 0) * (count - 1) + processedData.V_RMSBC)/count,
        avg_v_rmsca: ((monthlyData.avg_v_rmsca || 0) * (count - 1) + processedData.V_RMSCA)/count,
        total_kwha: (monthlyData.total_kwha || 0) + processedData.kWhA,
        total_kwhb: (monthlyData.total_kwhb || 0) + processedData.kWhB,
        total_kwhc: (monthlyData.total_kwhc || 0) + processedData.kWhC,
        avg_pprom_a: ((monthlyData.avg_pprom_a || 0) * (count - 1) + processedData.PPROM_A)/count,
        avg_pprom_b: ((monthlyData.avg_pprom_b || 0) * (count - 1) + processedData.PPROM_B)/count,
        avg_pprom_c: ((monthlyData.avg_pprom_c || 0) * (count - 1) + processedData.PPROM_C)/count,
        record_count: count,
        created_at: new Date()
      };

      await supabase.from('MonthlyElectricalData')
        .update(updated)
        .eq('device_id', deviceId)
        .eq('year', year)
        .eq('month', month);

    } else {
      // Crear registro mensual
      await supabase.from('MonthlyElectricalData').insert([{
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
        created_at: new Date()
      }]);
    }

    return res.status(200).json({
      message: "Datos insertados y promediados correctamente",
      timestamp
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error interno del servidor", details: error.message });
  }
}
