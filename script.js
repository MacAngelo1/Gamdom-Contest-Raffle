"use strict";

const STORAGE_KEY = "gamdom-community-raffle-v1";
const $ = id => document.getElementById(id);

// Support both the original and updated HTML button.
const downloadButton =
  $("downloadImageButton") || $("backupButton");

downloadButton.id = "downloadImageButton";
downloadButton.textContent = "Download Image";

const freshState = () => ({
  version: 1,
  entries: [],
  closed: false,
  winnerId: null,
  drawnAt: null
});

let state = freshState();
let storageReady = true;
let creatingImage = false;

// Show a message below the entry form.
function notify(text, isError = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", isError);
}

// Check saved data before using it.
function validState(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    typeof value.closed !== "boolean"
  ) {
    return false;
  }

  const ids = new Set();
  const handles = new Set();

  for (const entry of value.entries) {
    if (
      !entry ||
      typeof entry.gamdomId !== "string" ||
      !/^[0-9]{1,30}$/.test(entry.gamdomId) ||
      typeof entry.handle !== "string" ||
      !/^[A-Za-z0-9_]{1,15}$/.test(entry.handle)
    ) {
      return false;
    }

    const id = entry.gamdomId.replace(/^0+(?=\d)/, "");
    const handle = entry.handle.toLowerCase();

    if (ids.has(id) || handles.has(handle)) {
      return false;
    }

    ids.add(id);
    handles.add(handle);
  }

  if (value.winnerId === null) {
    return value.drawnAt === null;
  }

  return (
    value.closed &&
    value.entries.some(
      entry => entry.gamdomId === value.winnerId
    ) &&
    typeof value.drawnAt === "string" &&
    Number.isFinite(Date.parse(value.drawnAt))
  );
}

// Load the saved raffle.
try {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved !== null) {
    const parsed = JSON.parse(saved);

    if (!validState(parsed)) {
      throw new Error("Invalid saved raffle");
    }

    state = parsed;
  }

  // Confirm that the browser allows saving.
  const probeKey = STORAGE_KEY + "-probe";
  localStorage.setItem(probeKey, "1");
  localStorage.removeItem(probeKey);
} catch {
  storageReady = false;

  notify(
    "Browser storage is unavailable or the saved raffle is damaged. " +
    "Controls are disabled to protect your data. " +
    "Enable browser storage and reload.",
    true
  );
}

// Save changes before updating the screen.
function commit(nextState) {
  if (!storageReady) return false;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const latest =
      saved === null ? freshState() : JSON.parse(saved);

    if (!validState(latest)) {
      throw new Error("Invalid saved raffle");
    }

    // Avoid overwriting changes made in another tab.
    if (JSON.stringify(latest) !== JSON.stringify(state)) {
      state = latest;
      render();

      notify(
        "The raffle changed in another tab. Review it and try again.",
        true
      );

      return false;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextState)
    );

    state = nextState;
    render();

    return true;
  } catch {
    notify(
      "Could not save this change. Your previous raffle has been kept. " +
      "Check that your browser allows this site to save data.",
      true
    );

    return false;
  }
}

// Update the page.
function render() {
  const locked = state.closed || !storageReady;

  const winner = state.entries.find(
    entry => entry.gamdomId === state.winnerId
  );

  $("count").textContent = state.entries.length;
  $("listCount").textContent = state.entries.length;

  $("status").textContent = !storageReady
    ? "Storage unavailable"
    : winner
      ? "Draw complete"
      : state.closed
        ? "Entries closed"
        : "Entries open";

  $("status").classList.toggle(
    "closed",
    state.closed || !storageReady
  );

  $("gamdomId").disabled = locked;
  $("handle").disabled = locked;
  $("addButton").disabled = locked;

  if ($("formHint")) {
  $("formHint").textContent = state.closed
    ? "Entries are closed for this raffle."
    : "One entry per Gamdom ID and X handle.";
}

  $("closeButton").hidden = state.closed;
  $("closeButton").disabled =
    !storageReady || !state.entries.length;

  $("drawButton").hidden =
    !state.closed || Boolean(winner);

  $("drawButton").disabled =
    !storageReady || !state.entries.length;

  downloadButton.disabled = !winner || creatingImage;
  downloadButton.textContent = creatingImage
    ? "Creating image..."
    : "Download Image";

  $("resetButton").disabled =
    !storageReady || creatingImage;

 if ($("controlHint")) {
  $("controlHint").textContent = winner
    ? "The winner is saved. Download the winner image or start a new raffle."
    : state.closed
      ? "Entries are locked. You can now pick the winner."
      : "Close entries when everyone has been added.";
}

  $("winnerCard").hidden = !winner;

  if (winner) {
    $("winnerHandle").textContent =
      "@" + winner.handle;

    $("winnerId").textContent =
      "Gamdom ID: " + winner.gamdomId;

    $("winnerDate").textContent =
      "Drawn " + new Date(state.drawnAt).toLocaleString();
  }

  $("emptyMessage").hidden = state.entries.length > 0;
  $("entries").replaceChildren();

  const fragment = document.createDocumentFragment();

  state.entries.forEach((entry, index) => {
    const row = document.createElement("li");
    const handle = document.createElement("span");
    const id = document.createElement("small");

    // Display input as text, never as HTML.
    handle.textContent =
      (index + 1) + ". @" + entry.handle;

    id.textContent = "ID: " + entry.gamdomId;

    row.append(handle, id);
    fragment.append(row);
  });

  $("entries").append(fragment);
}

// Add a participant.
$("entryForm").addEventListener("submit", event => {
  event.preventDefault();

  if (state.closed || !storageReady) return;

  const gamdomId = $("gamdomId").value
    .trim()
    .replace(/^0+(?=\d)/, "");

  const handle = $("handle").value
    .trim()
    .replace(/^@/, "");

  if (!/^[0-9]{1,30}$/.test(gamdomId)) {
    notify(
      "Enter a valid Gamdom ID using numbers only.",
      true
    );
    return;
  }

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    notify(
      "Use an X handle with 1–15 letters, numbers, or underscores.",
      true
    );
    return;
  }

  const duplicateId = state.entries.some(
    entry =>
      entry.gamdomId.replace(/^0+(?=\d)/, "") === gamdomId
  );

  if (duplicateId) {
    notify("That Gamdom ID is already entered.", true);
    return;
  }

  const duplicateHandle = state.entries.some(
    entry =>
      entry.handle.toLowerCase() === handle.toLowerCase()
  );

  if (duplicateHandle) {
    notify("That X handle is already entered.", true);
    return;
  }

  const saved = commit({
    ...state,
    entries: [
      ...state.entries,
      { gamdomId, handle }
    ]
  });

  if (saved) {
    $("entryForm").reset();
    $("gamdomId").focus();
    notify("@" + handle + " has been added.");
  }
});

// Close entries.
$("closeButton").addEventListener("click", () => {
  if (
    state.closed ||
    !state.entries.length ||
    !storageReady
  ) {
    return;
  }

  const confirmed = confirm(
    "Close this raffle with " + state.entries.length +
    " entries? You will not be able to add more entries."
  );

  if (!confirmed) return;

  if (commit({ ...state, closed: true })) {
    notify("Raffle closed. Ready to draw a winner.");
    $("drawButton").focus();
  }
});

// Secure random selection with an equal chance for each entry.
function randomIndex(length) {
  const range = 2 ** 32;
  const limit = range - (range % length);
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % length;
}

// Draw and save one winner.
$("drawButton").addEventListener("click", () => {
  if (
    !state.closed ||
    state.winnerId !== null ||
    !state.entries.length ||
    !storageReady
  ) {
    return;
  }

  try {
    const winner =
      state.entries[randomIndex(state.entries.length)];

    const saved = commit({
      ...state,
      winnerId: winner.gamdomId,
      drawnAt: new Date().toISOString()
    });

    if (saved) {
      notify("Winner selected: @" + winner.handle + "!");

      $("winnerCard").scrollIntoView({
        block: "center"
      });
    }
  } catch {
    notify(
      "Could not access secure randomness. Try a current browser.",
      true
    );
  }
});

// Load the logo for the downloadable image.
function loadLogo() {
  return new Promise(resolve => {
    const image = new Image();

    const timeout = setTimeout(() => {
      resolve(null);
    }, 4000);

    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };

    image.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    image.src = "logo.png";
  });
}

// Download the winner card as a PNG image.
downloadButton.addEventListener("click", async () => {
  if (creatingImage) return;

  const winner = state.entries.find(
    entry => entry.gamdomId === state.winnerId
  );

  if (!winner) {
    notify(
      "Draw a winner before downloading the image.",
      true
    );
    return;
  }

  // Keep this draw's details together while creating the image.
  const entryCount = state.entries.length;
  const drawDate = new Date(state.drawnAt);

  creatingImage = true;
  render();

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Image creation is unavailable.");
    }

    const center = canvas.width / 2;

    // Background.
    ctx.fillStyle = "#091319";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glow = ctx.createRadialGradient(
      center, 650, 20,
      center, 650, 700
    );

    glow.addColorStop(
      0,
      "rgba(0, 237, 133, 0.13)"
    );

    glow.addColorStop(
      1,
      "rgba(0, 237, 133, 0)"
    );

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative border.
    ctx.strokeStyle = "#00ed85";
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, 1004, 1274);

    ctx.fillStyle = "#00ed85";
    ctx.fillRect(center - 60, 38, 120, 7);

    // Center text and shrink long values to fit.
    function drawText(
      text,
      y,
      size,
      color,
      weight = "600",
      maxWidth = 880
    ) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;

      while (true) {
        ctx.font =
          `${weight} ${size}px Arial, sans-serif`;

        if (
          ctx.measureText(text).width <= maxWidth ||
          size <= 12
        ) {
          break;
        }

        size -= 1;
      }

      ctx.fillText(text, center, y);
    }

    // Logo, with a text fallback if it cannot be used.
    const logo = await loadLogo();
    let logoDrawn = false;

    if (
      logo &&
      logo.naturalWidth &&
      logo.naturalHeight
    ) {
      try {
        // Check that the browser permits exporting this logo.
        const probe = document.createElement("canvas");
        probe.width = 1;
        probe.height = 1;

        const probeContext = probe.getContext("2d");

        if (!probeContext) {
          throw new Error("Logo check unavailable.");
        }

        probeContext.drawImage(logo, 0, 0, 1, 1);
        probeContext.getImageData(0, 0, 1, 1);

        const scale = Math.min(
          540 / logo.naturalWidth,
          300 / logo.naturalHeight
        );

        const width = logo.naturalWidth * scale;
        const height = logo.naturalHeight * scale;

        ctx.drawImage(
          logo,
          center - width / 2,
          195 - height / 2,
          width,
          height
        );

        logoDrawn = true;
      } catch {
        // Use the text heading below.
      }
    }

    if (!logoDrawn) {
      drawText(
        "Gamdom",
        190,
        82,
        "#ffffff",
        "700"
      );
    }

    drawText(
      "COMMUNITY RAFFLE",
      365,
      25,
      "#00ed85",
      "700"
    );

    drawText(
      "WE HAVE A WINNER",
      435,
      52,
      "#ffffff",
      "800"
    );

    // Winner panel.
    ctx.fillStyle = "#11291f";
    ctx.fillRect(100, 520, 880, 440);

    ctx.strokeStyle = "#28734f";
    ctx.lineWidth = 2;
    ctx.strokeRect(100, 520, 880, 440);

    drawText(
      "CONGRATULATIONS",
      590,
      25,
      "#b0c8bc",
      "700"
    );

    drawText(
      "@" + winner.handle,
      700,
      80,
      "#00ed85",
      "800",
      800
    );

    drawText(
      "GAMDOM ID",
      810,
      23,
      "#b0c8bc",
      "700"
    );

    drawText(
      winner.gamdomId,
      868,
      48,
      "#ffffff",
      "700",
      790
    );

    // Draw details.
    const entryLabel =
      entryCount === 1 ? "ENTRY" : "ENTRIES";

    drawText(
      `${entryCount} ${entryLabel} · ONE WINNER`,
      1035,
      26,
      "#ffffff",
      "700"
    );

    const dateLabel = drawDate.toLocaleDateString(
      undefined,
      {
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );

    const timeLabel = drawDate.toLocaleTimeString(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
      }
    );

    drawText(
      `${dateLabel} · ${timeLabel}`,
      1090,
      25,
      "#a3b4bf",
      "400"
    );


    

    // Create the downloadable PNG.
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Could not create the PNG."));
        }
      }, "image/png");
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `gamdom-raffle-winner-${winner.handle}.png`;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);

    notify(
      ""
    );
  } catch {
    notify(
      "Could not create the winner image. Please try again.",
      true
    );
  } finally {
    creatingImage = false;
    render();
  }
});

// Clear the current raffle and start again.
$("resetButton").addEventListener("click", () => {
  if (!storageReady || creatingImage) return;

  const confirmed = confirm(
    "Start a new raffle? This removes the current entries and winner " +
    "from this browser. Download the winner image first if you want to keep it."
  );

  if (!confirmed) return;

  if (commit(freshState())) {
    $("entryForm").reset();
    notify("New raffle started. Entries are open.");
    $("gamdomId").focus();
  }
});

// Update this page when another tab changes the saved raffle.
window.addEventListener("storage", event => {
  if (
    event.key !== STORAGE_KEY &&
    event.key !== null
  ) {
    return;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    const latest =
      saved === null ? freshState() : JSON.parse(saved);

    if (!validState(latest)) {
      throw new Error("Invalid saved raffle");
    }

    state = latest;
    render();

    notify("Raffle updated from another tab.");
  } catch {
    storageReady = false;
    render();

    notify(
      "Saved data could not be read. Reload before continuing.",
      true
    );
  }
});

render();
