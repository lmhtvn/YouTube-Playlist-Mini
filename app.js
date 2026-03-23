const STORAGE_KEY = "listen-mini-playlist-v1";

let player = null;
let isPlayerReady = false;
let currentIndex = -1;

const els = {
  youtubeUrl: document.getElementById("youtubeUrl"),
  addBtn: document.getElementById("addBtn"),
  prevBtn: document.getElementById("prevBtn"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  nextBtn: document.getElementById("nextBtn"),
  clearBtn: document.getElementById("clearBtn"),
  playlist: document.getElementById("playlist"),
  playlistCount: document.getElementById("playlistCount"),
  message: document.getElementById("message"),
  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  nowPlayingMeta: document.getElementById("nowPlayingMeta"),
  playerPlaceholder: document.getElementById("playerPlaceholder"),
};

let playlist = loadPlaylist();

function savePlaylist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
}

function loadPlaylist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Load playlist error:", error);
    return [];
  }
}

function showMessage(text, type = "") {
  els.message.textContent = text;
  els.message.className = "message";
  if (type) els.message.classList.add(type);

  if (text) {
    clearTimeout(showMessage._timer);
    showMessage._timer = setTimeout(() => {
      els.message.textContent = "";
      els.message.className = "message";
    }, 2500);
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

function extractVideoId(url) {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) return match[1];
  }

  try {
    const u = new URL(trimmed);
    const v = u.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch (_) {
    // ignore
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function getThumb(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getItemTitle(item, index) {
  return item.title || `YouTube Video #${index + 1}`;
}

function updateNowPlaying() {
  if (currentIndex < 0 || !playlist[currentIndex]) {
    els.nowPlayingTitle.textContent = "Chưa có bài nào";
    els.nowPlayingMeta.textContent = "Playlist của bạn sẽ xuất hiện ở đây";
    els.playerPlaceholder.classList.remove("hidden");
    return;
  }

  const item = playlist[currentIndex];
  els.nowPlayingTitle.textContent = getItemTitle(item, currentIndex);
  els.nowPlayingMeta.textContent = `Video ID: ${item.videoId}`;
  els.playerPlaceholder.classList.add("hidden");
}

function updatePlaylistCount() {
  els.playlistCount.textContent = `${playlist.length} bài`;
}

function renderPlaylist() {
  updatePlaylistCount();

  if (!playlist.length) {
    els.playlist.innerHTML = `
      <div class="empty">
        Playlist đang trống.<br />
        Hãy dán link YouTube để thêm bài đầu tiên.
      </div>
    `;
    updateNowPlaying();
    return;
  }

  els.playlist.innerHTML = playlist
    .map((item, index) => {
      const title = escapeHtml(getItemTitle(item, index));
      const videoId = escapeHtml(item.videoId);
      const activeClass = index === currentIndex ? "active" : "";

      return `
        <div class="playlist-item ${activeClass}">
          <img class="thumb" src="${getThumb(videoId)}" alt="${title}" />
          <div class="item-body">
            <p class="item-title">${title}</p>
            <p class="item-sub">${videoId}</p>
          </div>
          <div class="item-actions">
            <button class="ghost" data-action="play" data-index="${index}">Play</button>
            <button class="danger" data-action="remove" data-index="${index}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  updateNowPlaying();
}

function addVideo() {
  const inputValue = els.youtubeUrl.value.trim();
  const videoId = extractVideoId(inputValue);

  if (!videoId) {
    showMessage("Link YouTube không hợp lệ.", "error");
    return;
  }

  const exists = playlist.some((item) => item.videoId === videoId);
  if (exists) {
    showMessage("Bài này đã có trong playlist.", "error");
    return;
  }

  const item = {
    videoId,
    title: `YouTube Video ${playlist.length + 1}`,
    addedAt: Date.now(),
  };

  playlist.push(item);
  savePlaylist();
  renderPlaylist();

  els.youtubeUrl.value = "";
  showMessage("Đã thêm vào playlist.", "success");

  if (currentIndex === -1) {
    playIndex(0);
  }
}

function removeIndex(index) {
  if (index < 0 || index >= playlist.length) return;

  const wasCurrent = index === currentIndex;
  playlist.splice(index, 1);

  if (!playlist.length) {
    currentIndex = -1;
    if (player && isPlayerReady) {
      player.stopVideo();
    }
  } else if (wasCurrent) {
    if (index >= playlist.length) {
      currentIndex = playlist.length - 1;
    } else {
      currentIndex = index;
    }

    if (player && isPlayerReady && currentIndex >= 0) {
      player.loadVideoById(playlist[currentIndex].videoId);
    }
  } else if (index < currentIndex) {
    currentIndex -= 1;
  }

  savePlaylist();
  renderPlaylist();
  showMessage("Đã xoá bài khỏi playlist.", "success");
}

function clearPlaylist() {
  playlist = [];
  currentIndex = -1;
  savePlaylist();
  renderPlaylist();

  if (player && isPlayerReady) {
    player.stopVideo();
  }

  showMessage("Đã xoá toàn bộ playlist.", "success");
}

function playIndex(index) {
  if (index < 0 || index >= playlist.length) return;

  currentIndex = index;
  renderPlaylist();

  if (!player || !isPlayerReady) {
    return;
  }

  player.loadVideoById(playlist[index].videoId);
}

function playNext() {
  if (!playlist.length) return;

  if (currentIndex < 0) {
    playIndex(0);
    return;
  }

  const nextIndex = (currentIndex + 1) % playlist.length;
  playIndex(nextIndex);
}

function playPrev() {
  if (!playlist.length) return;

  if (currentIndex < 0) {
    playIndex(0);
    return;
  }

  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  playIndex(prevIndex);
}

function togglePlayPause() {
  if (!player || !isPlayerReady || currentIndex < 0) return;

  const state = player.getPlayerState();

  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function handlePlaylistClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const index = Number(button.dataset.index);

  if (Number.isNaN(index)) return;

  if (action === "play") {
    playIndex(index);
  } else if (action === "remove") {
    removeIndex(index);
  }
}

function bindEvents() {
  els.addBtn.addEventListener("click", addVideo);

  els.youtubeUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addVideo();
    }
  });

  els.prevBtn.addEventListener("click", playPrev);
  els.nextBtn.addEventListener("click", playNext);
  els.playPauseBtn.addEventListener("click", togglePlayPause);
  els.clearBtn.addEventListener("click", clearPlaylist);
  els.playlist.addEventListener("click", handlePlaylistClick);
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

        if (playlist.length > 0) {
          currentIndex = 0;
          renderPlaylist();
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

bindEvents();
renderPlaylist();
