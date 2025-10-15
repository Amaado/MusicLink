document.addEventListener('DOMContentLoaded', () => {
	const results = document.getElementById('results');
	const searchForm = document.getElementById('search-form');
	const inputSearch = document.getElementById('search-input');
	const engineComboBox = document.getElementById("engine");
	const typeComboBox = document.getElementById("searchType");

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

		const engine = engineComboBox.value.trim();
		const type = typeComboBox.value.trim();
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
	// PREVENT YOUTUBE ALBUM
	// ======================================================


	engineComboBox.addEventListener("change", () => {
		const selectedEngine = engineComboBox.value;
		const albumOption = typeComboBox.querySelector('option[value="album"]');

		if (selectedEngine === "youtube") {
			// 🔒 Desactivar opción "Album"
			albumOption.disabled = true;

			// Si estaba seleccionada, cambiar automáticamente a "Song"
			if (typeComboBox.value === "album") {
				typeComboBox.value = "track";
			}
		} else {
			// 🔓 Reactivar opción "Album"
			albumOption.disabled = false;
		}
	});

	// ======================================================
	// FUNCIÓN PRINCIPAL DE BÚSQUEDA
	// ======================================================
	async function search(engine, input, type) {
	if (engine === "spotify") {
		return await searchSpotify(input, type);
	}

	if (engine === "youtube") {
		return await searchYouTube(input, type);
	}

	results.textContent = `Engine "${engine}" no implementado aún.`;
	return [];
}

	// 🟢 === FUNCIÓN ORIGINAL AISLADA (sin cambios de lógica) ===
	async function searchSpotify(input, type) {
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
		else if (type === "artist") items = data.artists?.items || [];

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
					artist: item.artists?.map(a => ({
						name: a.name,
						url: a.external_urls?.spotify || null
					})) || [],
					album: item.album?.name || "Sin álbum",
					cover: item.album?.images?.[0]?.url || "",
					isrc: item.external_ids?.isrc || null,
					typeLabel: "track",
					duration: formatDurationSpoty(item.duration_ms) || "?",
					views: Number(ytData.views) || 0,
					links: buildLinks(links),
				};
			} else if (item.type === "album") {
				return {
					title: item.name,
					artist: item.artists?.map(a => ({
						name: a.name,
						url: a.external_urls?.spotify || null
					})) || [],
					album: item.name,
					cover: item.images?.[0]?.url || "",
					isrc: item.external_ids?.isrc || null,
					typeLabel: "album",
					duration: null,
					views: Number(ytData.views) || 0,
					links: buildLinks(links),
				};
			}// 🔹 Si es un artista
			else if (item.type === "artist") {
				try {
					const artistId = item.id;
					const spotifyUrl = item.external_urls.spotify;

					// 🔹 Llamar al backend para obtener datos del artista
					const statsRes = await fetch(`https://127.0.0.1:4000/spotify-artist/${artistId}`);
					const stats = await statsRes.json();

					return {
						title: stats.name || item.name,
						artist: null,
						album: null,
						cover: stats.image || item.images?.[0]?.url || "",
						isrc: null,
						typeLabel: "artist",
						duration: null,
						followers: stats.followers || 0,
						links: { spotify: spotifyUrl },
					};
				} catch (err) {
					console.error("Error procesando artista:", err);
					return null;
				}
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

	async function searchYouTube(input, type) {
		try {
			// 1️⃣ Llamar al backend local (ya devuelve todo: snippet + stats + duration)
			const res = await fetch(`https://127.0.0.1:4000/youtube-search?q=${encodeURIComponent(input)}`);
			const data = await res.json();

			console.log("🔎 Respuesta YouTube:", data);

			const items = data.items || [];
			if (!items.length) {
				results.textContent = "No se encontraron resultados en YouTube.";
				return [];
			}

			// 2️⃣ Procesar resultados con Odesli
			const promises = items.map(async (item) => {
				const videoId = item.videoId;
				const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

				// 🌐 Obtener enlaces con Odesli
				const links = await getOdesliLinks(youtubeUrl);

				return {
					title: item.title,
					artist: item.channelTitle || "Canal desconocido",
					album: "—",
					cover: item.thumbnails?.medium?.url || "",
					isrc: null,
					typeLabel: "track",
					duration: formatYouTubeDuration(item.duration),
					views: Number(item.views) || 0,
					links: buildLinks(links),
				};
			});

			const unifiedResults = await Promise.all(promises);

			// 🔁 Eliminar duplicados (mismo criterio que Spotify)
			const uniqueResults = unifiedResults.filter(
				(song, index, self) =>
					index === self.findIndex(
						(t) => t.title === song.title && t.artist === song.artist
					)
			);

			return uniqueResults;

		} catch (error) {
			console.error("❌ Error al buscar en YouTube:", error);
			results.textContent = "Error al conectar con el servidor de YouTube.";
			return [];
		}
	}


	function buildLinks(links) {
		return {
			spotify: links.spotify?.url || null,
			youtubeMusic: links.youtubeMusic?.url || null,
			youtube: links.youtube?.url || null,
			appleMusic: links.appleMusic?.url || null,
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
		};
	}


	// ======================================================
	// CONSULTA ODESLI
	// ======================================================
	async function getOdesliLinks(url) {
		/*if (!url || !(url.startsWith("https://open.spotify.com/track/") || url.startsWith("https://open.spotify.com/album/"))) {
			console.warn("⚠️ URL de Spotify inválida para Odesli:", url);
			return {};
		}*/
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

	function formatYouTubeDuration(duration) {
		if (!duration || typeof duration !== "string") return "—";
		const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return "—";

		const hours = parseInt(match[1] || 0);
		const minutes = parseInt(match[2] || 0);
		const seconds = parseInt(match[3] || 0);

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;
		} else {
			return `${minutes}:${seconds.toString().padStart(2, "0")}`;
		}
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
	// DISKS PERSPECTIVE
	// ======================================================
function initDisksPerspectiveListener() {
	const cards = document.querySelectorAll('.song-card');

	cards.forEach(card => {
		const scene = card.querySelector('.song-cover-container');
		const faceFront = scene?.querySelector('.box__face--front');
		const reflectBlack = card.querySelector('.song-cover-reflect-black');
		const reflect = card.querySelector('.song-cover-reflect');
		const reflection = card.querySelector('.box__face--reflection');
		if (!scene || !reflection) return;

		// 🧱 Inicializa el degradado de arranque
		const initialGradient = `linear-gradient(135deg, transparent -120%, white -100%, transparent -20%)`;
		reflection.style.webkitMaskImage = initialGradient;
		reflection.style.maskImage = initialGradient;

		let targetOffset = -100;
		let currentOffset = -100;
		let animatingMask = false;

		let targetShadowX = 0;
		let targetShadowY = 0;
		let currentShadowX = 0;
		let currentShadowY = 0;
		let animatingShadow = false;
		let currentShadowOpacity = 0;
		let targetShadowOpacity = 0;
		let targetShadowBlur = 0;
		let currentShadowBlur = 0;

		// 🔁 Animación del degradado
		function animateMask() {
			if (!animatingMask) return;
			currentOffset += (targetOffset - currentOffset) * 0.1;
			const start = currentOffset - 20;
			const mid = currentOffset;
			const end = currentOffset + 80;
			const gradient = `linear-gradient(135deg, transparent ${start}%, white ${mid}%, transparent ${end}%)`;
			reflection.style.webkitMaskImage = gradient;
			reflection.style.maskImage = gradient;

			if (Math.abs(targetOffset - currentOffset) > 0.1) {
				requestAnimationFrame(animateMask);
			} else {
				animatingMask = false;
			}
		}

		// 🔁 Animación del box-shadow
		function animateShadow() {
			if (!animatingShadow) return;

			currentShadowX += (targetShadowX - currentShadowX) * 0.12;
			currentShadowY += (targetShadowY - currentShadowY) * 0.12;
			currentShadowOpacity += (targetShadowOpacity - currentShadowOpacity) * 0.12;
			currentShadowBlur += (targetShadowBlur - currentShadowBlur) * 0.12;

			const shadow = `${currentShadowX.toFixed(1)}px ${currentShadowY.toFixed(1)}px ${currentShadowBlur.toFixed(1)}px rgba(0,0,0,${currentShadowOpacity.toFixed(2)})`;
			if (faceFront) faceFront.style.boxShadow = shadow;

			if (
				Math.abs(targetShadowX - currentShadowX) > 0.5 ||
				Math.abs(targetShadowY - currentShadowY) > 0.5 ||
				Math.abs(targetShadowOpacity - currentShadowOpacity) > 0.01 ||
				Math.abs(targetShadowBlur - currentShadowBlur) > 0.5
			) {
				requestAnimationFrame(animateShadow);
			} else {
				animatingShadow = false;
			}
		}



		// 🧭 Movimiento del ratón
		card.addEventListener('mousemove', (e) => {
			faceFront?.classList.add("active");
			reflectBlack?.classList.add("active");
			reflect?.classList.add("active");

			const rect = card.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			// 🎚 Rotación 3D
			const rotateY = ((x / rect.width) - 0.5) * 35;
			const rotateX = ((y / rect.height) - 0.5) * -35;
			scene.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

			// 🎨 Degradado dinámico
			targetOffset = ((x / rect.width) - 0.5) * 200;
			if (!animatingMask) {
				animatingMask = true;
				animateMask();
			}

			// 💡 Sombra dinámica tipo espejo (asimétrica en eje Y + opacidad variable)
			const relX = (x / rect.width - 0.5) * 2; // -1 a 1
			const relY = (y / rect.height - 0.5) * 2; // -1 (arriba) a 1 (abajo)

			const maxX = 50;
			const maxYUp = 12;
			const maxYDown = 20;

			targetShadowX = relX * -maxX;
			targetShadowY = relY < 0 ? -relY * maxYUp : -relY * maxYDown;

			// 🎨 Control de opacidad y blur (más difuso y tenue en zonas altas o extremas)
			const minOpacity = 0.25;
			const maxOpacity = 0.4;
			const minBlur = 10;
			const maxBlur = 25;

			const baseX = relX < 0 ? 0.55 : 0.8; // cambia el 0.6 por el valor que quieras a la izquierda
			const xFactor = baseX - Math.abs(relX);
			//console.log("xFactor: "+xFactor);
			const yFactorOpacity = 1.3 + Math.min(-relY, 0);
			const yFactorBlur = 1.35 + Math.min(-relY, 0);
			const yWeight = Math.max(0, Math.min(1, xFactor));

			const combinedFactorOpacity = xFactor * (1 - yWeight) + yFactorOpacity * yWeight;
			const combinedFactorBlur = xFactor * (1 - yWeight) + yFactorBlur * yWeight;

			// 🔹 Opacidad dinámica
			targetShadowOpacity = combinedFactorOpacity * (maxOpacity - minOpacity) + minOpacity;

			// 🔹 Desenfoque dinámico (sincronizado con la opacidad)
			targetShadowBlur = (1 - combinedFactorBlur) * (maxBlur - minBlur) + minBlur;

			if (!animatingShadow) {
				animatingShadow = true;
				animateShadow();
			}

		});



		// 🚪 Al salir del área
		card.addEventListener('mouseleave', () => {
			faceFront?.classList.remove("active");
			reflectBlack?.classList.remove("active");
			reflect?.classList.remove("active");

			scene.style.transition = "transform 0.5s ease";
			scene.style.transform = 'rotateY(0deg) rotateX(0deg)';

			// 🔙 Reinicia degradado
			targetOffset = -100;
			if (!animatingMask) {
				animatingMask = true;
				animateMask();
			}

			// 🔙 Reinicia sombra al centro (sin sombra direccional)
			targetShadowX = 0;
			targetShadowY = 0;
			targetShadowOpacity = 0;
			targetShadowBlur = 0;
			if (!animatingShadow) {
				animatingShadow = true;
				animateShadow();
			}

			setTimeout(() => {
				scene.style.transition = "";
				faceFront.style.transition = "";
			}, 500);
		});

		// 💡 Limpieza previa de listeners
		card.onmousemove = null;
		card.onmouseleave = null;
	});
}

initDisksPerspectiveListener();


/*
function initDisksPerspective() {
	const cards = document.querySelectorAll('.song-card');

	cards.forEach(card => {
		const scene = card.querySelector('.song-cover-container');
		const faceFront = scene.querySelector('.box__face--front');
		if (!scene) return; // seguridad

		scene.style.transform = `rotateY(90deg) rotateX(0deg)`;

	});
}
initDisksPerspective();*/

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

		if (song.typeLabel === "artist"){
			card.classList.add("artist-card");
		}else{
			card.innerHTML = `
				<div class="song-cover-reflect-wrapper song-cover-reflect-filter">
					<div class="song-cover-reflect-black"></div>
					<img class="song-cover-reflect" src="${song.cover}">
				</div>
				<div class="song-cover-container">
					<div class="box__face box__face--front" style="background-image:url(${song.cover});" alt="cover"></div>
					<div class="box__face--scratches-wrapper"><img class="box__face box__face--scratches" src="../assets/textures/diskTexture${Math.floor(Math.random()*4)+1}.png"></div>
					<div class="box__face box__face--reflection"></div>
					<div class="box__face box__face--right"><img class="texture textureRight" src="../assets/textures/cdRight.png"></div>
					<div class="box__face box__face--left"><img class="texture textureLeft" src="../assets/textures/sub.png"></div>
					<div class="box__face box__face--top"><img class="texture textureTop" src="../assets/textures/cdTop.png"></div>
					<div class="box__face box__face--bottom"><img class="texture textureBottom" src="../assets/textures/cdTopReverse.png"></div>
					<div class="box__face box__faceSub--front"><img class="texture textureSubFront" src="../assets/textures/subBrightRight.png"></div>
					<div class="box__face box__faceSub--right"><img class="texture textureSubRight" src="../assets/textures/subBrightLeft.png"></div>
					<div class="box__face box__faceSub--top"><img class="texture textureSubTop" src="../assets/textures/sub.png"></div>
					<div class="box__face box__faceSub--bottom"><img class="texture textureSubBottom" src="../assets/textures/sub.png"></div>
				</div>
				
				<div class="song-info-container">
					<div class="song-info">
						<strong class="song-title">${song.title}</strong>
						<span class="song-artist">
							${
								Array.isArray(song.artist)
								? song.artist
									.map((a) =>
										a.url
										? `<a href="${a.url}" target="_blank" rel="noopener">${a.name}</a>`
										: a.name
									)
									.join(", ")
								: song.artist
							}
						</span>
						<div class="song-details">
							<div>
								${song.duration ? `<img src="../assets/duration.png">` : ""}
								${song.duration ? `<span class="song-duration">${song.duration}</span>` : ""}
							</div>
							<div>
								${song.views && song.typeLabel !== "👤 Artista"
										? `<img src="../assets/view.png">`: ""}
								${song.views && song.typeLabel !== "👤 Artista"
										? `<span class="song-views">${formatNumber(song.views)}</span>`: ""}
							</div>
						</div>

						${
							song.typeLabel === "👤 Artista" && song.followers
								? `<span class="song-followers">👥 Followers: ${formatNumber(song.followers)}</span>`
								: ""
						}					
					</div>
					<div class="song-links">
							${song.links.spotify ? `<a href="${song.links.spotify}" target="_blank" rel="noopener"><img src="../assets/odesliServices/spotify.png" class="linkIcon"><div class="linkText" class="linkText">Spotify</div></a>` : ""}
							${song.links.youtubeMusic ? `<a href="${song.links.youtubeMusic}" target="_blank" rel="noopener"><img src="../assets/odesliServices/yt-music.png" class="linkIcon"><div class="linkText">YouTube Music</div></a>` : ""}
							${song.links.youtube ? `<a href="${song.links.youtube}" target="_blank" rel="noopener"><img src="../assets/odesliServices/yt.png" class="linkIcon"><div class="linkText">Youtube</div></a>` : ""}
							${song.links.appleMusic ? `<a href="${song.links.appleMusic}" target="_blank" rel="noopener"><img src="../assets/odesliServices/apple.png" class="linkIcon"><div class="linkText">Apple Music</div></a>` : ""}
							${song.links.deezer ? `<a href="${song.links.deezer}" target="_blank" rel="noopener"><img src="../assets/odesliServices/deezer.png" class="linkIcon"><div class="linkText">Deezer</div></a>` : ""}
							${song.links.soundcloud ? `<a href="${song.links.soundcloud}" target="_blank" rel="noopener"><img src="../assets/odesliServices/soundcloud.png" class="linkIcon"><div class="linkText">SoundCloud</div></a>` : ""}
							${song.links.tidal ? `<a href="${song.links.tidal}" target="_blank" rel="noopener"><img src="../assets/odesliServices/tidal.png" class="linkIcon"><div class="linkText">Tidal</div></a>` : ""}
							${song.links.amazonMusic ? `<a href="${song.links.amazonMusic}" target="_blank" rel="noopener"><img src="../assets/odesliServices/amazon.png" class="linkIcon"><div class="linkText">Amazon Music</div></a>` : ""}
							${song.links.pandora ? `<a href="${song.links.pandora}" target="_blank" rel="noopener"><img src="../assets/odesliServices/pandora.png" class="linkIcon"><div class="linkText">Pandora</div></a>` : ""}
							${song.links.bandcamp ? `<a href="${song.links.bandcamp}" target="_blank" rel="noopener"><img src="../assets/odesliServices/bandcamp.png" class="linkIcon"><div class="linkText">Bandcamp</div></a>` : ""}
							${song.links.napster ? `<a href="${song.links.napster}" target="_blank" rel="noopener"><img src="../assets/odesliServices/napster.png" class="linkIcon"><div class="linkText">Napster</div></a>` : ""}
							${song.links.anghami ? `<a href="${song.links.anghami}" target="_blank" rel="noopener"><img src="../assets/odesliServices/anghami.png" class="linkIcon"><div class="linkText">Anghami</div></a>` : ""}
							${song.links.boomplay ? `<a href="${song.links.boomplay}" target="_blank" rel="noopener"><img src="../assets/odesliServices/boomplay.png" class="linkIcon"><div class="linkText">Boomplay</div></a>` : ""}
							${song.links.audiomack ? `<a href="${song.links.audiomack}" target="_blank" rel="noopener"><img src="../assets/odesliServices/audiomack.png" class="linkIcon"><div class="linkText">Audiomack</div></a>` : ""}
							${song.links.yandex ? `<a href="${song.links.yandex}" target="_blank" rel="noopener"><img src="../assets/odesliServices/yandex.png" class="linkIcon"><div class="linkText">Yandex</div></a>` : ""}
					</div>
				</div>
			`;

		}

		results.appendChild(card);
	});
	initDisksPerspectiveListener();
}


});
