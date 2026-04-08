const qrCanvas = document.getElementById("qr");
const loading = document.getElementById("loading");
const statusDiv = document.getElementById("status");

let ws;
let otpTimer = null;
let currentPhone = null;
let isOtpRequested = false;

// Handle button - satu button untuk dua fungsi
async function handleAction() {
  if (!isOtpRequested) {
    await requestOTP();
  } else {
    await submitOTP();
  }
}

// Request OTP
async function requestOTP() {
  let numberInput = document.getElementById("phone-number").value.trim();

  if (!numberInput) {
    showMessage("Masukkan nomor WhatsApp", true);
    return;
  }

  let cleanNumber = numberInput.replace(/\D/g, "");
  if (cleanNumber.startsWith("0")) cleanNumber = cleanNumber.substring(1);

  if (cleanNumber.length < 10 || cleanNumber.length > 13) {
    showMessage("Nomor harus 10-13 digit setelah 62", true);
    return;
  }

  const fullNumber = "62" + cleanNumber;
  currentPhone = fullNumber;

  const btn = document.getElementById("action-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Memproses...';

  try {
    const res = await fetch("/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: fullNumber }),
    });

    const data = await res.json();

    if (data.success) {
      document.getElementById("displayed-otp").textContent = data.otp;
      document.getElementById("otp-section").style.display = "block";
      document.getElementById("phone-number").disabled = true;

      btn.className = "btn btn-success";
      btn.innerHTML = '<i class="fas fa-check-circle"></i> SUBMIT';
      btn.disabled = false;
      isOtpRequested = true;

      showMessage("Kode OTP sudah dibuat! Masukkan kode OTP", false);
      startTimer(120);
      document.getElementById("otp-code").focus();
    } else {
      showMessage(data.message, true);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Minta Kode OTP';
    }
  } catch (err) {
    console.error("Request OTP error:", err);
    showMessage("Terjadi kesalahan", true);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Minta Kode OTP';
  }
}

// Submit OTP
async function submitOTP() {
  const otpCode = document.getElementById("otp-code").value.trim();

  if (!otpCode || otpCode.length !== 6) {
    showMessage("Masukkan 6 digit kode OTP", true);
    return;
  }

  const btn = document.getElementById("action-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Verifikasi...';

  try {
    const res = await fetch("/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: currentPhone, otpCode }),
    });

    const data = await res.json();

    if (data.success) {
      showMessage("Login berhasil! Menyambungkan ke WhatsApp...", false);
      statusDiv.classList.add("connected");
      statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Login Berhasil, mengalihkan...';

      if (otpTimer) clearInterval(otpTimer);

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } else {
      showMessage(data.message, true);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> SUBMIT';
      document.getElementById("otp-code").value = "";
      document.getElementById("otp-code").focus();
    }
  } catch (err) {
    console.error("Submit OTP error:", err);
    showMessage("Terjadi kesalahan", true);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check-circle"></i> SUBMIT';
  }
}

// Timer 2 menit
function startTimer(seconds) {
  let timeLeft = seconds;
  const timerDiv = document.getElementById("timer");
  if (otpTimer) clearInterval(otpTimer);

  otpTimer = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(otpTimer);
      timerDiv.innerHTML = '<i class="fas fa-hourglass-end"></i> Kode kadaluarsa, minta ulang';
      const btn = document.getElementById("action-btn");
      btn.className = "btn btn-primary";
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Minta Kode OTP';
      btn.disabled = false;
      document.getElementById("phone-number").disabled = false;
      document.getElementById("otp-section").style.display = "none";
      isOtpRequested = false;
    } else {
      const minutes = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      timerDiv.innerHTML = `<i class="fas fa-clock"></i> Berlaku: ${minutes}:${secs.toString().padStart(2, "0")}`;
      timeLeft--;
    }
  }, 1000);
}

function showMessage(msg, isError) {
  const msgDiv = document.getElementById("otp-message");
  msgDiv.innerHTML = `<div class="${isError ? "error-message" : "success-message"}">${msg}</div>`;
  setTimeout(() => (msgDiv.innerHTML = ""), 3000);
}

function switchTab(tab, el) {
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  el.classList.add("active");

  document.getElementById("qr-tab").classList.remove("active");
  document.getElementById("otp-tab").classList.remove("active");

  if (tab === "qr") {
    document.getElementById("qr-tab").classList.add("active");
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWS();
    }
  } else {
    document.getElementById("otp-tab").classList.add("active");
    if (ws) {
      ws.close();
    }
    resetOTP();
  }
}

function resetOTP() {
  document.getElementById("phone-number").value = "";
  document.getElementById("phone-number").disabled = false;
  document.getElementById("otp-code").value = "";
  document.getElementById("otp-section").style.display = "none";
  const btn = document.getElementById("action-btn");
  btn.className = "btn btn-primary";
  btn.innerHTML = '<i class="fas fa-paper-plane"></i> Minta Kode OTP';
  if (otpTimer) clearInterval(otpTimer);
  isOtpRequested = false;
}

// Auto submit when OTP reaches 6 digits
document.getElementById("otp-code")?.addEventListener("input", function (e) {
  this.value = this.value.replace(/[^0-9]/g, "");
  if (this.value.length === 6 && isOtpRequested) submitOTP();
});

// Enter key submit
document.getElementById("otp-code")?.addEventListener("keypress", function (e) {
  if (e.key === "Enter" && isOtpRequested) submitOTP();
});

// QR WebSocket
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${location.host}`;

  console.log("Connecting to WebSocket:", wsUrl);
  statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ke Server...';

  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
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
      }

      if (data.status === "connected") {
        statusDiv.classList.add("connected");
        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Login Berhasil! Mengalihkan...';

        const res = await fetch("/set-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: data.number }),
        });

        if (res.ok) {
          setTimeout(() => (window.location.href = "/dashboard"), 1500);
        }
      }

      if (data.status === "not_registered") {
        statusDiv.classList.add("error");
        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Nomor belum terdaftar';
        setTimeout(() => (window.location.href = "/404.html"), 2000);
      }

      if (data.status === "force_logout") {
        statusDiv.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sesi berakhir, scan ulang QR';
        setTimeout(() => location.reload(), 2000);
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Koneksi error';
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
    if (document.getElementById("qr-tab").classList.contains("active")) {
      statusDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menghubungkan ulang...';
      setTimeout(connectWS, 3000);
    }
  };
}

// Initialize WebSocket
if (document.getElementById("qr-tab").classList.contains("active")) {
  connectWS();
}
