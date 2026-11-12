
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const result = document.getElementById("result");

const CODE_PAGES = {
  TopLinks: "https://toplinks.io/ataRjVk",
  Link4m: "https://link4m.org/go/OPZeU",
  Traffic19: "https://traffic19.com/w13PJjsgO"
};

let redirectTimer = null;

const STATUS = {
  success: ["KIỂM TRA THÀNH CÔNG", "success"],
  blocked: ["NHÀ CUNG CẤP GIỚI HẠN", "warning"],
  rate_limited: ["QUÁ NHIỀU YÊU CẦU", "warning"],
  manual_required: ["CẦN THAO TÁC THỦ CÔNG", "warning"],
  verification_required: ["CẦN XÁC MINH", "warning"],
  worker_unavailable: ["WORKER KHÔNG KHẢ DỤNG", "warning"],
  code_available: ["ĐÃ CÓ MÃ", "success"],
  unsupported: ["KHÔNG HỖ TRỢ HOẶC LINK LỖI", "error"]
};

function showText(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value ?? "";

  if (className) {
    element.className = className;
  }

  result.appendChild(element);
  return element;
}

function addLink(label, value) {
  if (!value) return;

  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) return;

    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    link.className = "result-link";

    result.appendChild(link);
  } catch {
    // Không hiển thị URL không hợp lệ.
  }
}

function validUrl(value) {
  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function copyText(value, element) {
  try {
    await navigator.clipboard.writeText(value);
    element.textContent = "✓ ĐÃ SAO CHÉP";
  } catch {
    element.textContent = "KHÔNG THỂ SAO CHÉP";
  }
}

function renderWorker(worker) {
  if (!worker) return;

  showText("h4", "TRẠNG THÁI WORKER");

  const workerStatus = {
    manual_required: "Cần bạn thao tác trực tiếp trên trang nhà cung cấp.",
    worker_unavailable: "Worker chưa kết nối hoặc chưa được cấu hình.",
    online: "Worker đang hoạt động.",
    success: "Worker đã kiểm tra trang."
  };

  showText(
    "p",
    workerStatus[worker.status] ||
      worker.message ||
      "Worker đã phản hồi."
  );
}

function renderHistory(history) {
  if (!Array.isArray(history) || !history.length) return;

  showText("h4", "LỊCH SỬ CHUYỂN HƯỚNG");

  history.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const heading = document.createElement("strong");
    heading.textContent =
      `${index + 1}. HTTP ${item.status} - ${item.method}`;

    const address = document.createElement("p");
    address.textContent = item.url || "Không có URL";

    row.append(heading, address);
    result.appendChild(row);
  });

  showText("p", `Tổng số bước: ${history.length}`);
}

function renderResult(data, originalUrl) {
  result.replaceChildren();

  const status = STATUS[data.status] || STATUS.unsupported;

  showText("h3", status[0], "status-" + status[1]);
  showText("p", data.message || "Không có thông báo.");

  showText(
    "p",
    "Nhà cung cấp: " + (data.provider || "Không xác định")
  );

  if (data.version) {
    showText("p", "Phiên bản API: " + data.version);
  }

  // Chỉ hiển thị mã khi API chính thức trả về.
  if (data.status === "code_available" && data.code) {
    showText("h4", "MÃ XÁC MINH");

    showText("p", data.code, "verification-code");

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "SAO CHÉP MÃ";

    copyButton.addEventListener("click", () => {
      copyText(data.code, copyButton);
    });

    result.appendChild(copyButton);
  }

  // Hiển thị địa chỉ chuyển hướng.
  const destination = data.destination;

  if (destination && destination !== originalUrl) {
    showText("h4", "ĐỊA CHỈ CHUYỂN HƯỚNG");
    showText("p", destination);
    addLink("MỞ ĐỊA CHỈ ↗", destination);
  } else {
    addLink("MỞ TRANG NHÀ CUNG CẤP ↗", originalUrl);
  }

  renderWorker(data.worker);
  renderHistory(data.history);

  // Chuyển tới trang lấy mã đã cấu hình cho đúng nhà cung cấp.
  const codePage = CODE_PAGES[data.provider];
  if (codePage && data.status !== "unsupported") {
    showText("p", "Đang chuyển đến trang lấy mã trong 3 giây...");
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "HỦY CHUYỂN HƯỚNG";
    cancelButton.addEventListener("click", () => {
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = null;
      cancelButton.textContent = "ĐÃ HỦY CHUYỂN HƯỚNG";
      cancelButton.disabled = true;
    });
    result.appendChild(cancelButton);
    if (redirectTimer) clearTimeout(redirectTimer);
    redirectTimer = setTimeout(() => {
      window.location.assign(codePage);
    }, 3000);
  }

  if (data.status !== "code_available") {
    showText(
      "p",
      "AUTO LINK PRO không tự vượt quảng cáo hoặc xác minh. " +
      "Hãy mở trang nhà cung cấp để tiếp tục nếu cần."
    );
  }
}

paste.addEventListener("click", async () => {
  try {
    input.value = await navigator.clipboard.readText();
    input.focus();
  } catch {
    result.textContent =
      "Không thể đọc clipboard. Hãy sử dụng Ctrl + V.";
  }
});

button.addEventListener("click", async () => {
  const url = input.value.trim();

  if (!validUrl(url)) {
    result.textContent =
      "Vui lòng nhập đường dẫn HTTP hoặc HTTPS hợp lệ.";
    return;
  }

  button.disabled = true;
  button.textContent = "ĐANG PHÂN TÍCH...";
  result.textContent = "Đang kiểm tra liên kết...";

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || `Máy chủ trả về HTTP ${response.status}.`
      );
    }

    renderResult(data, url);

  } catch (error) {
    result.replaceChildren();
    showText("h3", "KHÔNG KẾT NỐI ĐƯỢC", "status-error");
    showText(
      "p",
      error.message || "Không thể kết nối máy chủ."
    );

  } finally {
    button.disabled = false;
    button.textContent = "✦ KIỂM TRA LIÊN KẾT →";
  }
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !button.disabled) {
    button.click();
  }
});
