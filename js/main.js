document.addEventListener('DOMContentLoaded', () => {
	const results = document.getElementById('results');
	const searchForm = document.getElementById('search-form');
	const inputSearch = document.getElementById('search-input');

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
		await search(engine, input, type);
	});

	// ======================================================
	// FUNCIÓN PRINCIPAL DE BÚSQUEDA
	// ======================================================
	async function search(engine, input, type) {

		// ========================
		// 🎧 MUSICBRAINZ
		// ========================
		if (engine === "musicBrainz") {
			const typeMap = { song: "recording", artist: "artist", album: "release" };
			const endpoint = typeMap[type];
			if (!endpoint) return results.textContent = `Tipo "${type}" no soportado en MusicBrainz.`;

			try {
				const url = `https://musicbrainz.org/ws/2/${endpoint}?query=${encodeURIComponent(
					input
				)}&fmt=json&limit=50&inc=artist-credits+releases+tags+genres+url-rels+area`;

				const response = await fetch(url);
				if (!response.ok) throw new Error("Error al conectar con MusicBrainz.");
				const data = await response.json();

				const items = endpoint === "artist"
					? data.artists
					: endpoint === "release"
						? data.releases
						: endpoint === "recording"
							? data.recordings
							: [];

				items.forEach(i => i.views = "—"); // MusicBrainz no tiene views
				mostrarResultados(items, endpoint);
			} catch (error) {
				results.textContent = `Error en MusicBrainz: ${error.message}`;
			}

			// ========================
			// 📺 YOUTUBE
			// ========================
		} else if (engine === "youtube") {
			const maxResults = 25;

			// ❌ Si el usuario pide "Album", detenemos aquí
			if (type === "album") {
				results.textContent = "YouTube no soporta búsqueda de álbumes (usa Song o Artist).";
				return;
			}

			try {
				const keyResponse = await fetch("/keys/ytApiKey.txt");
				if (!keyResponse.ok) throw new Error("No se pudo leer el archivo ytApiKey.txt");
				const apiKey = (await keyResponse.text()).trim();

				const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=${maxResults}&q=${encodeURIComponent(input)}&key=${apiKey}`;
				const resSearch = await fetch(searchUrl);
				if (!resSearch.ok) throw new Error("Error al conectar con YouTube (search).");
				const dataSearch = await resSearch.json();

				if (!dataSearch.items || dataSearch.items.length === 0) {
					results.textContent = "No se encontraron resultados en YouTube.";
					return;
				}

				const ids = dataSearch.items.map(v => v.id.videoId).join(",");
				const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids}&key=${apiKey}`;
				const resDetails = await fetch(detailsUrl);
				if (!resDetails.ok) throw new Error("Error al obtener detalles de YouTube.");
				const detailsData = await resDetails.json();

				const videos = detailsData.items.map(d => {
					const s = d.snippet;
					const stats = d.statistics || {};
					return {
						title: s.title || "—",
						disambiguation: "—",
						"artist-name": s.channelTitle || "—",
						country: "—",
						comment: s.description || "—",
						"artist-credit": s.channelTitle || "—",
						"first-release-date": s.publishedAt || "—",
						length: d.contentDetails ? parseYouTubeDuration(d.contentDetails.duration) : "—",
						genres: "—",
						tags: Array.isArray(s.tags) ? s.tags.join(", ") : "—",
						views: stats.viewCount ? parseInt(stats.viewCount).toLocaleString("es-ES") : "—",
						type: inferYouTubeType(d, type),
						relations: [{ url: { resource: `https://www.youtube.com/watch?v=${d.id}` }, type: "YouTube" }]
					};
				});

				mostrarResultados(videos, `youtube-${type}`);
			} catch (error) {
				results.textContent = `Error en YouTube: ${error.message}`;
			}

			// ========================
			// 🌩️ SOUNDCLOUD y 🎵 SPOTIFY
			// (por implementar)
			// ========================
		} else {
			results.textContent = `Engine "${engine}" no implementado aún.`;
		}
	}

	// ======================================================
	// FUNCIONES AUXILIARES
	// ======================================================
	function parseYouTubeDuration(duration) {
		// Si el valor está vacío o no es string, devolvemos guion
		if (!duration || typeof duration !== "string") return "—";

		// Aseguramos formato ISO 8601
		const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
		if (!match) return "—";

		// Convertimos a enteros, asegurando valores numéricos válidos
		const hours = parseInt(match[1] || "0", 10);
		const minutes = parseInt(match[2] || "0", 10);
		const seconds = parseInt(match[3] || "0", 10);

		// Si todo es 0 → sin duración válida
		if (hours === 0 && minutes === 0 && seconds === 0) return "—";

		// Formatear resultado legible
		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		} else {
			return `${minutes}:${String(seconds).padStart(2, "0")}`;
		}
	}



	function inferYouTubeType(video, queryType) {
		const title = video.snippet.title.toLowerCase();
		const desc = video.snippet.description.toLowerCase();
		const tags = (video.snippet.tags || []).map(t => t.toLowerCase()).join(" ");
		const channel = video.snippet.channelTitle.toLowerCase();

		if (channel.includes(" - topic")) return "Official Album Track";
		if (queryType === "album" || title.includes("full album") || desc.includes("full album")) return "Album";
		if (queryType === "artist" || channel.includes("official")) return "Artist Channel";
		if (title.includes("official video")) return "Single";
		return "Video";
	}

	function msToMinSec(ms) {
		if (typeof ms !== "number" || Number.isNaN(ms)) return "—";
		const mins = Math.floor(ms / 60000);
		const secs = Math.floor((ms % 60000) / 1000);
		return `${mins}:${String(secs).padStart(2, "0")}`;
	}

	// ======================================================
	// ROUTER UNIFICADO
	// ======================================================
	function mostrarResultados(items, sourceType) {
		results.innerHTML = "";

		if (!items || items.length === 0) {
			results.textContent = "No se encontraron resultados.";
			return;
		}

		// Songs
		if (sourceType === "recording" || sourceType.endsWith("song")) {
			mostrarSongs(items);
		}
		// Albums (solo MusicBrainz, no YouTube)
		else if (sourceType === "release" || (sourceType.endsWith("album") && !sourceType.startsWith("youtube"))) {
			mostrarAlbums(items);
		}
		// Artists
		else if (sourceType === "artist" || sourceType.endsWith("artist")) {
			mostrarArtists(items);
		}
		else {
			results.textContent = "Tipo de resultado desconocido.";
		}
	}


	// ======================================================
	// VISTAS SEPARADAS
	// ======================================================


	function mostrarSongs(items) {
		const headers = ["title", "artist-credit", "first-release-date", "length", "genres", "tags", "views", "type", "relations"];
		const table = crearTabla(headers);

		items.slice(0, 50).forEach(item => {
			// 👇 length seguro para ambos mundos
			const lengthDisplay =
				typeof item.length === "number"
					? msToMinSec(item.length)                  // MusicBrainz (ms)
					: (typeof item.length === "string" && item.length.trim() !== "" ? item.length : "—"); // YouTube (string)

			const values = [
				item.title || item.name || "—",
				(Array.isArray(item["artist-credit"])
					? item["artist-credit"].map(a => a?.name || a?.artist?.name).filter(Boolean).join(", ")
					: item["artist-credit"]) || item["artist-name"] || "—",
				item["first-release-date"] || item.releases?.[0]?.date || "—",
				lengthDisplay, // 👈 aquí usamos la variable segura
				(Array.isArray(item.genres) ? item.genres.map(g => (typeof g === "string" ? g : g?.name)).filter(Boolean).join(", ") : (item.genres || "—")),
				(Array.isArray(item.tags) ? item.tags.map(t => (typeof t === "string" ? t : t?.name)).filter(Boolean).join(", ") : (item.tags || "—")),
				item.views || "—",
				item.type || "Song",
				getRelationsHTML(item)
			];

			const row = document.createElement("tr");
			row.append(...values.map(v => crearCelda(v)));
			table.appendChild(row);
		});

		results.appendChild(table);
	}


	function mostrarAlbums(items) {
		const headers = [
			"title",
			"artist-credit",
			"country",
			"date",
			"genres",
			"tags",
			"views",
			"type",
			"relations"
		];

		const table = crearTabla(headers);

		items.slice(0, 50).forEach(item => {
			const row = document.createElement("tr");

			// artist-credit: array (MB) o string (YouTube/otros)
			const artistCredit =
				(Array.isArray(item["artist-credit"])
					? item["artist-credit"]
						.map(a => a?.name || a?.artist?.name)
						.filter(Boolean)
						.join(", ")
					: item["artist-credit"]) || "—";

			const country = item.country || item.area?.name || "—";
			const date = item.date || item["first-release-date"] || "—";

			// genres: array de objetos/strings o string simple
			const genres =
				(Array.isArray(item.genres)
					? item.genres
						.map(g => (typeof g === "string" ? g : g?.name))
						.filter(Boolean)
						.join(", ")
					: (typeof item.genres === "string" ? item.genres : null)) || "—";

			// tags: array de objetos/strings o string simple
			const tags =
				(Array.isArray(item.tags)
					? item.tags
						.map(t => (typeof t === "string" ? t : t?.name))
						.filter(Boolean)
						.join(", ")
					: (typeof item.tags === "string" ? item.tags : null)) || "—";

			const views = item.views || "—";

			// type: combina primary + secondary types cuando hay release-group
			let typeValue = "Album";
			if (item["release-group"]) {
				const rg = item["release-group"];
				const primary = rg["primary-type"] || rg["primaryType"] || "";
				const secondaryArr = rg["secondary-types"] || rg["secondaryTypes"] || [];
				const secondary = Array.isArray(secondaryArr) ? secondaryArr.join(" + ") : "";
				const parts = [primary, secondary].filter(Boolean);
				typeValue = parts.length ? parts.join(" + ") : (item.type || "Album");
			} else {
				typeValue = item.type || "Album";
			}

			const values = [
				item.title || "—",
				artistCredit,
				country,
				date,
				genres,
				tags,
				views,
				typeValue,
				getRelationsHTML(item)
			];

			row.append(...values.map(v => crearCelda(v)));
			table.appendChild(row);
		});

		results.appendChild(table);
	}


	function mostrarArtists(items) {
		const headers = ["name", "sort-name", "gender", "area", "begin-date", "end-date", "views", "type", "relations"];
		const table = crearTabla(headers);
		items.slice(0, 50).forEach(item => {
			const values = [
				item.name || "—",
				item["sort-name"] || "—",
				item.gender || "—",
				item.area?.name || "—",
				item["life-span"]?.begin || "—",
				item["life-span"]?.end || "—",
				item.views || "—",
				item.type || "Artist",
				getRelationsHTML(item)
			];
			const row = document.createElement("tr");
			row.append(...values.map(v => crearCelda(v)));
			table.appendChild(row);
		});
		results.appendChild(table);
	}

	// ======================================================
	// HERRAMIENTAS DE TABLAS
	// ======================================================
	function crearTabla(headers) {
		const table = document.createElement("table");
		table.style.width = "100%";
		table.style.borderCollapse = "collapse";
		table.style.marginTop = "1em";
		const headerRow = document.createElement("tr");
		headers.forEach(text => {
			const th = document.createElement("th");
			th.textContent = text;
			th.style.borderBottom = "2px solid #000";
			th.style.padding = "8px";
			th.style.textAlign = "left";
			th.style.fontWeight = "bold";
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);
		return table;
	}

	function crearCelda(val) {
		const td = document.createElement("td");
		td.innerHTML = val || "—";
		td.style.padding = "6px 8px";
		td.style.borderBottom = "1px solid #ddd";
		td.style.verticalAlign = "top";
		td.style.whiteSpace = "pre-wrap";
		return td;
	}

	function getRelationsHTML(item) {
		if (!item.relations || item.relations.length === 0) return "—";
		return item.relations
			.filter(r => r.url && r.url.resource)
			.slice(0, 3)
			.map(r => `<a href="${r.url.resource}" target="_blank" rel="noopener">${r.type || "Link"}</a>`)
			.join(", ");
	}
});
