// api/data.js
export default async function handler(req, res) {
  // Permitir CORS para el Photon
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }
  try {
    const data = req.body;
    
    // Validar que los datos requeridos estén presentes
    const requiredFields = [
      'I_RMSA', 'I_RMSB', 'I_RMSC',
      'V_RMSA', 'V_RMSB', 'V_RMSC',
      'V_RMSAB', 'V_RMSBC', 'V_RMSCA',
      'kWhA', 'kWhB', 'kWhC',
      'PPROM_A', 'PPROM_B', 'PPROM_C'
    ];
    
    const missingFields = requiredFields.filter(field => data[field] === undefined || data[field] === null);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: "Faltan campos requeridos", 
        missingFields 
      });
    }
    
    // Validar que los números sean válidos
    const processedData = {};
    requiredFields.forEach(field => {
      const value = parseFloat(data[field]);
      if (isNaN(value)) {
        processedData[field] = 0;
      } else {
        processedData[field] = value;
      }
    });
    
    // Preparar datos para Supabase
    const supabaseData = {
      device_id: "photon-001",
      timestamp: new Date().toISOString(),
      ...processedData
    };
    
    console.log('Enviando datos a Supabase:', JSON.stringify(supabaseData, null, 2));
    
    // Enviar a Supabase
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
      return res.status(resp.status).json({ 
        error: "Error al insertar en Supabase", 
        details: errText 
      });
    }
    console.log('Datos insertados exitosamente en Supabase');
    return res.status(200).json({ 
      message: "Datos insertados correctamente en Supabase",
      timestamp: supabaseData.timestamp
    });
    
  } catch (error) {
    console.error('Error en el proxy:', error);
    return res.status(500).json({ 
      error: "Error interno del servidor", 
      details: error.message 
    });
  }
}
