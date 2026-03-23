const API_BASE = "https://nhac.seedance-v2-0.workers.dev";
const LIBRARY_ID_KEY = "listen-mini-library-id";

let appData = null;
let player = null;
let isPlayerReady = false;
let currentSongIndex = -1;

const els = {
  youtubeUrl: document.getElementById("youtubeUrl"),
  addBtn: document.getElementById("addBtn"),
  prevBtn: document.getElementById("prevBtn"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  nextBtn: document.getElementById("nextBtn"),

  newPlaylistBtn: document.getElementById("newPlaylistBtn"),
  renamePlaylistBtn: document.getElementById("renamePlaylistBtn"),
  deletePlaylistBtn: document.getElementById("deletePlaylistBtn"),
  playlistSelect: document.getElementById("playlistSelect"),
  playlistLibrary: document.getElementById("playlistLibrary"),

  currentPlaylistName: document.getElementById("currentPlaylistName"),
  currentPlaylistMeta: document.getElementById("currentPlaylistMeta"),

  songCount: document.getElementById("songCount"),
  songList: document.getElementById("songList"),

  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  nowPlayingMeta: document.getElementById("nowPlayingMeta"),
  playerPlaceholder: document.getElementById("playerPlaceholder"),
  message: document.getElementById("message"),
};

bootstrap();

async function bootstrap() {
  bindEvents();
  await ensureLibrary();
  await refreshLibrary();
}

function getLibraryId() {
  return localStorage.getItem(LIBRARY_ID_KEY);
}

function setLibraryId(id) {
  localStorage.setItem(LIBRARY_ID_KEY, id);
}

async function ensureLibrary() {
  let libraryId = getLibraryId();
  if (libraryId) return libraryId;

  const res = await api("/api/library/init", {
    method: "POST",
  });

  setLibraryId(res.libraryId);
  return res.libraryId;
}

async function refreshLibrary() {
  const libraryId = getLibraryId();
  appData = await api(`/api/library/${libraryId}`);
  if (!getCurrentPlaylist()) currentSongIndex = -1;
  renderAll();
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

function getCurrentPlaylist() {
  return appData?.playlists?.find((p) => p.id === appData.currentPlaylistId) || null;
}

function getCurrentSongs() {
  return getCurrentPlaylist()?.songs || [];
}

function showMessage(text, type = "") {
  els.message.textContent = text;
  els.message.className = "message";
  if (type) els.message.classList.add(type);

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

function formatCount(n, unit) {
  return `${n} ${unit}`;
}

async function createPlaylist() {
  const name = prompt("Nhập tên playlist mới:");
  if (!name || !name.trim()) return;

  try {
    appData = await api(`/api/library/${getLibraryId()}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    currentSongIndex = -1;
    renderAll();
    showMessage("Đã tạo playlist mới.", "success");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function renameCurrentPlaylist() {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  const name = prompt("Đổi tên playlist:", playlist.name);
  if (!name || !name.trim()) return;

  try {
    appData = await api(`/api/library/${getLibraryId()}/playlists/${playlist.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    renderAll();
    showMessage("Đã đổi tên playlist.", "success");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function deleteCurrentPlaylist() {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;
  if (!confirm(`Xoá playlist "${playlist.name}"?`)) return;

  try {
    appData = await api(`/api/library/${getLibraryId()}/playlists/${playlist.id}`, {
      method: "DELETE",
    });
    currentSongIndex = -1;
    if (player && isPlayerReady) player.stopVideo();
    renderAll();
    showMessage("Đã xoá playlist.", "success");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function switchPlaylist(playlistId) {
  try {
    appData = await api(`/api/library/${getLibraryId()}/select/${playlistId}`, {
      method: "POST",
    });
    currentSongIndex = -1;
    if (player && isPlayerReady) player.stopVideo();
    renderAll();
    showMessage("Đã chuyển playlist.", "success");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function addSong() {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  const raw = els.youtubeUrl.value.trim();
  if (!raw) return;

  try {
    appData = await api(`/api/library/${getLibraryId()}/playlists/${playlist.id}/songs`, {
      method: "POST",
      body: JSON.stringify({ url: raw }),
    });

    els.youtubeUrl.value = "";
    renderAll();
    showMessage("Đã thêm bài.", "success");

    if (currentSongIndex === -1) {
      playSongAt(0);
    }
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function removeSong(songId) {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  const songs = getCurrentSongs();
  const removedIndex = songs.findIndex((s) => s.id === songId);

  try {
    appData = await api(`/api/library/${getLibraryId()}/playlists/${playlist.id}/songs/${songId}`, {
      method: "DELETE",
    });

    const nextSongs = getCurrentSongs();

    if (!nextSongs.length) {
      currentSongIndex = -1;
      if (player && isPlayerReady) player.stopVideo();
    } else if (removedIndex === currentSongIndex) {
      currentSongIndex = Math.min(removedIndex, nextSongs.length - 1);
      if (player && isPlayerReady && currentSongIndex >= 0) {
        player.loadVideoById(nextSongs[currentSongIndex].videoId);
      }
    } else if (removedIndex < currentSongIndex) {
      currentSongIndex -= 1;
    }

    renderAll();
    showMessage("Đã xoá bài.", "success");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function playSongAt(index) {
  const songs = getCurrentSongs();
  if (index < 0 || index >= songs.length) return;

  currentSongIndex = index;
  renderSongList();
  renderNowPlaying();

  if (player && isPlayerReady) {
    player.loadVideoById(songs[index].videoId);
  }
}

function playNext() {
  const songs = getCurrentSongs();
  if (!songs.length) return;

  if (currentSongIndex < 0) {
    playSongAt(0);
    return;
  }

  const nextIndex = (currentSongIndex + 1) % songs.length;
  playSongAt(nextIndex);
}

function playPrev() {
  const songs = getCurrentSongs();
  if (!songs.length) return;

  if (currentSongIndex < 0) {
    playSongAt(0);
    return;
  }

  const prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
  playSongAt(prevIndex);
}

function togglePlayPause() {
  const songs = getCurrentSongs();
  if (!songs.length || !player || !isPlayerReady) return;

  if (currentSongIndex < 0) {
    playSongAt(0);
    return;
  }

  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function renderPlaylistSelect() {
  const current = getCurrentPlaylist();
  els.playlistSelect.innerHTML = appData.playlists
    .map((p) => {
      const selected = p.id === current?.id ? "selected" : "";
      return `<option value="${p.id}" ${selected}>${escapeHtml(p.name)}</option>`;
    })
    .join("");
}

function renderPlaylistLibrary() {
  const current = getCurrentPlaylist();

  els.playlistLibrary.innerHTML = appData.playlists
    .map((p) => {
      const active = p.id === current?.id ? "active" : "";
      return `
        <div class="saved-item ${active}" data-playlist-id="${p.id}">
          <p class="saved-item-title">${escapeHtml(p.name)}</p>
          <p class="saved-item-sub">${p.songs.length} bài</p>
        </div>
      `;
    })
    .join("");
}

function renderPlaylistMeta() {
  const playlist = getCurrentPlaylist();
  if (!playlist) {
    els.currentPlaylistName.textContent = "Chưa có playlist";
    els.currentPlaylistMeta.textContent = "0 bài";
    return;
  }

  els.currentPlaylistName.textContent = playlist.name;
  els.currentPlaylistMeta.textContent = formatCount(playlist.songs.length, "bài");
}

function renderSongList() {
  const songs = getCurrentSongs();
  els.songCount.textContent = formatCount(songs.length, "bài");

  if (!songs.length) {
    els.songList.innerHTML = `
      <div class="empty-box">
        Playlist đang trống.<br />
        Hãy dán link YouTube để thêm bài đầu tiên.
      </div>
    `;
    return;
  }

  els.songList.innerHTML = songs
    .map((song, index) => {
      const active = index === currentSongIndex ? "active" : "";
      return `
        <div class="song-item ${active}">
          <img class="song-thumb" src="${escapeHtml(song.thumbnail)}" alt="${escapeHtml(song.title)}" />
          <div class="song-body">
            <p class="song-title">${escapeHtml(song.title)}</p>
            <p class="song-sub">${escapeHtml(song.videoId)}</p>
          </div>
          <div class="song-actions">
            <button class="btn-ghost" data-action="play-song" data-index="${index}">Play</button>
            <button class="btn-danger" data-action="remove-song" data-song-id="${song.id}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderNowPlaying() {
  const songs = getCurrentSongs();

  if (currentSongIndex < 0 || !songs[currentSongIndex]) {
    els.nowPlayingTitle.textContent = "Chưa có bài nào";
    els.nowPlayingMeta.textContent = "Thông tin bài đang phát sẽ hiện ở đây";
    els.playerPlaceholder.classList.remove("hidden");
    return;
  }

  const song = songs[currentSongIndex];
  els.nowPlayingTitle.textContent = song.title;
  els.nowPlayingMeta.textContent = `Video ID: ${song.videoId}`;
  els.playerPlaceholder.classList.add("hidden");
}

function renderAll() {
  renderPlaylistSelect();
  renderPlaylistLibrary();
  renderPlaylistMeta();
  renderSongList();
  renderNowPlaying();
}

function handleSongListClick(event) {
  const playBtn = event.target.closest("[data-action='play-song']");
  if (playBtn) {
    const index = Number(playBtn.dataset.index);
    if (!Number.isNaN(index)) playSongAt(index);
    return;
  }

  const removeBtn = event.target.closest("[data-action='remove-song']");
  if (removeBtn) {
    removeSong(removeBtn.dataset.songId);
  }
}

function handlePlaylistLibraryClick(event) {
  const item = event.target.closest("[data-playlist-id]");
  if (!item) return;
  switchPlaylist(item.dataset.playlistId);
}

function bindEvents() {
  els.addBtn.addEventListener("click", addSong);
  els.prevBtn.addEventListener("click", playPrev);
  els.nextBtn.addEventListener("click", playNext);
  els.playPauseBtn.addEventListener("click", togglePlayPause);

  els.newPlaylistBtn.addEventListener("click", createPlaylist);
  els.renamePlaylistBtn.addEventListener("click", renameCurrentPlaylist);
  els.deletePlaylistBtn.addEventListener("click", deleteCurrentPlaylist);

  els.playlistSelect.addEventListener("change", (e) => switchPlaylist(e.target.value));
  els.playlistLibrary.addEventListener("click", handlePlaylistLibraryClick);
  els.songList.addEventListener("click", handleSongListClick);

  els.youtubeUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSong();
  });
}

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("player", {
    height: "100%",
    width: "100%",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onReady: () => {
        isPlayerReady = true;
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
