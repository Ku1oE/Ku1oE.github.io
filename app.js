const approvedDMs = [
  "Eli",
  "The DM"
];

function isDM(name) {
  return approvedDMs.some(function (dmName) {
    return dmName.toLowerCase() === name.toLowerCase();
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
let lastInitiativeOrderMessage = "";
let pendingHiddenWhisperResponses = 0;
const playerHP = {};
const playerMaxHP = {};


if (username === "") {
  connectionStatus.textContent = "Username is required";
  throw new Error("Username is required");
}

// const websocketHost = window.location.host.replace("-8000.", "-8080.");
// const websocketUrl = `wss://${websocketHost}`;

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
  const response = JSON.parse(event.data);

  console.log("Server response:", response);

  /*
    Completely hide internal sync messages on BOTH sides:
    - receiver side
    - sender side if the server echoes the whisper back
  */
  if (isHiddenSyncMessage(response.message)) {
    if (response.message.startsWith("__ROLL_SYNC__|")) {
      handleRollSyncMessage(response.message);
    }

    if (response.message.startsWith("__CHAT_SYNC__|")) {
      handleChatSyncMessage(response.message);
    }

    if (response.message.startsWith("__INIT_SYNC__|")) {
      handleInitiativeSyncMessage(response.message);
    }

    if (response.message.startsWith("__HP_SYNC__|")) {
      handleHPSyncMessage(response.message);
    }

    return;
  }

  if (response.type === "response") {
    connectionStatus.textContent = `Connected as ${username} (${userType})`;

    if (Array.isArray(response.message)) {
      connectedUsers = response.message;
      displayPlayers();
      return;
    }

    /*
      Update dice/initiative UI from server roll messages,
      but do not print normal dice roll messages in chat.
    */
    updateRollFromServerMessage(response.message);
    handleInitiativeOrderMessage(response.message, true);

    /*
      Show server messages, except dice-roll sync / normal dice-roll messages.
    */
    if (handleHPServerMessage(response.message, true)) {
      return;
    }

    if (shouldShowServerMessage(response.message)) {
      addChatMessage("Server", response.message);
    }

    return;
  }

  if (response.type === "message") {
    /*
      Hidden dice sync message.
      Updates dice UI but does NOT show in chat.
    */
    if (handleRollSyncMessage(response.message)) {
      return;
    }

    /*
      Hidden chat sync message.
      Shows as normal chat, not whisper.
    */
    if (handleChatSyncMessage(response.message)) {
      return;
    }

    /*
      Real whispers only.
    */
    addChatMessage(`Whisper from ${response.from}`, response.message);
    return;
  }

  if (response.type === "broadcast") {
    updateRollFromServerMessage(response.message);
    handleInitiativeOrderMessage(response.message, true);

    if (response.initiative_order) {
      updateInitiativeOrder(response.initiative_order);
    }

    if (shouldShowServerMessage(response.message)) {
      addChatMessage("Server", response.message);
    }

    return;
  }

  if (response.type === "error") {
    connectionStatus.textContent = `Server error: ${response.message}`;

    if (shouldShowServerMessage(response.message)) {
      addChatMessage("Server Error", response.message);
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
      <div class="avatar-action-block">
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

        <div class="avatar-action-block">
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

  /*
    Do not use server broadcast here because it is not syncing properly.
    Instead, show it locally and send hidden chat-sync whispers to everyone else.
  */
  addChatMessage(username, message);
  syncChatToOthers(username, message);

  chatInput.value = "";
});

popupBg.addEventListener("click", function (event) {
  if (event.target === popupBg) {
    popupBg.classList.remove("show");
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

  /*
    Supports:
    "Gray rolled a 10"
    "Gray rolled a 10 for initiative"
    "You rolled a 10"
    "You rolled a 10 for initiative"
    "rolled a 10"
    "rolled a 10 for initiative"
  */
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

  /*
    Important fix:
    If the server says "You rolled a 10",
    save it under the actual username, not "You".
  */
  if (rolledUsername.toLowerCase() === "you") {
    rolledUsername = username;
  }

  diceResults[rolledUsername] = roll;

  if (isInitiativeRoll) {
    initiativeRolls[rolledUsername] = Number(roll);
    updateInitiativeRanks();
    forceRefreshAllPlayerDisplays();
  }

  updateCardRollDisplay(rolledUsername);

  /*
    If this client is the roller, sync the readable roll message to everyone else.
  */
  if (rolledUsername === username) {
    syncRollToOthers(rolledUsername, roll, isInitiativeRoll);
  }
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

function syncRollToOthers(rolledUsername, roll, isInitiativeRoll) {
  connectedUsers.forEach(function (targetName) {
    if (targetName === username) {
      return;
    }

    const rollMessage = isInitiativeRoll
      ? `${rolledUsername} rolled a ${roll} for initiative`
      : `${rolledUsername} rolled a ${roll}`;


    pendingHiddenWhisperResponses++;

    sendToServer({
      type: "whisper",
      to: targetName,
      from: username,
      message: `__CHAT_SYNC__|${rolledUsername}|${encodeURIComponent(rollMessage)}`
    });
  });
}

function handleRollSyncMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  if (!message.startsWith("__ROLL_SYNC__|")) {
    return false;
  }

  const parts = message.split("|");

  const rolledUsername = parts[1];
  const roll = parts[2];
  const rollType = parts[3];

  diceResults[rolledUsername] = roll;

  if (rollType === "initiative") {
    initiativeRolls[rolledUsername] = Number(roll);
    updateInitiativeRanks();
  }

  updateCardRollDisplay(rolledUsername);

  return true;
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

function syncChatToOthers(senderName, message) {
  connectedUsers.forEach(function (targetName) {
    if (targetName === username) {
      return;
    }

    pendingHiddenWhisperResponses++;

    sendToServer({
      type: "whisper",
      to: targetName,
      from: username,
      message: `__CHAT_SYNC__|${senderName}|${encodeURIComponent(message)}`
    });
  });
}

function handleChatSyncMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  if (!message.startsWith("__CHAT_SYNC__|")) {
    return false;
  }

  const parts = message.split("|");

  const senderName = parts[1];
  const chatMessage = decodeURIComponent(parts[2] || "");

  /*
    If the synced chat message is a dice roll,
    update the dice UI too.
  */
  if (isDiceRollMessage(chatMessage)) {
    updateRollFromServerMessage(chatMessage);
  }

  addChatMessage(senderName, chatMessage);

  return true;
}


function shouldShowServerMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  const trimmed = message.trim();
  const lowerMessage = trimmed.toLowerCase();

  /*
    Hide hidden sync messages.
  */
  if (trimmed.startsWith("__ROLL_SYNC__|")) {
    return false;
  }

  if (trimmed.startsWith("__CHAT_SYNC__|")) {
    return false;
  }

  if (trimmed.startsWith("__HP_SYNC__|")) {
    return false;
  }

  /*
    Hide server confirmation after whisper sync.
    This removes:
    "Whisper sent to Eli"
  */
  if (lowerMessage.startsWith("whisper sent to")) {
    if (pendingHiddenWhisperResponses > 0) {
      pendingHiddenWhisperResponses--;
      return false;
    }

    return true;
  }

  /*
    Show everything else, including:
    "asdsasadds rolled a 17"
  */
  return true;
}

function isHiddenSyncMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  return (
    message.startsWith("__ROLL_SYNC__|") ||
    message.startsWith("__CHAT_SYNC__|") ||
    message.startsWith("__INIT_SYNC__|") ||
    message.startsWith("__HP_SYNC__|")
  );
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

function handleInitiativeOrderMessage(message, shouldSync) {
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

  /*
    Avoid syncing the same initiative order again and again.
  */
  if (shouldSync && message !== lastInitiativeOrderMessage) {
    lastInitiativeOrderMessage = message;
    syncInitiativeOrderToOthers(message);
  }

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

function syncInitiativeOrderToOthers(orderMessage) {
  connectedUsers.forEach(function (targetName) {
    if (targetName === username) {
      return;
    }

    pendingHiddenWhisperResponses++;

    sendToServer({
      type: "whisper",
      to: targetName,
      from: username,
      message: `__INIT_SYNC__|${encodeURIComponent(orderMessage)}`
    });
  });
}

function handleInitiativeSyncMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  if (!message.startsWith("__INIT_SYNC__|")) {
    return false;
  }

  const encodedOrderMessage = message.split("|")[1] || "";
  const orderMessage = decodeURIComponent(encodedOrderMessage);

  if (orderMessage === lastInitiativeOrderMessage) {
    return true;
  }

  lastInitiativeOrderMessage = orderMessage;

  handleInitiativeOrderMessage(orderMessage, false);
  addChatMessage("Server", orderMessage);

  return true;
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

  /*
    Matches:
    "10 HP deducted from Joshua. Current HP: 90/100"
    "5 HP healed from Joshua. Current HP: 95/100"
  */
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

    /*
      DM receives the real server response,
      then secretly syncs HP to everyone else.
    */
    if (shouldSync) {
      syncHPToOthers(targetName, hp, maxHp, message);
    }

    return true;
  }

  /*
    Matches check_hp:
    All players HP:
    Joshua: 90/100 HP
    Eli: 100/100 HP
  */
  if (message.startsWith("All players HP:")) {
    parseAllHPMessage(message);
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

      ${canEditHP
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

function syncHPToOthers(targetName, hp, maxHp, serverMessage) {
  connectedUsers.forEach(function (receiverName) {
    if (receiverName === username) {
      return;
    }

    pendingHiddenWhisperResponses++;

    sendToServer({
      type: "whisper",
      to: receiverName,
      from: username,
      message: `__HP_SYNC__|${encodeURIComponent(targetName)}|${hp}|${maxHp}|${encodeURIComponent(serverMessage)}`
    });
  });
}

function handleHPSyncMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  if (!message.startsWith("__HP_SYNC__|")) {
    return false;
  }

  const parts = message.split("|");

  const targetName = decodeURIComponent(parts[1] || "");
  const hp = Number(parts[2]);
  const maxHp = Number(parts[3]);
  const serverMessage = decodeURIComponent(parts[4] || "");

  if (!targetName || !Number.isFinite(hp) || !Number.isFinite(maxHp)) {
    return true;
  }

  playerHP[targetName] = hp;
  playerMaxHP[targetName] = maxHp;
  updateCardHPDisplay(targetName);

  refreshOpenPopupIfNeeded(targetName);

  if (serverMessage) {
    addChatMessage("Server", serverMessage);
  }

  return true;
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
