
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const result = document.getElementById("result");

paste.addEventListener("click", async () => {
  try {
    input.value = await navigator.clipboard.readText();
  } catch {
    result.textContent = "Không thể đọc clipboard. Hãy dùng Ctrl + V.";
  }
});

function validUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function addLink(label, url) {
  if (!url) return;

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.style.display = "block";
  link.style.marginTop = "12px";
  result.appendChild(link);
}

button.addEventListener("click", async () => {
  const url = input.value.trim();

  if (!validUrl(url)) {
    result.textContent = "Vui lòng nhập link HTTP hoặc HTTPS hợp lệ.";
    return;
  }

  button.disabled = true;
  button.textContent = "ĐANG KIỂM TRA...";
  result.textContent = "Đang nhận diện nhà cung cấp...";

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    result.replaceChildren();

    const provider = document.createElement("p");
    provider.textContent = "Nhà cung cấp: " +
      (data.provider || "Không xác định");
    result.appendChild(provider);

    const message = document.createElement("p");
    message.textContent = data.message || "Không có kết quả.";
    result.appendChild(message);

    if (data.destination) {
      addLink("MỞ LINK ĐÍCH ↗", data.destination);
    }

    if (data.status === "blocked") {
      addLink("MỞ LINK GỐC ↗", data.originalUrl || url);
    }

    if (data.history?.length) {
      const history = document.createElement("p");
      history.textContent =
        "Số bước chuyển hướng: " + data.history.length;
      result.appendChild(history);
    }

  } catch (error) {
    result.textContent =
      "Không kết nối được máy chủ. Hãy thử lại.";
  } finally {
    button.disabled = false;
    button.textContent = "✦ KIỂM TRA LIÊN KẾT →";
  }
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter") button.click();
});
