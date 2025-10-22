// ================================
// server.js — Backend proxy seguro (para Render)
// ================================

import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cors from "cors";
import compression from "compression";

const app = express();
const PORT = process.env.PORT || 4000; // Render asigna el puerto automáticamente

// ----------------------------------------------------
// 1️⃣ CORS: permite peticiones desde tu frontend
// ----------------------------------------------------
app.use(cors({
  origin: '*', // puedes poner tu dominio frontend si quieres restringirlo
  credentials: true
}));

app.use(
  compression({
    level: 6, // 1–9 (balance entre velocidad y compresión)
    threshold: 1024, // solo comprime archivos >1KB
  })
);

function loadKeys() {
  const keys = {};

  // 🔍 Detectar si estamos en Render (producción)
  const isRender = !!process.env.RENDER;

  if (isRender) {
    // 🌐 PRODUCCIÓN: usar variables de entorno de Render
    keys.CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
    keys.CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
    keys.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    keys.ENV = "render";
  } else {
    // 💻 LOCAL: cargar desde los archivos
    try {
      const spFile = fs.readFileSync("./keys/spApiKey.txt", "utf-8");
      const ytFile = fs.readFileSync("./keys/ytApiKey.txt", "utf-8");

      // Parsear líneas tipo CLIENT_ID=xxxx
      spFile.split("\n").forEach(line => {
        const [key, value] = line.split("=");
        if (key && value) keys[key.trim()] = value.trim();
      });

      const ytMatch = ytFile.match(/=(.+)/);
      if (ytMatch) keys.YOUTUBE_API_KEY = ytMatch[1].trim();

      keys.ENV = "local";
    } catch (err) {
      console.error("⚠️ No se pudieron leer las claves locales:", err.message);
    }
  }

  return keys;
}

const { CLIENT_ID, CLIENT_SECRET, YOUTUBE_API_KEY, ENV } = loadKeys();

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


// ================================
// 3️⃣ Servir archivos estáticos (Frontend)
// ================================

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware de cacheo para assets estáticos
const staticOptions = {
  maxAge: "7d", // cachea por 7 días
  etag: true,
  setHeaders: (res, filePath) => {
    // Fuerza tipos MIME correctos y CORS para assets (útil en 3D)
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
    if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg)$/))
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  },
};

// Servir carpetas con cache habilitada
app.use("/js", express.static(path.join(__dirname, "js"), staticOptions));
app.use("/css", express.static(path.join(__dirname, "css"), staticOptions));
app.use("/assets", express.static(path.join(__dirname, "assets"), staticOptions));

// ⚠️ Nunca sirvas claves públicamente en producción
// app.use("/keys", express.static(path.join(__dirname, "keys"))); 

// Servir carpeta principal con cache (para index.html y otros)
app.use(express.static(path.join(__dirname, "public"), staticOptions));

// ⚠️ ESTA RUTA SIEMPRE AL FINAL ⚠️
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
