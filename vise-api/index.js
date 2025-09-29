const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Datos en memoria (temporal)
let clients = [];
let nextClientId = 1;

const restrictedCountries = ['China','Vietnam','India','Irán','Iran']; // normalizamos 'Irán' y 'Iran'

// Util: validar elegibilidad segun tipo de tarjeta
function checkEligibility({ monthlyIncome, viseClub, cardType, country }) {
  const type = (cardType || '').toLowerCase();
  if (type === 'classic') return { eligible: true };
  if (type === 'gold') {
    if ((monthlyIncome || 0) >= 500) return { eligible: true };
    return { eligible: false, reason: 'El cliente no cumple con el ingreso mínimo de 500 USD para Gold' };
  }
  if (type === 'platinum') {
    if ((monthlyIncome || 0) < 1000) return { eligible: false, reason: 'Ingreso mínimo de 1000 USD requerido para Platinum' };
    if (!viseClub) return { eligible: false, reason: 'El cliente no cumple con la suscripción VISE CLUB requerida para Platinum' };
    return { eligible: true };
  }
  if (type === 'black' || type === 'white') {
    if ((monthlyIncome || 0) < 2000) return { eligible: false, reason: 'Ingreso mínimo de 2000 USD requerido para Black/White' };
    if (!viseClub) return { eligible: false, reason: 'El cliente no cumple con la suscripción VISE CLUB requerida para Black/White' };
    // No puede vivir en los paises restringidos
    if (restrictedCountries.map(c=>c.toLowerCase()).includes((country||'').toLowerCase())) {
      return { eligible: false, reason: `Clientes residentes en ${restrictedCountries.join(', ')} no pueden solicitar tarjeta ${cardType}` };
    }
    return { eligible: true };
  }
  return { eligible: false, reason: 'Tipo de tarjeta inválido' };
}

// POST /client
app.post('/client', (req, res) => {
  const { name, country, monthlyIncome, viseClub, cardType } = req.body;
  if (!name || !country || typeof monthlyIncome === 'undefined' || typeof viseClub === 'undefined' || !cardType) {
    return res.status(400).json({ status: 'Rejected', error: 'Faltan campos requeridos: name, country, monthlyIncome, viseClub, cardType' });
  }

  const check = checkEligibility({ monthlyIncome, viseClub, cardType, country });
  if (!check.eligible) {
    return res.status(400).json({ status: 'Rejected', error: check.reason });
  }

  const client = {
    clientId: nextClientId++,
    name,
    country,
    monthlyIncome,
    viseClub,
    cardType
  };
  clients.push(client);

  return res.json({
    clientId: client.clientId,
    name: client.name,
    cardType: client.cardType,
    status: 'Registered',
    message: `Cliente apto para tarjeta ${client.cardType}`
  });
});

// Helper: calcular descuento (reglas según pdf). 
// Decisión de implementación: si aplican varios beneficios, tomamos **el mayor porcentaje** (no sumarlos).
function calculateDiscount(client, purchase) {
  const amount = purchase.amount;
  const purchaseCountry = purchase.purchaseCountry;
  const purchaseDate = new Date(purchase.purchaseDate);
  // usamos getUTCDay para evitar dependencias de zona horaria local
  const day = purchaseDate.getUTCDay(); // 0 Domingo ... 6 Sabado
  const card = (client.cardType || '').toLowerCase();

  const discounts = [];

  const abroad = (purchaseCountry || '').toLowerCase() !== (client.country || '').toLowerCase();

  if (card === 'gold') {
    if ([1,2,3].includes(day) && amount > 100) discounts.push(15);
  }
  if (card === 'platinum') {
    if ([1,2,3].includes(day) && amount > 100) discounts.push(20);
    if (day === 6 && amount > 200) discounts.push(30); // sábado
    if (abroad) discounts.push(5);
  }
  if (card === 'black') {
    if ([1,2,3].includes(day) && amount > 100) discounts.push(25);
    if (day === 6 && amount > 200) discounts.push(35);
    if (abroad) discounts.push(5);
  }
  if (card === 'white') {
    if ([1,2,3,4,5].includes(day) && amount > 100) discounts.push(25); // lunes a viernes
    if ([6,0].includes(day) && amount > 200) discounts.push(35); // sabado/domingo
    if (abroad) discounts.push(5);
  }

  const maxDisc = discounts.length ? Math.max(...discounts) : 0;
  return maxDisc;
}

// POST /purchase
app.post('/purchase', (req, res) => {
  const { clientId, amount, currency, purchaseDate, purchaseCountry } = req.body;
  if (typeof clientId === 'undefined' || typeof amount === 'undefined' || !currency || !purchaseDate || !purchaseCountry) {
    return res.status(400).json({ status: 'Rejected', error: 'Faltan campos requeridos: clientId, amount, currency, purchaseDate, purchaseCountry' });
  }

  const client = clients.find(c => c.clientId === clientId);
  if (!client) return res.status(404).json({ status: 'Rejected', error: 'Cliente no registrado' });

  // Reglas extra: si el cliente tiene Black/White y la compra se origina en país restringido -> rechazar (según ejemplo del enunciado).
  if (['black','white'].includes((client.cardType||'').toLowerCase())) {
    if (restrictedCountries.map(c=>c.toLowerCase()).includes((purchaseCountry||'').toLowerCase())) {
      return res.status(403).json({ status: 'Rejected', error: `El cliente con tarjeta ${client.cardType} no puede realizar compras desde ${purchaseCountry}` });
    }
  }

  const discountPercent = calculateDiscount(client, { amount, purchaseCountry, purchaseDate });
  const discountApplied = Math.round((amount * discountPercent / 100) * 100) / 100;
  const finalAmount = Math.round((amount - discountApplied) * 100) / 100;

  if (discountPercent > 0) {
    return res.json({
      status: 'Approved',
      purchase: {
        clientId,
        originalAmount: amount,
        discountApplied,
        finalAmount,
        benefit: `Descuento ${discountPercent}%`
      }
    });
  } else {
    return res.json({
      status: 'Approved',
      purchase: {
        clientId,
        originalAmount: amount,
        discountApplied: 0,
        finalAmount: finalAmount,
        benefit: 'Sin beneficio aplicable'
      }
    });
  }
});

// Endpoint utilitario para listar clientes (solo para pruebas)
app.get('/clients', (req, res) => {
  res.json(clients);
});

app.listen(PORT, () => console.log(`VISE API corriendo en http://localhost:${PORT}`));
