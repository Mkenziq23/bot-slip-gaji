const qrCanvas = document.getElementById("qr");
const loading = document.getElementById("loading");
const statusDiv = document.getElementById("status");

let ws;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

/*
=====================================
WEBSOCKET CONNECT FUNCTION
=====================================
*/

function connectWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";

  const wsUrl = protocol + "//" + location.host;

  console.log("[WS] Connecting:", wsUrl);

  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ke Server...';

  statusDiv.classList.remove("connected", "error");

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(wsUrl);

  /*
  =====================================
  ON OPEN
  =====================================
  */

  ws.onopen = () => {
    console.log("[WS] Connected");

    reconnectAttempts = 0;

    statusDiv.innerHTML = '<i class="fas fa-qrcode"></i> Menunggu QR Code...';
  };

  /*
  =====================================
  ON MESSAGE (DIPERBAIKI - MENERIMA USER_ID)
  =====================================
  */

  ws.onmessage = async (e) => {
    try {
      const data = JSON.parse(e.data);

      console.log("[WS] Message:", data);

      /*
      ===============================
      QR RECEIVED
      ===============================
      */

      if (data.qr) {
        loading.style.display = "none";

        qrCanvas.style.display = "block";

        QRCode.toCanvas(qrCanvas, data.qr, {
          width: 250,
          margin: 2,
        });

        statusDiv.innerHTML = '<i class="fas fa-qrcode"></i> Scan QR Code dengan WhatsApp';

        statusDiv.classList.remove("connected", "error");
      }

      /*
      ===============================
      LOGIN SUCCESS (DIPERBAIKI - KIRIM USER_ID)
      ===============================
      */

      if (data.status === "connected") {
        console.log("[WS] Login success:", data.number, "User ID:", data.user_id);

        statusDiv.classList.add("connected");

        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Login berhasil! Mengalihkan...';

        try {
          // KIRIM number DAN user_id KE SERVER
          const res = await fetch("/set-number", {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            credentials: "include",

            body: JSON.stringify({
              number: data.number,
              user_id: data.user_id, // <-- TAMBAHKAN INI
            }),
          });

          const result = await res.json();

          if (res.ok && result.success) {
            console.log("[SESSION] Saved with user_id:", data.user_id);

            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 1200);
          } else {
            console.error("[SESSION ERROR]", result);

            showErrorAndReload("Gagal menyimpan session");
          }
        } catch (err) {
          console.error("[FETCH ERROR]", err);

          showErrorAndReload("Koneksi gagal");
        }
      }

      /*
      ===============================
      NOT REGISTERED
      ===============================
      */

      if (data.status === "not_registered") {
        console.log("[WS] Number not registered");

        statusDiv.classList.add("error");

        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Nomor belum terdaftar. Hubungi admin.';

        setTimeout(reloadPage, 3000);
      }

      /*
      ===============================
      FORCE LOGOUT
      ===============================
      */

      if (data.status === "force_logout") {
        console.log("[WS] Force logout detected");

        statusDiv.classList.add("error");

        statusDiv.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sesi WhatsApp berakhir. Scan ulang QR.';

        setTimeout(reloadPage, 2000);
      }
    } catch (err) {
      console.error("[WS MESSAGE ERROR]", err);
    }
  };

  /*
  =====================================
  ON ERROR
  =====================================
  */

  ws.onerror = (err) => {
    console.error("[WS ERROR]", err);

    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Koneksi error, mencoba ulang...';
  };

  /*
  =====================================
  ON CLOSE
  =====================================
  */

  ws.onclose = () => {
    console.warn("[WS CLOSED]");

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;

      statusDiv.innerHTML = `<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ulang (${reconnectAttempts}/${maxReconnectAttempts})...`;

      setTimeout(connectWS, 3000);
    } else {
      statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Gagal koneksi. Refresh halaman.';
    }
  };
}

/*
=====================================
HELPER FUNCTIONS
=====================================
*/

function reloadPage() {
  location.reload();
}

function showErrorAndReload(msg) {
  statusDiv.classList.add("error");

  statusDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${msg}`;

  setTimeout(reloadPage, 2000);
}

/*
=====================================
START CONNECTION
=====================================
*/

connectWS();
