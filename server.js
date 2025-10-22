// ================================
// server.js — Backend proxy seguro (para Render)
// ================================

import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000; // Render asigna el puerto automáticamente

// ----------------------------------------------------
// 1️⃣ CORS: permite peticiones desde tu frontend
// ----------------------------------------------------
app.use(cors({
  origin: '*', // puedes poner tu dominio frontend si quieres restringirlo
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
// 🔹 Endpoint limpio para obtener datos de un artista (solo followers)
// ----------------------------------------------------
app.get("/spotify-artist/:id", async (req, res) => {
  const artistId = req.params.id;
  if (!artistId) return res.status(400).json({ error: "Falta ID de artista" });

  try {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`,
      },
      body: "grant_type=client_credentials",
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) return res.status(500).json({ error: "No se pudo obtener token" });

    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const artistData = await artistRes.json();

    res.json({
      id: artistId,
      name: artistData.name,
      followers: artistData.followers?.total || 0,
      image: artistData.images?.[0]?.url || "",
      url: artistData.external_urls?.spotify || "",
    });

  } catch (error) {
    console.error("❌ Error al obtener artista Spotify:", error);
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
    res.json(data);
  } catch (err) {
    console.error("Error en proxy Odesli:", err);
    res.status(500).json({ error: "Error al conectar con Odesli" });
  }
});

// ----------------------------------------------------
// 🔹 Proxy para obtener vistas de un video YouTube
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

// ----------------------------------------------------
// 🔹 Búsqueda en YouTube
// ----------------------------------------------------
app.get("/youtube-search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Falta parámetro q" });

  try {
    const file = fs.readFileSync("./keys/ytApiKey.txt", "utf-8");
    const YOUTUBE_API_KEY = file.split("=")[1].trim();

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const items = searchData.items || [];
    if (!items.length) {
      return res.json({ items: [] });
    }

    const videoIds = items.map(item => item.id.videoId).join(",");
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    const unified = detailsData.items.map(video => {
      const snippet = video.snippet || {};
      const stats = video.statistics || {};
      const details = video.contentDetails || {};

      return {
        videoId: video.id,
        title: snippet.title,
        description: snippet.description,
        channelTitle: snippet.channelTitle,
        publishedAt: snippet.publishedAt,
        thumbnails: snippet.thumbnails,
        duration: details.duration || null,
        views: stats.viewCount || 0,
        likes: stats.likeCount || 0,
      };
    });

    res.json({ items: unified });

  } catch (error) {
    console.error("❌ Error al buscar en YouTube:", error);
    res.status(500).json({ error: "Error interno al buscar en YouTube" });
  }
});


// ----------------------------------------------------
// 3️⃣ Servir frontend (HTML, CSS, JS) desde /public
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// Si ninguna ruta coincide (útil para SPAs o raíz "/")
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ----------------------------------------------------
// 5️⃣ Arrancar servidor (sin HTTPS manual)
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
