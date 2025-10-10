document.addEventListener('DOMContentLoaded', () => {
	const results = document.getElementById('results');
	const searchForm = document.getElementById('search-form');
	const inputSearch = document.getElementById('search-input');

	// ======================================================
	// CONFIGURACIÓN DE MOTORES
	// ======================================================
	const ENGINES = {
		spotify: {
			searchUrl: "https://api.spotify.com/v1/search",
		},
	};

	// ======================================================
	// EVENTO DEL FORMULARIO
	// ======================================================
	searchForm.addEventListener('submit', async (e) => {
		e.preventDefault();

		const engine = document.getElementById("engine").value.trim();
		const type = document.getElementById("searchType").value.trim();
		const input = inputSearch.value.trim();

		results.innerHTML = "";

		if (!input) return results.textContent = "Por favor, escribe algo";
		if (!type) return results.textContent = "Por favor, selecciona type";
		if (!engine) return results.textContent = "Por favor, selecciona engine";

		results.textContent = "Buscando...";

		try {
			const data = await search(engine, input, type);
			await renderResults(data);
		} catch (err) {
			console.error("❌ Error global:", err);
			results.textContent = "Error al buscar resultados.";
		}
	});

	// ======================================================
	// FUNCIÓN PRINCIPAL DE BÚSQUEDA
	// ======================================================
	async function search(engine, input, type) {
		if (engine !== "spotify") {
			results.textContent = `Engine "${engine}" no implementado aún.`;
			return [];
		}

		// 1️⃣ Obtener token desde backend
		const tokenRes = await fetch("https://127.0.0.1:4000/spotify-token");
		const { token } = await tokenRes.json();
		if (!token) {
			console.error("❌ No se recibió token desde el backend");
			results.textContent = "Error: el servidor no devolvió un token válido.";
			return [];
		}

		// 2️⃣ Buscar en Spotify
		const searchUrl = `${ENGINES.spotify.searchUrl}?q=${encodeURIComponent(input)}&type=${type}&limit=10`;
		const searchRes = await fetch(searchUrl, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const data = await searchRes.json();
		console.log("🔎 Respuesta Spotify:", data);

		let items = [];
		if (type === "track") items = data.tracks?.items || [];
		else if (type === "album") items = data.albums?.items || [];

		if (!items.length) {
			results.textContent = "No se encontraron resultados.";
			return [];
		}

		// 🚀 Paralelizar procesado
		const promises = items.map(async (item) => {
			const links = await getOdesliLinks(item.external_urls.spotify);
			const youtubeUrl = links.youtube?.url || links.youtubeMusic?.url || null;
			let ytData = { views: 0, videoId: null };

			if (youtubeUrl) {
				const videoId = youtubeUrl.split("v=")[1]?.split("&")[0];
				if (videoId) {
					const ytRes = await fetch(`https://127.0.0.1:4000/youtube-stats/${videoId}`);
					ytData = await ytRes.json();
				}
			}

			if (item.type === "track") {
				console.log(item.name + " - Arrived");
				return {
					title: item.name,
					artist: item.artists?.[0]?.name || "Desconocido",
					album: item.album?.name || "Sin álbum",
					cover: item.album?.images?.[0]?.url || "",
					isrc: item.external_ids?.isrc || null,
					typeLabel: "🎵 Canción única",
					duration: item.duration_ms || "?",
					views: Number(ytData.views) || 0,
					links: {
						spotify: links.spotify?.url || null,
						youtubeMusic: links.youtubeMusic?.url || null,
						youtube: links.youtube?.url || null,
						appleMusic: links.appleMusic?.url || null,
						itunes: links.itunes?.url || null,
						deezer: links.deezer?.url || null,
						soundcloud: links.soundcloud?.url || null,
						tidal: links.tidal?.url || null,
						amazonMusic: links.amazonMusic?.url || null,
						pandora: links.pandora?.url || null,
						bandcamp: links.bandcamp?.url || null,
						napster: links.napster?.url || null,
						anghami: links.anghami?.url || null,
						boomplay: links.boomplay?.url || null,
						audiomack: links.audiomack?.url || null,
						yandex: links.yandex?.url || null,
					},

				};
			} else if (item.type === "album") {
				return {
					title: item.name,
					artist: item.artists?.[0]?.name || "Desconocido",
					album: item.name,
					cover: item.images?.[0]?.url || "",
					isrc: item.external_ids?.isrc || null,
					typeLabel: "💿 Álbum",
					duration: null,
					views: Number(ytData.views) || 0,
					links: {
						spotify: links.spotify?.url || null,
						youtubeMusic: links.youtubeMusic?.url || null,
						youtube: links.youtube?.url || null,
						appleMusic: links.appleMusic?.url || null,
						itunes: links.itunes?.url || null,
						deezer: links.deezer?.url || null,
						soundcloud: links.soundcloud?.url || null,
						tidal: links.tidal?.url || null,
						amazonMusic: links.amazonMusic?.url || null,
						pandora: links.pandora?.url || null,
						bandcamp: links.bandcamp?.url || null,
						napster: links.napster?.url || null,
						anghami: links.anghami?.url || null,
						boomplay: links.boomplay?.url || null,
						audiomack: links.audiomack?.url || null,
						yandex: links.yandex?.url || null,
					},
				};
			}
		});

		const unifiedResults = await Promise.all(promises);

		// 🔁 Eliminar duplicados
		const uniqueResults = unifiedResults.filter(
			(song, index, self) =>
				index === self.findIndex(
					(t) => t.title === song.title && t.artist === song.artist
				)
		);

		return uniqueResults;
	}


	// ======================================================
	// CONSULTA ODESLI
	// ======================================================
	async function getOdesliLinks(url) {
		if (!url || !(url.startsWith("https://open.spotify.com/track/") || url.startsWith("https://open.spotify.com/album/"))) {
			console.warn("⚠️ URL de Spotify inválida para Odesli:", url);
			return {};
		}
		try {
			const res = await fetch(`https://127.0.0.1:4000/odesli?url=${encodeURIComponent(url)}`);
			if (!res.ok) {
				console.warn("⚠️ Odesli devolvió error:", res.status);
				return {};
			}
			const data = await res.json();
			return data.linksByPlatform || {};
		} catch (err) {
			console.error("Error en Odesli:", err);
			return {};
		}
	}


	function formatDurationSpoty(ms) {
		if (!ms) return "";
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	function formatNumber(num) {
		if (num === null || num === undefined) return "?";

		const n = Number(num);
		if (isNaN(n)) return "?";

		// Forzar separador de miles con estilo español
		return n.toLocaleString("es-ES", {
			useGrouping: true,
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		});
	}



	// ======================================================
	// RENDERIZAR RESULTADOS
	// ======================================================
	async function renderResults(songs) {
		results.innerHTML = "";

		if (!songs.length) {
			results.textContent = "No se encontraron resultados.";
			return;
		}

		songs.forEach((song) => {
			const card = document.createElement("div");
			card.classList.add("song-card");

			card.innerHTML = `
			<img src="${song.cover}" alt="cover" width="80" height="80" style="border-radius:8px; margin-right:10px;">
			<div style="display:inline-block; vertical-align:top;">
				<strong>${song.title}</strong><br>
				<span>${song.artist}</span><br>
				<span style="color:#555;">${song.typeLabel}</span><br>
				${song.duration ? `<span style="color:#777;">Duración: ${formatDurationSpoty(song.duration)}</span><br>` : ""}
				${song.views ? `<span style="color:#999;">YouTube views: ${formatNumber(song.views)}</span><br>` : ""}
					${song.links.spotify ? `<a href="${song.links.spotify}" target="_blank">🎧 Spotify</a> ` : ""}
					${song.links.youtubeMusic ? `<a href="${song.links.youtubeMusic}" target="_blank">🎵 YouTube Music</a> ` : ""}
					${song.links.youtube ? `<a href="${song.links.youtube}" target="_blank">▶️ YouTube</a> ` : ""}
					${song.links.appleMusic ? `<a href="${song.links.appleMusic}" target="_blank">🍎 Apple Music</a> ` : ""}
					${song.links.itunes ? `<a href="${song.links.itunes}" target="_blank">💿 iTunes</a> ` : ""}
					${song.links.deezer ? `<a href="${song.links.deezer}" target="_blank">🎶 Deezer</a> ` : ""}
					${song.links.soundcloud ? `<a href="${song.links.soundcloud}" target="_blank">☁️ SoundCloud</a> ` : ""}
					${song.links.tidal ? `<a href="${song.links.tidal}" target="_blank">🌊 Tidal</a> ` : ""}
					${song.links.amazonMusic ? `<a href="${song.links.amazonMusic}" target="_blank">🛒 Amazon Music</a> ` : ""}
					${song.links.pandora ? `<a href="${song.links.pandora}" target="_blank">📻 Pandora</a> ` : ""}
					${song.links.bandcamp ? `<a href="${song.links.bandcamp}" target="_blank">🎸 Bandcamp</a> ` : ""}
					${song.links.napster ? `<a href="${song.links.napster}" target="_blank">🎧 Napster</a> ` : ""}
					${song.links.anghami ? `<a href="${song.links.anghami}" target="_blank">🎼 Anghami</a> ` : ""}
					${song.links.boomplay ? `<a href="${song.links.boomplay}" target="_blank">🔥 Boomplay</a> ` : ""}
					${song.links.audiomack ? `<a href="${song.links.audiomack}" target="_blank">🎵 Audiomack</a> ` : ""}
					${song.links.yandex ? `<a href="${song.links.yandex}" target="_blank">🇷🇺 Yandex</a> ` : ""}
				</div>
			</div>
		`;

			card.style.display = "flex";
			card.style.alignItems = "center";
			card.style.marginBottom = "12px";
			card.style.padding = "8px";
			card.style.border = "1px solid #ddd";
			card.style.borderRadius = "10px";
			card.style.background = "#fafafa";

			results.appendChild(card);
		});
	}
});
