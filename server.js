// ================================
// server.js — Backend proxy seguro
// ================================

import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cors from "cors";
import https from 'https';

const app = express();
const PORT = 4000;

// ----------------------------------------------------
// 1️⃣ CORS: permite peticiones desde tu frontend
// ----------------------------------------------------
app.use(cors({
  origin: ['https://127.0.0.1:5500', 'https://localhost:5500'],
  credentials: true
}));

// ----------------------------------------------------
// 2️⃣ Leer claves del archivo local
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
// 🔹 Proxy para Odesli (song.link)
// ----------------------------------------------------
app.get("/odesli", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Falta parámetro url" });

  try {
    const response = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data); // devolvemos el JSON al frontend
  } catch (err) {
    console.error("Error en proxy Odesli:", err);
    res.status(500).json({ error: "Error al conectar con Odesli" });
  }
});



// ----------------------------------------------------
// 🔹 Proxy para obtener vistas de un video YouTube (por ID)
// ----------------------------------------------------
app.get("/youtube-stats/:id", async (req, res) => {
  const videoId = req.params.id;
  if (!videoId) return res.status(400).json({ error: "Falta videoId" });

  try {
    const file = fs.readFileSync("./keys/ytApiKey.txt", "utf-8");
    const YOUTUBE_API_KEY = file.split("=")[1].trim();

    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();

    const stats = statsData.items?.[0]?.statistics || {};
    res.json({
      videoId,
      views: stats.viewCount || 0,
      likes: stats.likeCount || 0,
    });
  } catch (error) {
    console.error("Error al consultar YouTube API:", error);
    res.status(500).json({ error: "Error en servidor de YouTube" });
  }
});





const options = {
  key: fs.readFileSync('C:/Users/aamacib/Documents/GitHub/MusicLink/certs/127.0.0.1-key.pem'),
  cert: fs.readFileSync('C:/Users/aamacib/Documents/GitHub/MusicLink/certs/127.0.0.1.pem')
};

// ----------------------------------------------------
// 5️⃣ Arrancar el servidor
// ----------------------------------------------------
https.createServer(options, app)
  .listen(4000, () => console.log('Servidor HTTPS corriendo en https://127.0.0.1:5500'));