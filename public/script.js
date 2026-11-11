
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const result = document.getElementById("result");

const STATUS = {
  success: ["ĐÃ KIỂM TRA ĐƯỢC", "success"],
  blocked: ["NHÀ CUNG CẤP TỪ CHỐI", "warning"],
  not_found: ["KHÔNG TÌM THẤY LINK", "error"],
  expired: ["LINK CÓ THỂ ĐÃ HẾT HẠN", "error"],
  rate_limited: ["ĐANG BỊ GIỚI HẠN", "warning"],
  provider_error: ["LỖI NHÀ CUNG CẤP", "error"],
  unsupported: ["CHƯA XÁC ĐỊNH ĐƯỢC ĐÍCH", "warning"],
  limit: ["VƯỢT GIỚI HẠN CHUYỂN HƯỚNG", "warning"],
  error: ["CÓ LỖI XẢY RA", "error"]
};

function showText(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  result.appendChild(element);
  return element;
}

function addLink(label, url) {
  if (!url) return;

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) return;

    const link = document.createElement("a");
    link.href = parsed.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;

    result.appendChild(link);
  } catch {
    // Bỏ qua URL không hợp lệ
  }
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function renderResult(data, originalUrl) {
  result.replaceChildren();

  const status = STATUS[data.status] || STATUS.error;

  showText("h3", status[0]);
  showText("p", data.message || "Không có thông báo.");

  showText("p", "Nhà cung cấp: " + (data.provider || "Không xác định"));

  if (data.destination && data.status === "success") {
    showText("p", "Địa chỉ hiện tại: " + data.destination);
    addLink("MỞ ĐỊA CHỈ HIỆN TẠI ↗", data.destination);
  }

  // Khi chưa xác định được đích cuối, cho phép mở trang gốc.
  if (data.status !== "success" || !data.destination) {
    addLink("MỞ TRANG NHÀ CUNG CẤP ↗", data.originalUrl || originalUrl);
  }

  if (Array.isArray(data.history) && data.history.length) {
    showText("h4", "LỊCH SỬ KIỂM TRA");

    data.history.forEach((item, index) => {
      const line = document.createElement("p");
      line.textContent =
        `${index + 1}. HTTP ${item.status} - ${item.method} - ${item.url}`;
      result.appendChild(line);
    });

    showText("p", "Tổng số bước: " + data.history.length);
  }

  showText(
    "p",
    "Lưu ý: Công cụ chỉ kiểm tra chuyển hướng HTTP. Trang dùng JavaScript, CAPTCHA hoặc xác minh có thể cần mở thủ công."
  );
}

paste.addEventListener("click", async () => {
  try {
    input.value = await navigator.clipboard.readText();
  } catch {
    result.textContent = "Không thể đọc clipboard. Hãy dùng Ctrl + V.";
  }
});

button.addEventListener("click", async () => {
  const url = input.value.trim();

  if (!validUrl(url)) {
    result.textContent = "Vui lòng nhập link HTTP hoặc HTTPS hợp lệ.";
    return;
  }

  button.disabled = true;
  button.textContent = "ĐANG PHÂN TÍCH...";
  result.textContent = "Đang kiểm tra nhà cung cấp và chuyển hướng...";

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
      throw new Error(data.message || `Máy chủ trả về HTTP ${response.status}`);
    }

    renderResult(data, url);

  } catch (error) {
    result.replaceChildren();
    showText("h3", "KHÔNG KẾT NỐI ĐƯỢC");
    showText("p", error.message || "Không thể kết nối máy chủ.");
  } finally {
    button.disabled = false;
    button.textContent = "✦ KIỂM TRA LIÊN KẾT →";
  }
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter") button.click();
});
