// api/data.js
export default async function handler(req, res) {
  // CORS headers para permitir tanto HTTP como HTTPS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');
  
  // Log para debugging
  console.log(`🔍 Método: ${req.method}, Protocolo: ${req.headers['x-forwarded-proto'] || 'http'}`);
  console.log('📨 Headers:', JSON.stringify(req.headers, null, 2));
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Preflight request manejado');
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    console.log(`❌ Método no permitido: ${req.method}`);
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    // Validar que los datos requeridos estén presentes
    const requiredFields = [
      'I_RMSA', 'I_RMSB', 'I_RMSC',
      'V_RMSA', 'V_RMSB', 'V_RMSC',
      'V_RMSAB', 'V_RMSBC', 'V_RMSCA',
      'kWhA', 'kWhB', 'kWhC',
      'PPROM_A', 'PPROM_B', 'PPROM_C'
    ];
    
    const missingFields = requiredFields.filter(field => 
      data[field] === undefined || data[field] === null
    );
    
    if (missingFields.length > 0) {
      console.log(`❌ Campos faltantes: ${missingFields.join(', ')}`);
      return res.status(400).json({ 
        error: "Faltan campos requeridos", 
        missingFields,
        receivedFields: Object.keys(data)
      });
    }
    
    // Validar y procesar números
    const processedData = {};
    let invalidFields = [];
    
    requiredFields.forEach(field => {
      const value = parseFloat(data[field]);
      if (isNaN(value)) {
        invalidFields.push(field);
        processedData[field] = 0;
      } else {
        processedData[field] = value;
      }
    });
    
    if (invalidFields.length > 0) {
      console.log(`⚠️ Campos con valores inválidos (convertidos a 0): ${invalidFields.join(', ')}`);
    }
    
    // Preparar datos para Supabase
    const deviceId = "photon-001";
    const timestamp = new Date().toISOString();
    
    const supabaseData = {
      device_id: deviceId,
      timestamp,
      ...processedData
    };
    
    console.log('🚀 Enviando a Supabase:', JSON.stringify(supabaseData, null, 2));
    
    // Verificar variable de entorno
    if (!process.env.SUPABASE_SERVICE_KEY) {
      console.error('❌ SUPABASE_SERVICE_KEY no está configurada');
      return res.status(500).json({ 
        error: "Configuración del servidor incompleta" 
      });
    }
    
    // Enviar a Supabase
    const supabaseResponse = await fetch("https://lpjxsvasvbpwazwobcnp.supabase.co/rest/v1/ElectricalData", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(supabaseData)
    });
    
    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      console.error(`❌ Error Supabase ${supabaseResponse.status}:`, errorText);
      return res.status(supabaseResponse.status).json({ 
        error: "Error al insertar en Supabase", 
        details: errorText,
        status: supabaseResponse.status
      });
    }
    
    console.log('✅ Datos insertados exitosamente en Supabase');
    
    // Respuesta de éxito
    const successResponse = { 
      message: "Datos insertados correctamente en Supabase",
      timestamp: timestamp,
      device_id: deviceId,
      processed_fields: requiredFields.length,
      invalid_fields_count: invalidFields.length
    };
    
    console.log('📤 Respuestas:', JSON.stringify(successResponse, null, 2));
    
    return res.status(200).json(successResponse);
    
  } catch (error) {
    console.error('💥 Error crítico:', error);
    return res.status(500).json({ 
      error: "Error interno del servidor", 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}