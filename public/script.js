const input = document.querySelector("#urlInput");
const processBtn = document.querySelector("#processBtn");
const btnText = document.querySelector("#btnText");
const message = document.querySelector("#message");
const progress = document.querySelector("#progress");
const result = document.querySelector("#result");
const historyList = document.querySelector("#historyList");
const STORAGE_KEY = "auto-link-pro-history-v1";

document.querySelector("#year").textContent = new Date().getFullYear();

function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 12))); }
function renderHistory() {
  const items = readHistory();
  historyList.innerHTML = "";
  if (!items.length) {
    historyList.innerHTML = '<p class="empty">Chưa có hoạt động nào.</p>';
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";
    const url = document.createElement("span");
    url.textContent = item.url;
    const status = document.createElement("small");
    status.textContent = item.status;
    row.append(url, status);
    historyList.append(row);
  }
}
function setMessage(text, type="") {
  message.textContent = text;
  message.className = "message " + type;
}
function validWebUrl(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && !!u.hostname;
  } catch { return false; }
}

document.querySelector("#pasteBtn").addEventListener("click", async () => {
  try {
    input.value = await navigator.clipboard.readText();
    input.focus();
  } catch {
    setMessage("Trình duyệt không cho phép đọc clipboard. Hãy dán bằng Ctrl + V.");
  }
});

processBtn.addEventListener("click", async () => {
  const url = input.value.trim();
  result.hidden = true;
  if (!validWebUrl(url)) {
    setMessage("Vui lòng nhập một đường link HTTP hoặc HTTPS hợp lệ.", "error");
    return;
  }
  processBtn.disabled = true;
  btnText.textContent = "ĐANG KIỂM TRA...";
  progress.hidden = false;
  setMessage("Đang nhận diện tên miền và kiểm tra API...");
  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không thể xử lý yêu cầu.");
    if (data.status === "success" && data.destination) {
      setMessage("Đã nhận được liên kết đích từ API chính thức.", "success");
      result.hidden = false;
      result.replaceChildren();
      const link = document.createElement("a");
      link.href = data.destination;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = data.destination;
      const copy = document.createElement("button");
      copy.className = "copy";
      copy.textContent = "Sao chép liên kết";
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(data.destination);
        copy.textContent = "Đã sao chép ✓";
      });
      result.append(link, document.createElement("br"), copy);
    } else {
      setMessage(data.message || "Nhà cung cấp này chưa được hỗ trợ.", "error");
    }
    const items = readHistory();
    items.unshift({ url, status: data.status === "success" ? "Hoàn tất" : "Chưa hỗ trợ", at: Date.now() });
    saveHistory(items);
    renderHistory();
  } catch (error) {
    setMessage(error.message || "Có lỗi xảy ra.", "error");
  } finally {
    progress.hidden = true;
    processBtn.disabled = false;
    btnText.textContent = "KIỂM TRA LIÊN KẾT";
  }
});
input.addEventListener("keydown", e => { if (e.key === "Enter") processBtn.click(); });
document.querySelector("#clearBtn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});
renderHistory();