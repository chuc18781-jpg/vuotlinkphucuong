
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

button.addEventListener("click", async () => {
  const url = input.value.trim();

  if (!validUrl(url)) {
    result.textContent = "Vui lòng nhập link HTTP hoặc HTTPS hợp lệ.";
    return;
  }

  button.disabled = true;
  button.textContent = "ĐANG KIỂM TRA...";
  result.textContent = "Đang phân tích chuyển hướng...";

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

    const message = document.createElement("p");
    message.textContent = data.message || "Không có kết quả.";
    result.appendChild(message);

    if (data.destination) {
      const destination = document.createElement("p");
      destination.textContent = "Link đích: " + data.destination;
      result.appendChild(destination);

      const open = document.createElement("a");
      open.href = data.destination;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "MỞ LINK ĐÍCH ↗";
      result.appendChild(open);
    }

    if (data.history?.length) {
      const history = document.createElement("p");
      history.textContent = "Số bước chuyển hướng: " + data.history.length;
      result.appendChild(history);
    }

  } catch (error) {
    result.textContent = "Không kết nối được máy chủ. Hãy thử lại.";
  } finally {
    button.disabled = false;
    button.textContent = "✦ KIỂM TRA LIÊN KẾT →";
  }
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter") button.click();
});
