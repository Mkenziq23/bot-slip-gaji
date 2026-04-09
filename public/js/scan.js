const qrCanvas = document.getElementById("qr");
const loading = document.getElementById("loading");
const statusDiv = document.getElementById("status");

let ws;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;

// QR WebSocket
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}`;

  console.log("Connecting to WebSocket:", wsUrl);
  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ke Server...';
  statusDiv.classList.remove("connected", "error");

  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  if (ws && ws.readyState === WebSocket.CONNECTING) {
    console.log("WebSocket already connecting...");
    return;
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    reconnectAttempts = 0;
    statusDiv.innerHTML = '<i class="fas fa-qrcode"></i> Menunggu QR Code...';
  };

  ws.onmessage = async (e) => {
    try {
      const data = JSON.parse(e.data);
      console.log("WebSocket message:", data);

      if (data.qr) {
        loading.style.display = "none";
        qrCanvas.style.display = "block";
        QRCode.toCanvas(qrCanvas, data.qr, { width: 250, margin: 2 });
        statusDiv.innerHTML = '<i class="fas fa-qrcode"></i> Scan QR Code dengan WhatsApp';
        statusDiv.classList.remove("connected", "error");
      }

      if (data.status === "connected") {
        console.log("QR Login success! Redirecting to dashboard...");
        statusDiv.classList.add("connected");
        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Login Berhasil! Mengalihkan...';

        // Set session via fetch
        try {
          const res = await fetch("/set-number", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number: data.number }),
          });

          if (res.ok) {
            const result = await res.json();
            if (result.success) {
              console.log("Session set successfully");
              setTimeout(() => {
                window.location.href = "/dashboard";
              }, 1500);
            } else {
              console.error("Failed to set session:", result);
              statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Gagal menyimpan session';
              setTimeout(() => location.reload(), 2000);
            }
          } else {
            console.error("Set number response not ok:", res.status);
            statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Gagal login, coba lagi';
            setTimeout(() => location.reload(), 2000);
          }
        } catch (err) {
          console.error("Set number error:", err);
          statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error koneksi, coba lagi';
          setTimeout(() => location.reload(), 2000);
        }
      }

      if (data.status === "not_registered") {
        console.log("Number not registered:", data.number);
        statusDiv.classList.add("error");
        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Nomor belum terdaftar. Hubungi admin.';
        setTimeout(() => {
          location.reload();
        }, 3000);
      }

      if (data.status === "force_logout") {
        statusDiv.classList.add("error");
        statusDiv.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sesi berakhir, scan ulang QR';
        setTimeout(() => location.reload(), 2000);
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Koneksi error, menghubungkan ulang...';
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      console.log(`Reconnecting attempt ${reconnectAttempts}/${maxReconnectAttempts}...`);
      statusDiv.innerHTML = `<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ulang (${reconnectAttempts}/${maxReconnectAttempts})...`;
      setTimeout(connectWS, 3000);
    } else {
      statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Gagal koneksi. Refresh halaman.';
    }
  };
}

// Initialize WebSocket
connectWS();
