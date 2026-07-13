const approvedDMs = [
  "Eli",
  "DM"
];

function isDM(name) {
  return approvedDMs.some(function (dmName) {
    return dmName === name;
  });
}

const diceFile = "d20.png";
const dmAvatarFile = "DMavatar.webp";
const playerAvatars = [
  "avatar1.webp",
  "avatar2.webp",
  "avatar3.webp",
  "avatar4.webp",
  "avatar5.webp",
  "avatar6.webp",
  "avatar7.webp"
];

const diceResults = {};
const initiativeResults = {};
const initiativeRolls = {};

const playerList = document.getElementById("playerList");
const dmPlayer = document.getElementById("dmPlayer");
const dmControls = document.getElementById("dmControls");

const initiativeStartButton = document.getElementById("initiativeStartButton");
const initiativeEndButton = document.getElementById("initiativeEndButton");

const connectionStatus = document.getElementById("connectionStatus");

const popupBg = document.getElementById("popupBg");
const popupBox = document.getElementById("popupBox");

const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

/*WEBSOCKET*/
const websocketHost2 = prompt("Enter the websocket host")
const websocketPort = prompt("Enter the port, or leave blank for a wss host")
const websocketUrl = websocketPort
  ? `ws://${websocketHost2}:${websocketPort}`
  : `wss://${websocketHost2}`

const usernameInput = prompt("Enter your username:");
const username = usernameInput ? usernameInput.trim() : "";

const userTypeInput = prompt("Enter user type: player or dm", "player");
const userType = userTypeInput ? userTypeInput.trim().toLowerCase() : "player";

const passwordInput = prompt("Enter password, or leave blank:");
const password = passwordInput ? passwordInput.trim() : null;

let connectedUsers = [];
const playerHP = {};
const playerMaxHP = {};


if (username === "") {
  connectionStatus.textContent = "Username is required";
  throw new Error("Username is required");
}

/*WEBSOCKET not*/
//const websocketHost = window.location.host.replace("-8000.", "-8080.");
//const websocketUrl = `wss://${websocketHost}`;

console.log("Connecting to:", websocketUrl);

const socket = new WebSocket(websocketUrl);

socket.addEventListener("open", function () {
  connectionStatus.textContent = "Connected. Joining...";

  sendToServer({
    type: "join",
    name: username,
    user_type: userType,
    password: password
  });
});

socket.addEventListener("message", function (event) {
  let response = JSON.parse(event.data);

  console.log("Server response:", response);

  if (response.type === "response") {
    connectionStatus.textContent = `Connected as ${username} (${userType})`;
    /*returns array usernames */
    if (Array.isArray(response.message)) {
      connectedUsers = response.message;
      displayPlayers();
      return;
    }

    /*
      Show HP
    */
    if (handleHPServerMessage(response.message)) {
      return;
    }

    /*
      The person who rolled also receives a direct response.
    */
    updateRollFromServerMessage(response.message);
    handleInitiativeOrderMessage(response.message);

    if (shouldShowServerMessage(response.message)) {
      addChatMessage("Server", response.message);
    }

    return;
  }


  /*whisper*/
  if (response.type === "message") {
    addChatMessage(`Whisper from ${response.from}`, response.message);
  return;
}

/* THis is a A BROADCAST */

if (response.type === "broadcast") {
  console.log("Broadcast received:", response);

  if (response.category === "dice" || isDiceRollMessage(response.message)) {
    updateRollFromBroadcast(response);
    return;
  }

  if (response.category === "initiative") {
    if (response.initiative_order) {
      updateInitiativeOrder(response.initiative_order);
    }

    handleInitiativeOrderMessage(response.message);
    return;
  }

  if (response.category === "message") {
    addRawChatMessage(response.message);
    return;
  }

  if (shouldShowServerMessage(response.message)) {
    addChatMessage("Server", response.message);
  }

  return;
}

  if (response.type === "error") {
    connectionStatus.textContent = `Server error: ${response.message}`;

    if (response.from) {
      addChatMessage(response.from, response.message);
    } else if (shouldShowServerMessage(response.message)) {
      addChatMessage(response.message);
    }

    return;
  }

  if (response.type === "shutdown") {
    connectionStatus.textContent = "The server has shut down";
    addChatMessage("Server", "The server has shut down");
  }
});

socket.addEventListener("error", function (event) {
  console.error("WebSocket error:", event);
  connectionStatus.textContent = "WebSocket connection failed";
});

socket.addEventListener("close", function () {
  connectionStatus.textContent = "Disconnected from server";
});

setInterval(function () {
  if (socket.readyState === WebSocket.OPEN) {
    sendToServer({
      type: "userlist"
    });

    sendToServer({
      type: "check_hp"
    });
  }
}, 1000);

function sendToServer(obj) {
  if (socket.readyState !== WebSocket.OPEN) {
    console.warn("Socket is not connected yet. Could not send:", obj);
    return false;
  }

  socket.send(JSON.stringify(obj));
  return true;
}

function displayPlayers() {
  playerList.innerHTML = "";

  const dmUsername = connectedUsers.find(function (name) {
    return isDM(name);
  });

  const normalPlayers = connectedUsers.filter(function (name) {
    return !isDM(name);
  });

  normalPlayers.forEach(function (name) {
    const playerCard = createLeftPlayerCard(name);
    playerList.appendChild(playerCard);
  });

  if (dmUsername) {
    dmPlayer.innerHTML = createRightPlayerCard(dmUsername);
  } else {
    dmPlayer.innerHTML = `
      <div class="dm-offline">
        DM is not connected
      </div>
    `;
  }

  if (isDM(username)) {
    dmControls.style.display = "flex";
  } else {
    dmControls.style.display = "none";
  }
}

function createLeftPlayerCard(name) {
  const card = document.createElement("div");

  card.className = "player-card-small";
  card.dataset.username = name;

  card.innerHTML = `
    <div class="player-main-left">
      <div class="avatar-block">
        <img
          class="avatar"
          src="${getAvatarForUser(name)}"
          alt="${escapeHtml(name)} avatar"
        >

        <button class="whisper-btn" type="button">
          Whisper
        </button>
      </div>

      <div class="player-info-small">
        <button class="Username-btn" type="button">
          ${escapeHtml(name)}
        </button>

        ${getHPBarHTML(name)}
      </div>
    </div>

    <button class="dice" type="button">
      <img
        class="die"
        src="${diceFile}"
        alt="dice"
      >

      <span class="roll-result">
        ${diceResults[name] ?? ""}
      </span>
    </button>

    <div class="init">
      ${initiativeResults[name] ?? "-"}
    </div>
  `;

  return card;
}

function createRightPlayerCard(name) {
  return `
    <div class="Rplayer-card-small" data-username="${escapeHtml(name)}">
      <div class="Rinit">
        ${initiativeResults[name] ?? "-"}
      </div>

      <button class="dice" type="button">
        <img
          class="die"
          src="${diceFile}"
          alt="dice"
        >

        <span class="roll-result">
          ${diceResults[name] ?? ""}
        </span>
      </button>

      <div class="player-main-right">
        <div class="player-info-small right-info">
          <button class="Username-btn" type="button">
            ${escapeHtml(name)}
          </button>

          ${getHPBarHTML(name)}
        </div>

        <div class="avatar-block">
          <img
            class="avatar"
            src="${dmAvatarFile}"
            alt="${escapeHtml(name)} avatar"
          >

          <button class="whisper-btn" type="button">
            Whisper
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateCardHPDisplay(name) {
  const card = document.querySelector(
    `[data-username="${cssEscape(name)}"]`
  );

  if (!card) {
    return;
  }

  const hp = playerHP[name] ?? 100;
  const maxHp = playerMaxHP[name] ?? 100;
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  const hpValue = card.querySelector(".card-hp-value");
  const maxHpValue = card.querySelector(".card-max-hp-value");
  const hpFill = card.querySelector(".card-hp-fill");

  if (hpValue) {
    hpValue.textContent = hp;
  }

  if (maxHpValue) {
    maxHpValue.textContent = maxHp;
  }

  if (hpFill) {
    hpFill.style.width = `${hpPercent}%`;
  }
}

document.addEventListener("click", function (event) {
  const usernameButton = event.target.closest(".Username-btn");

  if (usernameButton) {
  const card = usernameButton.closest(".player-card-small, .Rplayer-card-small");
  const selectedUsername = card.dataset.username;

  requestHPFromServer();
  openPlayerPopup(selectedUsername);

  return;
}

const closePopupButton = event.target.closest(".close-popup");

if (closePopupButton) {
  popupBg.classList.remove("show");
  delete popupBox.dataset.username;
  return;
}

const hpButton = event.target.closest(".hp-btn");

if (hpButton) {
  if (!isDM(username)) {
    alert("Only the DM can edit HP.");
    return;
  }

  const selectedUsername = popupBox.dataset.username;
  const amount = Number(hpButton.dataset.hpChange);

  changePlayerHPOnServer(selectedUsername, amount);

  return;
}

  const whisperButton = event.target.closest(".whisper-btn");

  if (whisperButton && !whisperButton.disabled) {
    const card = whisperButton.closest(".player-card-small, .Rplayer-card-small");
    const targetName = card.dataset.username;

    const message = prompt(`Whisper to ${targetName}:`);

    if (!message || message.trim() === "") {
      return;
    }

    sendToServer({
      type: "whisper",
      to: targetName,
      from: username,
      message: message.trim()
    });

    return;
  }

  const diceButton = event.target.closest(".dice");

  if (diceButton) {
    const card = diceButton.closest(".player-card-small, .Rplayer-card-small");

    if (!card) {
      return;
    }

    const cardUsername = card.dataset.username;

    if (cardUsername !== username) {
      alert("You can only roll for yourself.");
      return;
    }

    sendToServer({
      type: "roll"
    });
  }
});

initiativeStartButton.addEventListener("click", function () {
  if (userType !== "dm") {
    alert("Only the DM can start initiative.");
    return;
  }

  sendToServer({
    type: "initiative_start"
  });
});

initiativeEndButton.addEventListener("click", function () {
  if (userType !== "dm") {
    alert("Only the DM can end initiative.");
    return;
  }

  sendToServer({
    type: "initiative_end"
  });
});

chatForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const message = chatInput.value.trim();

  if (message === "") {
    return;
  }
  sendToServer({
    type: "broadcast",
    from: username,
    message: `${username}: ${message}`
  });

  chatInput.value = "";
});

popupBg.addEventListener("click", function (event) {
  if (event.target === popupBg) {
    popupBg.classList.remove("show");
    delete popupBox.dataset.username;
  }
});

window.addEventListener("beforeunload", function () {
  if (socket.readyState === WebSocket.OPEN) {
    sendToServer({
      type: "quit"
    });
  }
});

function addChatMessage(sender, message) {
  if (!chatMessages) {
    return;
  }

  const p = document.createElement("p");
  p.textContent = `${sender}: ${message}`;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateRollFromServerMessage(message) {
  if (typeof message !== "string") {
    return;
  }

  const trimmed = message.trim();
  let rolledUsername = username;
  let roll = null;
  let isInitiativeRoll = false;

  let match = trimmed.match(/^(.+?) rolled a (\d+) for initiative$/i);
  if (match) {
    rolledUsername = match[1].trim();
    roll = match[2];
    isInitiativeRoll = true;
  }

  if (!match) {
    match = trimmed.match(/^(.+?) rolled a (\d+)$/i);
    if (match) {
      rolledUsername = match[1].trim();
      roll = match[2];
      isInitiativeRoll = false;
    }
  }

  if (!match) {
    match = trimmed.match(/^rolled a (\d+) for initiative$/i);
    if (match) {
      rolledUsername = username;
      roll = match[1];
      isInitiativeRoll = true;
    }
  }

  if (!match) {
    match = trimmed.match(/^rolled a (\d+)$/i);
    if (match) {
      rolledUsername = username;
      roll = match[1];
      isInitiativeRoll = false;
    }
  }

  if (!roll) {
    return;
  }


  diceResults[rolledUsername] = roll;

  if (isInitiativeRoll) {
    initiativeRolls[rolledUsername] = Number(roll);
    updateInitiativeRanks();
    forceRefreshAllPlayerDisplays();
  }
  updateCardRollDisplay(rolledUsername);
}

function updateInitiativeOrder(order) {
  order.forEach(function (item) {
    const name = item[0];
    const roll = Number(item[1]);

    initiativeRolls[name] = roll;
    diceResults[name] = String(roll);
  });

  updateInitiativeRanks();
  forceRefreshAllPlayerDisplays();
}

function getAvatarForUser(name) {
  if (isDM(name)) {
    return dmAvatarFile;
  }

  const playerOnlyList = connectedUsers
    .filter(function (connectedName) {
      return !isDM(connectedName);
    })
    .sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

  const userIndex = playerOnlyList.indexOf(name);

  if (userIndex === -1) {
    return playerAvatars[0];
  }

  const avatarIndex = userIndex % playerAvatars.length;

  return playerAvatars[avatarIndex];
}

function cssEscape(value) {
  return String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}




function updateInitiativeRanks() {
  const sorted = Object.entries(initiativeRolls).sort(function (a, b) {
    return b[1] - a[1];
  });

  sorted.forEach(function (item, index) {
    const name = item[0];
    const rank = index + 1;

    initiativeResults[name] = rank;

    const card = document.querySelector(
      `[data-username="${cssEscape(name)}"]`
    );

    if (!card) {
      return;
    }

    const initBox = card.querySelector(".init, .Rinit");

    if (initBox) {
      initBox.textContent = rank;
      initBox.title = `Initiative order #${rank}, roll ${item[1]}`;
    }
  });
}

function updateCardRollDisplay(name) {
  const card = document.querySelector(
    `[data-username="${cssEscape(name)}"]`
  );

  if (!card) {
    return;
  }

  const rollResult = card.querySelector(".roll-result");

  if (rollResult) {
    rollResult.textContent = diceResults[name] ?? "";
  }

  const initBox = card.querySelector(".init, .Rinit");

  if (initBox) {
    initBox.textContent = initiativeResults[name] ?? "-";
  }
}

function shouldShowServerMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  const trimmed = message.trim();
  const lowerMessage = trimmed.toLowerCase();

  if (lowerMessage === "broadcast sent") {
    return false;
  }
  if (isDiceRollMessage(trimmed)) {
    return false;
  }
  

  return true;
}

function isDiceRollMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  const trimmed = message.trim();

  return (
    /^.+? rolled a \d+$/i.test(trimmed) ||
    /^.+? rolled a \d+ for initiative$/i.test(trimmed) ||
    /^rolled a \d+$/i.test(trimmed) ||
    /^rolled a \d+ for initiative$/i.test(trimmed)
  );
}

function forceRefreshAllPlayerDisplays() {
  Object.keys(diceResults).forEach(function (name) {
    updateCardRollDisplay(name);
  });

  Object.keys(initiativeResults).forEach(function (name) {
    updateCardRollDisplay(name);
  });
}

function handleInitiativeOrderMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  if (!message.startsWith("Initiative order:")) {
    return false;
  }

  const order = parseInitiativeOrderMessage(message);

  if (order.length === 0) {
    return false;
  }

  updateInitiativeOrder(order);
  return true;
}

function parseInitiativeOrderMessage(message) {
  const order = [];
  const regex = /\d+\.\s+(.+?)\s+\(roll:\s*(\d+)\)/gi;

  let match;

  while ((match = regex.exec(message)) !== null) {
    const name = match[1].trim();
    const roll = Number(match[2]);

    order.push([name, roll]);
  }

  return order;
}

function changePlayerHPOnServer(targetName, amount) {
  sendToServer({
    type: "change_hp",
    target_player: targetName,
    amount: amount
  });
}



function handleHPServerMessage(message, shouldSync = false) {
  if (typeof message !== "string") {
    return false;
  }

  const changeMatch = message.match(
    /HP (healed|deducted) from (.+)\. Current HP: (\d+)\/(\d+)/
  );

  if (changeMatch) {
    const targetName = changeMatch[2].trim();
    const hp = Number(changeMatch[3]);
    const maxHp = Number(changeMatch[4]);

    playerHP[targetName] = hp;
    playerMaxHP[targetName] = maxHp;
    updateCardHPDisplay(targetName);

    refreshOpenPopupIfNeeded(targetName);

    addChatMessage("Server", message);

    return true;
  }

  if (message.startsWith("All players HP:")) {
    parseAllHPMessage(message);
    refreshAllHPDisplays();
    return true;
  }
  return false;
}

function parseAllHPMessage(message) {
  const lines = message.split("\n");

  lines.forEach(function (line) {
    const match = line.match(/^(.+):\s*(\d+)\/(\d+)\s*HP$/);

    if (!match) {
      return;
    }

    const name = match[1].trim();
    const hp = Number(match[2]);
    const maxHp = Number(match[3]);

    playerHP[name] = hp;
    playerMaxHP[name] = maxHp;
  });
}

function refreshOpenPopupIfNeeded(targetName) {
  if (!popupBox || !popupBox.dataset.username) {
    return;
  }

  if (!popupBg.classList.contains("show")) {
    return;
  }

  if (popupBox.dataset.username === targetName) {
    openPlayerPopup(targetName);
  }
}

function requestHPFromServer() {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  sendToServer({
    type: "check_hp"
  });
}


function openPlayerPopup(selectedUsername) {
  const hp = playerHP[selectedUsername] ?? 100;
  const maxHp = playerMaxHP[selectedUsername] ?? 100;
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const canEditHP = isDM(username);

  popupBox.innerHTML = `
    <button
      class="close-popup"
      type="button"
    >
      X
    </button>

    <img
      class="popup-avatar"
      src="${getAvatarForUser(selectedUsername)}"
      alt="${escapeHtml(selectedUsername)} avatar"
    >

    <h2>${escapeHtml(selectedUsername)}</h2>

    <div class="hp-section">
      <div class="hp-label">
        HP: <span id="hpValue">${hp}</span> / ${maxHp}
      </div>

      <div class="hp-bar">
        <div
          class="hp-fill"
          style="width: ${hpPercent}%"
        ></div>
      </div>

      ${
        canEditHP
          ? `
            <div class="hp-controls">
              <button class="hp-btn" data-hp-change="-10" type="button">-10</button>
              <button class="hp-btn" data-hp-change="-1" type="button">-1</button>

              <button class="hp-btn" data-hp-change="1" type="button">+1</button>
              <button class="hp-btn" data-hp-change="10" type="button">+10</button>
            </div>
          `
          : `
            <p class="hp-readonly">
              Only the DM can edit HP.
            </p>
          `
      }
    </div>
  `;

  popupBox.dataset.username = selectedUsername;
  popupBg.classList.add("show");
}


function getHPBarHTML(name) {
  const hp = playerHP[name] ?? 100;
  const maxHp = playerMaxHP[name] ?? 100;
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  return `
    <div class="card-hp">
      <div class="card-hp-label">
        HP: <span class="card-hp-value">${hp}</span>/<span class="card-max-hp-value">${maxHp}</span>
      </div>

      <div class="card-hp-bar">
        <div
          class="card-hp-fill"
          style="width: ${hpPercent}%"
        ></div>
      </div>
    </div>
  `;
}

function updateRollFromBroadcast(response) {
  if (!response) {
    return;
  }

  if (typeof response.message === "string") {
    updateRollFromServerMessage(response.message);
    return;
  }

  if (typeof response.dice !== "undefined") {
    diceResults[username] = String(response.dice);
    updateCardRollDisplay(username);
  }
}

function refreshAllHPDisplays() {
  Object.keys(playerHP).forEach(
    function (name) {
      updateCardHPDisplay(name);
    }
  );

  if (
    popupBox &&
    popupBox.dataset.username
  ) {
    refreshOpenPopupIfNeeded(
      popupBox.dataset.username
    );
  }
}

function addRawChatMessage(message) {
  if (!chatMessages) {
    return;
  }

  const p = document.createElement("p");
  p.textContent = message;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
