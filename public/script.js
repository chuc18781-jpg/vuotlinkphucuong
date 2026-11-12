
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const shortenButton = document.getElementById("shortenBtn");
const result = document.getElementById("result");

const CODE_PAGES = {
  TopLinks: "https://toplinks.io/ataRjVk",
  Link4m: "https://link4m.org/go/OPZeU",
  Traffic19: "https://traffic19.com/w13PJjsgO"
};


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

  // Mở trang lấy mã do người dùng cung cấp trong tab mới.
  const codePage = CODE_PAGES[data.provider];
  if (codePage && data.status !== "unsupported") {
    showText("h4", "LẤY MÃ TỪ NHÀ CUNG CẤP");
    showText("p", "Mở trang nhà cung cấp ở tab mới, hoàn thành các bước tại đó rồi quay lại nhập mã bên dưới.");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "MỞ TRANG LẤY MÃ ↗";
    openButton.addEventListener("click", () => {
      window.open(codePage, "_blank", "noopener,noreferrer");
    });
    result.appendChild(openButton);

    const codeLabel = document.createElement("label");
    codeLabel.textContent = "NHẬP MÃ BẠN ĐÃ LẤY ĐƯỢC";
    codeLabel.htmlFor = "providerCodeInput";
    result.appendChild(codeLabel);

    const codeInput = document.createElement("input");
    codeInput.id = "providerCodeInput";
    codeInput.type = "text";
    codeInput.autocomplete = "off";
    codeInput.maxLength = 200;
    codeInput.placeholder = "Nhập mã tại đây";
    codeInput.setAttribute("aria-label", "Mã lấy từ nhà cung cấp");
    result.appendChild(codeInput);

    const codeHint = document.createElement("small");
    codeHint.className = "provider-code-hint";
    codeHint.textContent = "Mã chỉ được giữ tạm trong bộ nhớ của tab này; V10 chưa gửi mã đến máy chủ.";
    result.appendChild(codeHint);

    const codeFeedback = document.createElement("p");
    codeFeedback.className = "provider-code-feedback";
    codeFeedback.setAttribute("role", "status");
    codeFeedback.setAttribute("aria-live", "polite");
    result.appendChild(codeFeedback);

    const codeActions = document.createElement("div");
    codeActions.className = "provider-code-actions";

    const submitCode = document.createElement("button");
    submitCode.type = "button";
    submitCode.textContent = "GHI NHẬN MÃ";
    submitCode.disabled = true;

    const clearCode = document.createElement("button");
    clearCode.type = "button";
    clearCode.textContent = "XÓA MÃ";
    clearCode.className = "provider-code-clear";
    clearCode.disabled = true;

    let recordedCode = "";
    codeInput.addEventListener("input", () => {
      const value = codeInput.value.trim();
      submitCode.disabled = !value || !!recordedCode;
      clearCode.disabled = !codeInput.value && !recordedCode;
      codeFeedback.textContent = "";
    });

    const recordCode = () => {
      const enteredCode = codeInput.value.trim();
      if (!enteredCode) {
        codeFeedback.textContent = "Bạn chưa nhập mã.";
        codeInput.focus();
        return;
      }
      if (enteredCode.length > 200) {
        codeFeedback.textContent = "Mã quá dài. Vui lòng kiểm tra lại.";
        return;
      }

      // Chỉ giữ tạm trong biến của trang; không gửi/lưu mã và không tuyên bố đã xác minh.
      recordedCode = enteredCode;
      codeInput.value = enteredCode;
      codeInput.disabled = true;
      submitCode.textContent = "ĐÃ GHI NHẬN TRONG PHIÊN";
      submitCode.disabled = true;
      clearCode.disabled = false;
      codeFeedback.textContent = "Đã ghi nhận mã trong tab này. Trạng thái hợp lệ CHƯA được xác minh bởi Link4m.";
    };

    const resetCode = () => {
      recordedCode = "";
      codeInput.value = "";
      codeInput.disabled = false;
      submitCode.textContent = "GHI NHẬN MÃ";
      submitCode.disabled = true;
      clearCode.disabled = true;
      codeFeedback.textContent = "Đã xóa mã khỏi phiên làm việc.";
      codeInput.focus();
    };

    submitCode.addEventListener("click", recordCode);
    clearCode.addEventListener("click", resetCode);
    codeInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !submitCode.disabled) recordCode();
    });
    codeActions.append(submitCode, clearCode);
    result.appendChild(codeActions);
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

  // Mở tab đồng bộ ngay trong thao tác click để tránh trình duyệt chặn popup.
  const providerTab = window.open("about:blank", "_blank");
  if (providerTab) {
    providerTab.document.title = "AUTO LINK PRO - Đang tìm trang lấy mã";
    providerTab.document.body.textContent = "Đang xác định trang nhà cung cấp...";
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

    const codePage = CODE_PAGES[data.provider];
    const destination = data.destination;
    const targetPage = codePage || (
      destination && validUrl(destination) ? destination : null
    );

    if (providerTab) {
      if (targetPage && data.status !== "unsupported") {
        providerTab.location.replace(targetPage);
      } else {
        providerTab.close();
      }
    } else if (targetPage && data.status !== "unsupported") {
      showText("p", "Trình duyệt đã chặn tab tự mở. Hãy cho phép cửa sổ bật lên (pop-up) rồi thử lại.");
    }

  } catch (error) {
    if (providerTab) providerTab.close();
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


shortenButton.addEventListener("click", async () => {
  const url = input.value.trim();

  if (!validUrl(url)) {
    result.textContent = "Vui lòng nhập URL HTTP hoặc HTTPS hợp lệ trước khi tạo link.";
    return;
  }

  shortenButton.disabled = true;
  shortenButton.textContent = "ĐANG TẠO LINK...";
  result.textContent = "Đang gửi URL đến Traffic19...";

  try {
    const response = await fetch("/api/traffic19", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.shortUrl) {
      throw new Error(data.message || "Traffic19 không tạo được link.");
    }

    result.replaceChildren();
    showText("h3", "TẠO LINK THÀNH CÔNG", "status-success");
    showText("p", "Link Traffic19 của bạn:");
    showText("p", data.shortUrl, "verification-code");
    addLink("MỞ LINK TRAFFIC19 ↗", data.shortUrl);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "SAO CHÉP LINK";
    copyButton.addEventListener("click", () => copyText(data.shortUrl, copyButton));
    result.appendChild(copyButton);
  } catch (error) {
    result.replaceChildren();
    showText("h3", "KHÔNG TẠO ĐƯỢC LINK", "status-error");
    showText("p", error.message || "Không thể kết nối Traffic19.");
  } finally {
    shortenButton.disabled = false;
    shortenButton.textContent = "↗ TẠO LINK TRAFFIC19";
  }
});
