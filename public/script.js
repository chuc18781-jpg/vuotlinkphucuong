
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const result = document.getElementById("result");

const STATUS = {
  success: ["KIỂM TRA THÀNH CÔNG", "success"],
  blocked: ["NHÀ CUNG CẤP TỪ CHỐI", "warning"],
  verification_required: ["CẦN XÁC MINH", "warning"],
  code_available: ["ĐÃ CÓ MÃ", "success"],
  unsupported: ["CHƯA HỖ TRỢ", "error"]
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
  } catch {}
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

async function copyCode(code, buttonElement) {
  try {
    await navigator.clipboard.writeText(code);
    buttonElement.textContent = "ĐÃ SAO CHÉP";
  } catch {
    buttonElement.textContent = "KHÔNG THỂ SAO CHÉP";
  }
}

function renderResult(data, originalUrl) {
  result.replaceChildren();

  const status = STATUS[data.status] || STATUS.unsupported;

  showText("h3", status[0]);
  showText("p", data.message || "Không có thông báo.");
  showText("p", "Nhà cung cấp: " + (data.provider || "Không xác định"));

  if (data.destination) {
    showText("p", "Địa chỉ hiện tại: " + data.destination);
    addLink("MỞ ĐỊA CHỈ ↗", data.destination);
  }

  if (data.status === "code_available" && data.code) {
    showText("h4", "MÃ XÁC MINH");
    const code = showText("p", data.code);
    code.className = "verification-code";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "SAO CHÉP MÃ";
    copy.addEventListener("click", () => copyCode(data.code, copy));
    result.appendChild(copy);
  }

  if (
    data.status === "blocked" ||
    data.status === "verification_required" ||
    data.status === "unsupported"
  ) {
    addLink(
      "MỞ TRANG NHÀ CUNG CẤP ↗",
      data.originalUrl || originalUrl
    );
  }

  if (Array.isArray(data.history) && data.history.length) {
    showText("h4", "LỊCH SỬ KIỂM TRA");

    data.history.forEach((item, index) => {
      showText(
        "p",
        `${index + 1}. HTTP ${item.status} - ${item.method} - ${item.url}`
      );
    });

    showText("p", "Tổng số bước: " + data.history.length);
  }

  showText(
    "p",
    "Mã chỉ được hiển thị khi có nguồn cung cấp hợp lệ. Công cụ không tự vượt CAPTCHA hoặc xác minh bắt buộc."
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
  result.textContent = "Đang nhận diện nhà cung cấp...";

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
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
