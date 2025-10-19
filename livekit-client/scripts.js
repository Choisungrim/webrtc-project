import {
  Room,
  RoomEvent,
  VideoPresets,
  createLocalTracks,
} from "livekit-client";

/**msg example = types // "chat" | "command" | "telemetry" | "status"
{
  "room": "robot-01",     
  "sender": "robot-01",  
  "type": "chat",        
  "payload": {
    "text": "Move forward 2m",    
    "battery": 87,               
    "location": [37.5665, 126.9780] 
  },
  "timestamp": 1712345678901
}**/
// const LIVEKIT_URL = "wss://webrtctest-hdcsqoeo.livekit.cloud"; // cloudService

const LIVEKIT_URL = "wss://livekit.host.com"; //docker self-hosting
const NESTJS_BASE_URL = "https://172.30.1.48:8181";
const userName = "User-" + Math.floor(Math.random() * 1000);
const socket = io(`${NESTJS_BASE_URL}/ws`, {
  transports: ["websocket"],
  auth: { userName },
});

let waitingEl;
let messageContainerEl, messageInput, sendButton;
let tracksContainerEl;

let room;

const fetchAccessToken = async (roomName) => {
  const url = `${NESTJS_BASE_URL}/livekit/token?room=${roomName}&username=${userName}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(data);
    if (data.token) {
      return data.token;
    }
    throw new Error(data.error || "토큰 획득 실패");
  } catch (error) {
    console.error("토큰 획득 오류:", error);
    alert(
      "액세스 토큰을 가져오는 데 실패했습니다. NestJS 서버 주소와 포트를 확인하세요."
    );
    throw error;
  }
};

async function startCall(roomName) {
  try {
    waitingEl.textContent = "액세스 토큰을 가져오는 중...";

    const token = await fetchAccessToken(roomName);
    room = new Room();
    setupRoomListeners(room);

    waitingEl.textContent = "LiveKit Room에 연결 중...";

    await room.connect(LIVEKIT_URL, token);
    console.log("LiveKit Room에 연결되었습니다:", room.name);
    console.log("기본 참가자 정보:", room.localParticipant);
    console.log("socket 연결 상태:", socket.connected);
    socket.emit("joinRoom", { room: room.name, sender: userName });
    waitingEl.textContent = "로컬 미디어를 퍼블리싱하는 중...";

    await publishLocalMedia(room);

    waitingEl.textContent = "다른 참가자를 기다리는 중...";
  } catch (err) {
    console.error("LiveKit 연결 오류:", err);
    alert("LiveKit 연결 중 오류가 발생했습니다: " + err.message);
    if (room) {
      room.disconnect();
    }
    waitingEl.textContent = "연결 실패. 콘솔을 확인하세요.";
  }
}

const publishLocalMedia = async (room) => {
  try {
    const tracks = await createLocalTracks({
      audio: true,
      video: {
        facingMode: "user",
        ...VideoPresets.h720,
      },
    });

    for (const track of tracks) {
      attachTrackToParticipantBox(track, room.localParticipant);

      await room.localParticipant.publishTrack(track);
      console.log("로컬 트랙 퍼블리싱 완료:", track.kind);
    }
  } catch (e) {
    alert("카메라/마이크 접근 권한이 필요합니다: " + e.message);
    throw e;
  }
};

/**
 * LiveKit Room을 통해 데이터를 전송합니다.
 * @param {string} message 전송할 텍스트 메시지
 */
const sendDataMessage = (rawMessage) => {
  if (!room || room.state !== "connected") {
    console.warn("Room에 연결되어 있지 않아 데이터를 보낼 수 없습니다.");
    return;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) return;

  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);

  room.localParticipant
    .publishData(data, { kind: "reliable" })
    .catch((e) => console.error("데이터 전송 실패:", e));

  displayMessage(`나: ${trimmed}`, "local");
  console.log("LiveKit DataChannel 전송:", trimmed);

  if (trimmed.startsWith("{")) {
    try {
      const msgObj = buildMsgObj(room, room.localParticipant, trimmed);
      socket.emit("message", msgObj);
      console.log("WebSocket emit(JSON) 완료:", msgObj);
    } catch (e) {
      console.warn("JSON emit 실패, 포맷 오류:", e);
    }
  } else {
    console.log("String msg, WebSocket emit 생략");
  }
};

const displayMessage = (text, type) => {
  if (!messageContainerEl) return;

  const p = document.createElement("p");
  p.textContent = text;
  p.className = `my-1 p-1 rounded ${
    type === "local"
      ? "text-end bg-primary text-white"
      : "text-start bg-light text-dark"
  }`;
  messageContainerEl.appendChild(p);
  messageContainerEl.scrollTop = messageContainerEl.scrollHeight;
};

const setupRoomListeners = (room) => {
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    console.log(`트랙 구독됨: ${track.kind} from ${participant.identity}`);
    attachTrackToParticipantBox(track, participant);
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    console.log(`트랙 해제됨: ${track.kind} from ${participant.identity}`);
    detachTrackFromParticipantBox(participant);
  });

  room.on(RoomEvent.DataReceived, (payload, participant) => {
    const decoder = new TextDecoder();
    const message = decoder.decode(payload);

    console.log(`[DATA] ${participant.identity}로부터 메시지 수신: ${message}`);
    displayMessage(`${participant.identity}: ${message}`, "remote");
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log(`새 참가자 입장: ${participant.identity}`);
    waitingEl.textContent = `새 참가자(${participant.identity}) 입장! 미디어를 기다리는 중...`;
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    console.log(`참가자 퇴장: ${participant.identity}`);
    const box = document.getElementById(`participant-${participant.identity}`);
    if (box) {
      box.remove();
    }
    waitingEl.textContent = "다른 참가자를 기다리는 중...";
  });

  room.on(RoomEvent.Disconnected, () => {
    alert("LiveKit 연결이 종료되었습니다.");
    waitingEl.textContent = "연결 해제됨";
  });

  room.on(RoomEvent.Connected, () => {
    const localParticipant = room.localParticipant;

    if (localParticipant && localParticipant.publishedTracks) {
      for (const pub of localParticipant.publishedTracks.values()) {
        if (pub.track) {
          attachTrackToParticipantBox(pub.track, localParticipant);
        }
      }
    }

    if (room.participants && typeof room.participants.values === "function") {
      for (const p of room.participants.values()) {
        if (
          p.publishedTracks &&
          typeof p.publishedTracks.values === "function"
        ) {
          for (const pub of p.publishedTracks.values()) {
            if (pub.track) {
              attachTrackToParticipantBox(pub.track, p);
            }
          }
        }
      }
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const userNameEl = document.querySelector("#user-name");
  waitingEl = document.querySelector("#waiting");
  tracksContainerEl = document.querySelector("#participant-tracks-container");

  messageContainerEl = document.querySelector("#messages-container");
  messageInput = document.querySelector("#message-input");
  sendButton = document.querySelector("#send-message");

  const listRoomsBtn = document.querySelector("#list-rooms-btn");
  const joinRoomBtn = document.querySelector("#join-room-btn");
  const roomListUl = document.querySelector("#room-list");
  const joinRoomNameInput = document.querySelector("#join-room-name");
  const statusMessage = document.querySelector("#status-message");

  const roomManagementSection = document.querySelector(
    "#room-management-section"
  );
  const callActiveSection = document.querySelector("#call-active-section");

  if (userNameEl) {
    userNameEl.textContent = `사용자: ${userName}`;
  }

  async function handleJoinRoom(roomNameFromClick = null) {
    const roomName = roomNameFromClick || joinRoomNameInput.value.trim();
    if (!roomName) {
      statusMessage.textContent = "참여할 방 이름을 입력해 주세요.";
      return;
    }

    joinRoomBtn.disabled = true;
    listRoomsBtn.disabled = true;
    statusMessage.textContent = `"${roomName}" 룸 연결 중...`;

    try {
      await startCall(roomName);

      statusMessage.textContent = `"${roomName}" 룸에 성공적으로 연결되었습니다.`;
      roomManagementSection.style.display = "none";
      callActiveSection.style.display = "block";
      userNameEl.textContent = `사용자: ${userName} (방: ${roomName})`;
    } catch (error) {
      console.error("연결 실패:", error);
      statusMessage.textContent = `연결 실패: ${error.message}`;

      joinRoomBtn.disabled = false;
      listRoomsBtn.disabled = false;
    }
  }

  async function listAndDisplayRooms() {
    roomListUl.innerHTML =
      '<li class="list-group-item text-center">로딩 중...</li>';
    listRoomsBtn.disabled = true;

    try {
      const response = await fetch(`${NESTJS_BASE_URL}/livekit/rooms`);
      const rooms = await response.json();
      console.log(rooms);
      console.log(rooms.length);

      roomListUl.innerHTML = "";
      if (rooms.length === 0) {
        roomListUl.innerHTML =
          '<li class="list-group-item text-muted">현재 활성화된 룸이 없습니다.</li>';
        return;
      }

      rooms.forEach((room) => {
        const li = document.createElement("li");
        li.className =
          "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
            ${room.name} (${room.numParticipants}명)
            <button class="btn btn-sm btn-primary" data-room-name="${room.name}">참가</button>
        `;

        li.querySelector("button").addEventListener("click", (e) => {
          handleJoinRoom(e.target.dataset.roomName);
        });
        roomListUl.appendChild(li);
      });
    } catch (error) {
      console.error("룸 목록 조회 실패:", error);
      roomListUl.innerHTML = `<li class="list-group-item list-group-item-danger">룸 목록 조회에 실패했습니다: ${error.message}</li>`;
    } finally {
      listRoomsBtn.disabled = false;
    }
  }

  if (listRoomsBtn) {
    listRoomsBtn.addEventListener("click", listAndDisplayRooms);
  }

  if (joinRoomBtn) {
    joinRoomBtn.addEventListener("click", () => {
      handleJoinRoom();
    });
  }

  if (sendButton && messageInput) {
    const sendMessageHandler = () => {
      const message = messageInput.value.trim();
      if (message && room && room.state === "connected") {
        sendDataMessage(message);
        messageInput.value = "";
      } else if (!room || room.state !== "connected") {
        alert("연결된 상태에서만 메시지를 보낼 수 있습니다.");
      }
    };

    sendButton.addEventListener("click", sendMessageHandler);
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessageHandler();
      }
    });
  }

  listAndDisplayRooms();
});

function attachTrackToParticipantBox(track, participant) {
  let box = document.getElementById(`participant-${participant.identity}`);
  if (!box) {
    box = document.createElement("div");
    box.id = `participant-${participant.identity}`;
    box.className = "participant-box";

    const nameOverlay = document.createElement("div");
    nameOverlay.className = "participant-name-overlay";
    nameOverlay.textContent = participant.identity;

    box.appendChild(nameOverlay);
    tracksContainerEl.appendChild(box);
  }

  const mediaEl = track.attach();
  box.appendChild(mediaEl);

  if (participant.isLocal) {
    mediaEl.muted = true;
  }

  if (waitingEl) waitingEl.style.display = "none";
}

function detachTrackFromParticipantBox(participant) {
  if (!participant || typeof participant.getTracks !== "function") {
    console.warn(
      "Error: Invalid participant object or getTracks() method not found.",
      participant
    );
    return;
  }

  const remainingPublications = participant.getTracks() || [];
  const hasRemainingTracks = remainingPublications.some((pub) => pub.track);

  if (!hasRemainingTracks) {
    const box = document.getElementById(`box-${participant.sid}`);
    box?.remove();
  }
}

function buildMsgObj(room, participant, message) {
  let parsed;

  try {
    parsed = JSON.parse(message);
    if (!parsed.type || !parsed.payload) throw new Error("Invalid JSON schema");
  } catch {
    parsed = {
      type: "chat",
      payload: { text: message },
    };
  }

  return {
    room: room.name,
    sender: participant.identity,
    type: parsed.type,
    payload: parsed.payload,
    timestamp: parsed.timestamp || Date.now(),
  };
}
