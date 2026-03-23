const API_BASE = "https://nhac.seedance-v2-0.workers.dev";

let appData = null;
let player = null;
let isPlayerReady = false;
let currentSongIndex = -1;

const els = {
  sessionSlugInput: document.getElementById("sessionSlugInput"),
  createSessionBtn: document.getElementById("createSessionBtn"),
  openSessionInput: document.getElementById("openSessionInput"),
  openSessionBtn: document.getElementById("openSessionBtn"),
  renameSessionBtn: document.getElementById("renameSessionBtn"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  deleteSessionBtn: document.getElementById("deleteSessionBtn"),

  sessionName: document.getElementById("sessionName"),
  sessionSlug: document.getElementById("sessionSlug"),

  youtubeUrl: document.getElementById("youtubeUrl"),
  addBtn: document.getElementById("addBtn"),

  prevBtn: document.getElementById("prevBtn"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  nextBtn: document.getElementById("nextBtn"),

  songCount: document.getElementById("songCount"),
  songList: document.getElementById("songList"),

  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  nowPlayingMeta: document.getElementById("nowPlayingMeta"),
  playerPlaceholder: document.getElementById("playerPlaceholder"),
  playerRoot: document.getElementById("player"),

  message: document.getElementById("message"),
};

bootstrap();

async function bootstrap() {
  bindEvents();

  const slug = getSessionSlugFromUrl();
  if (slug) {
    await loadSession(slug);
  } else {
    renderEmptyState();
  }
}

function getSessionSlugFromUrl() {
  const url = new URL(window.location.href);
  const slug = url.searchParams.get("s");
  return slug ? sanitizeSlug(slug) : "";
}

function setSessionSlugToUrl(slug) {
  const url = new URL(window.location.href);
  if (slug) {
    url.searchParams.set("s", slug);
  } else {
    url.searchParams.delete("s");
  }
  window.history.replaceState({}, "", url.toString());
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data?.detail
      ? `${data?.error || "Request failed"}: ${data.detail}`
      : (data?.error || "Request failed");
    throw new Error(msg);
  }

  return data;
}

function showMessage(text, type = "") {
  if (!els.message) return;

  els.message.textContent = text || "";
  els.message.className = "message";
  if (type) {
    els.message.classList.add(type);
  }

  clearTimeout(showMessage._timer);
  if (text) {
    showMessage._timer = setTimeout(() => {
      els.message.textContent = "";
      els.message.className = "message";
    }, 2600);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char];
  });
}

function sanitizeSlug(input) {
  const slug = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug;
}

function getSongs() {
  return Array.isArray(appData?.songs) ? appData.songs : [];
}

function getCurrentSongIndex() {
  const songs = getSongs();
  if (!songs.length || !appData?.nowPlayingSongId) return -1;
  return songs.findIndex((song) => song.id === appData.nowPlayingSongId);
}

function syncCurrentSongIndexFromData() {
  currentSongIndex = getCurrentSongIndex();
}

function renderEmptyState() {
  appData = null;
  currentSongIndex = -1;

  if (els.sessionName) els.sessionName.textContent = "Chưa có session";
  if (els.sessionSlug) els.sessionSlug.textContent = "Tạo mới hoặc mở bằng ?s=session-slug";
  if (els.songCount) els.songCount.textContent = "0 bài";
  if (els.nowPlayingTitle) els.nowPlayingTitle.textContent = "Chưa có bài nào";
  if (els.nowPlayingMeta) els.nowPlayingMeta.textContent = "Thông tin bài sẽ hiện ở đây";
  if (els.playerPlaceholder) els.playerPlaceholder.classList.remove("hidden");

  if (els.songList) {
    els.songList.innerHTML = `
      <div class="empty-box">
        Chưa có session nào đang mở.<br />
        Hãy tạo session mới hoặc nhập slug để mở.
      </div>
    `;
  }
}

async function loadSession(slug) {
  try {
    appData = await api(`/api/session/${slug}`);
    setSessionSlugToUrl(slug);

    if (els.openSessionInput) els.openSessionInput.value = slug;

    syncCurrentSongIndexFromData();
    renderAll();

    const songs = getSongs();
    if (isPlayerReady && currentSongIndex >= 0 && songs[currentSongIndex]) {
      player.loadVideoById(songs[currentSongIndex].videoId);
    }
  } catch (error) {
    renderEmptyState();
    showMessage(error.message, "error");
  }
}

async function createSession() {
  const rawSlug = els.sessionSlugInput?.value?.trim() || "";
  const slug = sanitizeSlug(rawSlug);

  if (!slug || slug.length < 3) {
    showMessage("Slug không hợp lệ.", "error");
    return;
  }

  try {
    const data = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({
        slug,
        name: slug,
      }),
    });

    appData = data;
    setSessionSlugToUrl(slug);

    if (els.openSessionInput) els.openSessionInput.value = slug;
    if (els.sessionSlugInput) els.sessionSlugInput.value = "";

    syncCurrentSongIndexFromData();
    renderAll();
    showMessage("Đã tạo session mới.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function openSession() {
  const slug = sanitizeSlug(els.openSessionInput?.value || "");

  if (!slug || slug.length < 3) {
    showMessage("Session slug không hợp lệ.", "error");
    return;
  }

  await loadSession(slug);
}

async function renameSession() {
  if (!appData?.slug) {
    showMessage("Chưa có session đang mở.", "error");
    return;
  }

  const name = window.prompt("Đổi tên session:", appData.name || appData.slug);
  if (!name || !name.trim()) return;

  try {
    appData = await api(`/api/session/${appData.slug}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });

    syncCurrentSongIndexFromData();
    renderAll();
    showMessage("Đã đổi tên session.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function deleteSession() {
  if (!appData?.slug) {
    showMessage("Chưa có session đang mở.", "error");
    return;
  }

  const ok = window.confirm(`Xoá session "${appData.slug}"?`);
  if (!ok) return;

  try {
    await api(`/api/session/${appData.slug}`, {
      method: "DELETE",
    });

    setSessionSlugToUrl("");

    if (els.openSessionInput) els.openSessionInput.value = "";
    if (els.sessionSlugInput) els.sessionSlugInput.value = "";

    if (player && isPlayerReady) {
      player.stopVideo();
    }

    renderEmptyState();
    showMessage("Đã xoá session.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function copySessionLink() {
  if (!appData?.slug) {
    showMessage("Chưa có session để copy.", "error");
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("s", appData.slug);

  try {
    await navigator.clipboard.writeText(url.toString());
    showMessage("Đã copy link session.", "success");
  } catch (error) {
    showMessage("Không thể copy link.", "error");
  }
}

async function addSong() {
  if (!appData?.slug) {
    showMessage("Hãy tạo hoặc mở session trước.", "error");
    return;
  }

  const raw = els.youtubeUrl?.value?.trim() || "";
  if (!raw) return;

  try {
    appData = await api(`/api/session/${appData.slug}/songs`, {
      method: "POST",
      body: JSON.stringify({ url: raw }),
    });

    if (els.youtubeUrl) els.youtubeUrl.value = "";

    syncCurrentSongIndexFromData();
    renderAll();
    showMessage("Đã thêm bài.", "success");

    const songs = getSongs();
    if (isPlayerReady && currentSongIndex >= 0 && songs[currentSongIndex]) {
      player.loadVideoById(songs[currentSongIndex].videoId);
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function removeSong(songId) {
  if (!appData?.slug) return;

  try {
    appData = await api(`/api/session/${appData.slug}/songs/${songId}`, {
      method: "DELETE",
    });

    syncCurrentSongIndexFromData();
    renderAll();

    const songs = getSongs();
    if (!songs.length) {
      if (player && isPlayerReady) player.stopVideo();
    } else if (player && isPlayerReady && currentSongIndex >= 0 && songs[currentSongIndex]) {
      player.loadVideoById(songs[currentSongIndex].videoId);
    }

    showMessage("Đã xoá bài.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function setNowPlayingByIndex(index) {
  const songs = getSongs();
  if (!appData?.slug || index < 0 || index >= songs.length) return;

  try {
    appData = await api(`/api/session/${appData.slug}/now-playing`, {
      method: "POST",
      body: JSON.stringify({ songId: songs[index].id }),
    });

    syncCurrentSongIndexFromData();
    renderAll();

    const refreshedSongs = getSongs();
    if (player && isPlayerReady && currentSongIndex >= 0 && refreshedSongs[currentSongIndex]) {
      player.loadVideoById(refreshedSongs[currentSongIndex].videoId);
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function playNext() {
  const songs = getSongs();
  if (!songs.length) return;

  if (currentSongIndex < 0) {
    setNowPlayingByIndex(0);
    return;
  }

  const nextIndex = (currentSongIndex + 1) % songs.length;
  setNowPlayingByIndex(nextIndex);
}

function playPrev() {
  const songs = getSongs();
  if (!songs.length) return;

  if (currentSongIndex < 0) {
    setNowPlayingByIndex(0);
    return;
  }

  const prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
  setNowPlayingByIndex(prevIndex);
}

function togglePlayPause() {
  const songs = getSongs();
  if (!songs.length || !player || !isPlayerReady) return;

  if (currentSongIndex < 0) {
    setNowPlayingByIndex(0);
    return;
  }

  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function renderSessionMeta() {
  if (!appData) {
    if (els.sessionName) els.sessionName.textContent = "Chưa có session";
    if (els.sessionSlug) els.sessionSlug.textContent = "Hãy tạo hoặc mở một session";
    return;
  }

  if (els.sessionName) {
    els.sessionName.textContent = appData.name || appData.slug;
  }

  if (els.sessionSlug) {
    els.sessionSlug.textContent = `?s=${appData.slug} • ${getSongs().length} bài`;
  }
}

function renderNowPlaying() {
  const songs = getSongs();

  if (currentSongIndex < 0 || !songs[currentSongIndex]) {
    if (els.nowPlayingTitle) els.nowPlayingTitle.textContent = "Chưa có bài nào";
    if (els.nowPlayingMeta) els.nowPlayingMeta.textContent = "Thông tin bài sẽ hiện ở đây";
    if (els.playerPlaceholder) els.playerPlaceholder.classList.remove("hidden");
    return;
  }

  const song = songs[currentSongIndex];
  if (els.nowPlayingTitle) els.nowPlayingTitle.textContent = song.title;
  if (els.nowPlayingMeta) els.nowPlayingMeta.textContent = `Video ID: ${song.videoId}`;
  if (els.playerPlaceholder) els.playerPlaceholder.classList.add("hidden");
}

function renderSongList() {
  const songs = getSongs();

  if (els.songCount) {
    els.songCount.textContent = `${songs.length} bài`;
  }

  if (!els.songList) return;

  if (!songs.length) {
    els.songList.innerHTML = `
      <div class="empty-box">
        Session đang trống.<br />
        Hãy dán link YouTube để thêm bài đầu tiên.
      </div>
    `;
    return;
  }

  els.songList.innerHTML = songs.map((song, index) => {
    const active = index === currentSongIndex ? "active" : "";

    return `
      <div class="song-item ${active}">
        <img
          class="song-thumb"
          src="${escapeHtml(song.thumbnail)}"
          alt="${escapeHtml(song.title)}"
          loading="lazy"
        />
        <div class="song-body">
          <p class="song-title">${escapeHtml(song.title)}</p>
          <p class="song-sub">${escapeHtml(song.videoId)}</p>
          <div class="song-actions">
            <button class="btn btn-secondary" data-action="play-song" data-index="${index}" type="button">Play</button>
            <button class="btn btn-danger" data-action="remove-song" data-song-id="${song.id}" type="button">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderAll() {
  renderSessionMeta();
  renderNowPlaying();
  renderSongList();
}

function handleSongListClick(event) {
  const playBtn = event.target.closest("[data-action='play-song']");
  if (playBtn) {
    const index = Number(playBtn.dataset.index);
    if (!Number.isNaN(index)) {
      setNowPlayingByIndex(index);
    }
    return;
  }

  const removeBtn = event.target.closest("[data-action='remove-song']");
  if (removeBtn) {
    removeSong(removeBtn.dataset.songId);
  }
}

function bindEvents() {
  if (els.createSessionBtn) {
    els.createSessionBtn.addEventListener("click", createSession);
  }

  if (els.openSessionBtn) {
    els.openSessionBtn.addEventListener("click", openSession);
  }

  if (els.renameSessionBtn) {
    els.renameSessionBtn.addEventListener("click", renameSession);
  }

  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", copySessionLink);
  }

  if (els.deleteSessionBtn) {
    els.deleteSessionBtn.addEventListener("click", deleteSession);
  }

  if (els.addBtn) {
    els.addBtn.addEventListener("click", addSong);
  }

  if (els.prevBtn) {
    els.prevBtn.addEventListener("click", playPrev);
  }

  if (els.playPauseBtn) {
    els.playPauseBtn.addEventListener("click", togglePlayPause);
  }

  if (els.nextBtn) {
    els.nextBtn.addEventListener("click", playNext);
  }

  if (els.songList) {
    els.songList.addEventListener("click", handleSongListClick);
  }

  if (els.sessionSlugInput) {
    els.sessionSlugInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") createSession();
    });
  }

  if (els.openSessionInput) {
    els.openSessionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openSession();
    });
  }

  if (els.youtubeUrl) {
    els.youtubeUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addSong();
    });
  }
}

window.onYouTubeIframeAPIReady = function () {
  if (!els.playerRoot) return;

  player = new YT.Player("player", {
    height: "100%",
    width: "100%",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        isPlayerReady = true;

        const songs = getSongs();
        if (currentSongIndex >= 0 && songs[currentSongIndex]) {
          player.loadVideoById(songs[currentSongIndex].videoId);
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) {
          playNext();
        }
      },
      onError: () => {
        showMessage("Không thể phát video này.", "error");
      },
    },
  });
};
