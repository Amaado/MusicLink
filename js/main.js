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
		if (engine === "spotify") {

			// 1️⃣ Obtener token desde tu backend
			const tokenRes = await fetch("http://localhost:4000/spotify-token");
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

			// 3️⃣ Procesar resultados según tipo
			let items = [];
			if (type === "track") {
				items = data.tracks?.items || [];
			} else if (type === "album") {
				items = data.albums?.items || [];
			}

			if (!items.length) {
				results.textContent = "No se encontraron resultados.";
				return [];
			}

			const unifiedResults = [];

			for (const item of items) {
				if (type === "track") {
					const links = await getOdesliLinks(item.external_urls.spotify);
					unifiedResults.push({
						title: item.name,
						artist: item.artists[0].name,
						album: item.album.name,
						cover: item.album.images[0]?.url,
						links: {
							spotify: links.spotify?.url || null,
							youtube: links.youtube?.url || links.youtubeMusic?.url || null,
							soundcloud: links.soundcloud?.url || null,
						},
					});
				} else if (type === "album") {
					const links = await getOdesliLinks(item.external_urls.spotify);
					unifiedResults.push({
						title: item.name,
						artist: item.artists[0].name,
						album: item.name,
						cover: item.images[0]?.url,
						links: {
							spotify: links.spotify?.url || null,
							youtube: links.youtube?.url || links.youtubeMusic?.url || null,
							soundcloud: links.soundcloud?.url || null,
						},
					});
				}
			}

			return unifiedResults;
		}

		// Otros motores (por ahora no implementados)
		results.textContent = `Engine "${engine}" no implementado aún.`;
		return [];
	}

	// ======================================================
	// CONSULTA ODESLI
	// ======================================================
	async function getOdesliLinks(url) {
		try {
			const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`);
			const data = await res.json();
			return data.linksByPlatform || {};
		} catch (err) {
			console.error("Error en Odesli:", err);
			return {};
		}
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
					<div style="margin-top:6px;">
						${song.links.spotify ? `<a href="${song.links.spotify}" target="_blank">🎧 Spotify</a>` : ""}
						${song.links.youtube ? `<a href="${song.links.youtube}" target="_blank">▶️ YouTube</a>` : ""}
						${song.links.soundcloud ? `<a href="${song.links.soundcloud}" target="_blank">☁️ SoundCloud</a>` : ""}
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
