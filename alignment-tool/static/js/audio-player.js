/** Per-segment HTML5 audio player with timestamp seeking. */

/**
 * Parse SRT timestamp "HH:MM:SS,mmm" to seconds.
 */
export function parseTimestamp(ts) {
  if (!ts) return 0;
  const [time, ms] = ts.split(",");
  const [h, m, s] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s + (parseInt(ms, 10) || 0) / 1000;
}

/**
 * Format seconds to "MM:SS" for display.
 */
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Create an audio player element for a segment.
 * Returns { container, play, pause, toggle, destroy }.
 */
export function createAudioPlayer(segment, { autoStop = true } = {}) {
  const audio = document.createElement("audio");
  audio.preload = "none";
  audio.controls = false;

  const mediaUrl = segment.media_restored || segment.media_original;
  if (mediaUrl) {
    audio.src = `/api/audio-proxy?url=${encodeURIComponent(mediaUrl)}`;
  }

  const startSec = parseTimestamp(segment.start);
  const endSec = parseTimestamp(segment.end);

  let seeked = false;
  audio.addEventListener("loadedmetadata", () => {
    if (!seeked) {
      audio.currentTime = startSec;
      seeked = true;
    }
  });

  if (autoStop) {
    audio.addEventListener("timeupdate", () => {
      if (audio.currentTime >= endSec) {
        audio.pause();
      }
    });
  }

  // Build controls
  const container = document.createElement("div");
  container.className = "audio-player";

  const playBtn = document.createElement("button");
  playBtn.className = "play-btn";
  playBtn.textContent = "▶";
  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      // Re-seek if not yet loaded or past the end
      if (audio.currentTime < startSec || audio.currentTime >= endSec) {
        audio.currentTime = startSec;
      }
      audio.play();
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => { playBtn.textContent = "⏸"; });
  audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });

  const timeLabel = document.createElement("span");
  timeLabel.className = "time-label";
  timeLabel.textContent = `${formatTime(startSec)} → ${formatTime(endSec)}`;

  container.appendChild(playBtn);
  container.appendChild(timeLabel);
  container.appendChild(audio);

  return {
    container,
    play: () => { audio.currentTime = startSec; audio.play(); },
    pause: () => audio.pause(),
    toggle: () => {
      if (audio.paused) {
        if (audio.currentTime < startSec || audio.currentTime >= endSec) {
          audio.currentTime = startSec;
        }
        audio.play();
      } else {
        audio.pause();
      }
    },
    destroy: () => { audio.pause(); audio.src = ""; },
  };
}
