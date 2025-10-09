// ================================
// server.js — Backend proxy seguro
// ================================

import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = 4000;

// ----------------------------------------------------
// 1️⃣ CORS: permite peticiones desde tu frontend
// ----------------------------------------------------
app.use(cors({
  origin: ["http://localhost:5500", "http://127.0.0.1:5500"], // ajusta si usas otro puerto
  methods: ["GET"]
}));

// ----------------------------------------------------
// 2️⃣ Leer las claves del archivo local
// ----------------------------------------------------
function loadKeys() {
  const file = fs.readFileSync("./keys/spApiKey.txt", "utf-8");
  const lines = file.split("\n");
  const keys = {};
  for (const line of lines) {
    const [key, value] = line.split("=");
    if (key && value) keys[key.trim()] = value.trim();
  }
  return keys;
}

const { CLIENT_ID, CLIENT_SECRET } = loadKeys();

// ----------------------------------------------------
// 3️⃣ Endpoint para devolver el token de Spotify
// ----------------------------------------------------
app.get("/spotify-token", async (req, res) => {
  try {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`,
      },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();

    if (data.access_token) {
      res.json({ token: data.access_token });
    } else {
      console.error("Spotify error:", data);
      res.status(500).json({ error: "No se pudo obtener token de Spotify" });
    }
  } catch (error) {
    console.error("Error obteniendo token:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ----------------------------------------------------
// 4️⃣ Arrancar el servidor
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
