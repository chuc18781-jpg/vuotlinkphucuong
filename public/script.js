
const input = document.getElementById("urlInput");
const button = document.getElementById("processBtn");
const paste = document.getElementById("pasteBtn");
const shortenButton = document.getElementById("shortenBtn");
const result = document.getElementById("result");

const CODE_PAGES = {
  TopLinks: "https://toplinks.io/ataRjVk",
  Link4m: "https://link4m.org/yueOBd1l",
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

function findPublicKeyword(data, originalUrl) {
  const allowedKeys = new Set(["q", "query", "keyword", "search", "s", "kw"]);
  const candidates = [];
  const addUrl = value => {
    if (typeof value !== "string" || !value.trim()) return;
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      candidates.push(parsed);
    } catch {}
  };

  // Chỉ phân tích URL người dùng nhập và các URL trong lịch sử redirect API đã trả về.
  addUrl(originalUrl);
  addUrl(data.destination);
  if (Array.isArray(data.history)) {
    data.history.forEach(item => addUrl(item && item.url));
  }

  for (const url of candidates) {
    for (const [key, value] of url.searchParams.entries()) {
      if (!allowedKeys.has(key.toLowerCase())) continue;
      const keyword = value.trim().replace(/\s+/g, " ").slice(0, 200);
      if (keyword && !/^https?:\/\//i.test(keyword)) {
        return { keyword, source: url.hostname + " ?" + key };
      }
    }
  }
  return null;
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

  // Ưu tiên mở trang lấy mã đã cấu hình cho nhà cung cấp.
  // Link gốc vẫn được giữ để người dùng đối chiếu, không bị nhầm là trang lấy mã.
  const destination = data.destination;
  const codePage = CODE_PAGES[data.provider];

  if (destination) {
    showText("h4", "LINK NHÀ CUNG CẤP");
    showText("p", destination);
  }

  if (codePage) {
    addLink(data.status === "manual_required" && data.provider === "Link4m" ? "MỞ TRANG LẤY MÃ LINK4M ↗" : "MỞ TRANG LẤY MÃ ↗", codePage);
  } else if (destination) {
    addLink("MỞ ĐỊA CHỈ ↗", destination);
  } else {
    addLink("MỞ TRANG NHÀ CUNG CẤP ↗", originalUrl);
  }

  renderWorker(data.worker);
  renderHistory(data.history);

  // Chỉ phân tích tham số tìm kiếm có sẵn trong URL gốc/URL redirect được API trả về.
  // Không đọc DOM tab khác, không dò endpoint riêng tư và không tự truy cập kết quả.
  if (data.provider === "Link4m") {
    const found = findPublicKeyword(data, originalUrl);
    const keyword = found?.keyword || "";
    showText("h4", "TÌM TRANG PHÙ HỢP TRÊN GOOGLE");

    if (keyword) {
      showText("p", "V10 phát hiện từ khóa trong tham số URL công khai (" + found.source + "):");
      showText("p", keyword, "verification-code");

      // Thử tự sao chép từ khóa khi kết quả được tải. Một số trình duyệt
      // yêu cầu thao tác trực tiếp của người dùng nên luôn có nút sao chép dự phòng.
      const copyKeywordStatus = showText("small", "Đang sao chép từ khóa tìm kiếm...");
      const copyKeywordButton = document.createElement("button");
      copyKeywordButton.type = "button";
      copyKeywordButton.textContent = "SAO CHÉP TỪ KHÓA";
      copyKeywordButton.addEventListener("click", () => copyText(keyword, copyKeywordButton));
      result.appendChild(copyKeywordButton);
      (async () => {
        try {
          if (!navigator.clipboard || !window.isSecureContext) {
            throw new Error("Clipboard API không khả dụng");
          }
          await navigator.clipboard.writeText(keyword);
          copyKeywordStatus.textContent = "✓ Đã tự động sao chép từ khóa tìm kiếm.";
          copyKeywordButton.textContent = "SAO CHÉP LẠI TỪ KHÓA";
        } catch {
          copyKeywordStatus.textContent = "Trình duyệt chặn sao chép tự động. Hãy bấm nút “SAO CHÉP TỪ KHÓA”.";
        }
      })();

      const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(keyword);
      addLink("XEM KẾT QUẢ GOOGLE ĐƯỢC XẾP HẠNG ↗", searchUrl);

      const openSearchButton = document.createElement("button");
      openSearchButton.type = "button";
      openSearchButton.textContent = "MỞ KẾT QUẢ GOOGLE ↗";
      openSearchButton.addEventListener("click", () => {
        window.open(searchUrl, "_blank", "noopener,noreferrer");
      });
      result.appendChild(openSearchButton);
      showText("small", "Google tự xếp hạng kết quả tìm kiếm. Hãy tự kiểm tra nội dung và chọn trang phù hợp; V10 không tự mở trang thay bạn.");
    } else {
      showText("p", "Chưa tìm thấy từ khóa trong URL công khai. Bạn có thể nhập từ khóa theo hướng dẫn của Link4m để tạo tìm kiếm Google.");
      showText("small", "V10 vẫn tự nhận diện từ khóa nếu sau này Link4m đưa từ khóa vào URL hoặc metadata công khai.");

      const keywordLabel = document.createElement("label");
      keywordLabel.textContent = "NHẬP TỪ KHÓA LINK4M YÊU CẦU";
      keywordLabel.htmlFor = "link4mKeywordInput";
      result.appendChild(keywordLabel);

      const keywordInput = document.createElement("input");
      keywordInput.id = "link4mKeywordInput";
      keywordInput.type = "search";
      keywordInput.maxLength = 200;
      keywordInput.autocomplete = "off";
      keywordInput.placeholder = "Nhập từ khóa cần tìm...";
      keywordInput.setAttribute("aria-label", "Từ khóa tìm kiếm Google");
      result.appendChild(keywordInput);

      const searchFeedback = document.createElement("small");
      searchFeedback.className = "provider-code-hint";
      searchFeedback.setAttribute("role", "status");
      result.appendChild(searchFeedback);

      const searchButton = document.createElement("button");
      searchButton.type = "button";
      searchButton.textContent = "TÌM KIẾM GOOGLE ↗";
      searchButton.disabled = true;
      searchButton.addEventListener("click", () => {
        const manualKeyword = keywordInput.value.trim().replace(/\s+/g, " ").slice(0, 200);
        if (!manualKeyword) {
          searchFeedback.textContent = "Vui lòng nhập từ khóa trước.";
          keywordInput.focus();
          return;
        }
        const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(manualKeyword);
        const opened = window.open(searchUrl, "_blank", "noopener,noreferrer");
        searchFeedback.textContent = opened
          ? "Đã mở Google. Hãy tự kiểm tra và chọn kết quả phù hợp."
          : "Trình duyệt đã chặn cửa sổ mới. Hãy cho phép pop-up hoặc dùng liên kết bên dưới.";
        manualSearchLink.href = searchUrl;
        manualSearchLink.hidden = false;
      });

      const manualSearchLink = document.createElement("a");
      manualSearchLink.className = "result-link";
      manualSearchLink.textContent = "MỞ KẾT QUẢ GOOGLE ↗";
      manualSearchLink.target = "_blank";
      manualSearchLink.rel = "noopener noreferrer";
      manualSearchLink.hidden = true;
      result.appendChild(manualSearchLink);

      keywordInput.addEventListener("input", () => {
        searchButton.disabled = !keywordInput.value.trim();
        searchFeedback.textContent = "";
        manualSearchLink.hidden = true;
      });
      keywordInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !searchButton.disabled) searchButton.click();
      });
      result.appendChild(searchButton);
    }
  }

  // Hướng dẫn Link4m được cung cấp bởi người dùng; các bước xác minh vẫn do người dùng tự thực hiện.
  if (data.provider === "Link4m") {
    showText("h4", "HƯỚNG DẪN LINK4M");
    showText("p", "Link4m yêu cầu xác minh reCAPTCHA và thao tác trực tiếp trên website. V10 không giải CAPTCHA hoặc tự bấm quảng cáo/nút trên trang.");
    showText("p", "1. Mở trang Link4m bằng Chrome thông thường, không dùng chế độ ẩn danh.");
    showText("p", "2. Tự hoàn thành reCAPTCHA trên trang Link4m nếu được yêu cầu.");
    showText("p", "3. Làm theo phần hướng dẫn tìm kiếm từ khóa mà Link4m hiển thị. Không chọn kết quả quảng cáo có nhãn “Được tài trợ”.");
    showText("p", "4. Kéo xuống cuối bài viết và tự nhấn nút “LẤY MÃ”, sau đó chờ theo thời gian trang yêu cầu.");
    showText("p", "5. Làm theo yêu cầu của website đích; nếu Link4m yêu cầu mở một liên kết trên website, hãy tự thực hiện rồi quay lại vị trí lấy mã.");
    showText("p", "6. Sao chép mã do Link4m cấp, quay lại V10 và nhập vào ô bên dưới.");
    showText("small", "Các bước 1–3 ở trên là hướng dẫn thao tác an toàn được tóm tắt; nội dung hình ảnh chi tiết của các bước đầu chưa có trong dữ liệu bạn gửi. Hãy ưu tiên hướng dẫn đang hiển thị trên trang Link4m.");
  }

  // Khu vực nhập mã thủ công cho nhà cung cấp đã nhận diện.
  if (codePage) {
    showText("h4", "LẤY MÃ TỪ NHÀ CUNG CẤP");
    showText("p", "Mở trang nhà cung cấp ở tab mới, hoàn thành các bước tại đó rồi quay lại nhập mã bên dưới.");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = data.status === "manual_required" && data.provider === "Link4m" ? "MỞ TRANG LẤY MÃ LINK4M ↗" : "MỞ TRANG LẤY MÃ ↗";
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

    // Nhận diện nhà cung cấp từ phản hồi API; dự phòng đọc hostname của link gốc
    // để xử lý trường hợp API trả về tên miền có www hoặc tên miền phụ.
    let detectedProvider = data.provider;
    if (!CODE_PAGES[detectedProvider]) {
      const providerDomains = {
        TopLinks: ["toplinks.io"],
        Link4m: ["link4m.org", "link4m.com", "link4m.co"],
        Traffic19: ["traffic19.com"]
      };

      // Thử nhận diện cả link ban đầu lẫn URL cuối cùng sau redirect.
      for (const candidate of [data.destination, url]) {
        if (!candidate) continue;
        try {
          const host = new URL(candidate).hostname.toLowerCase().replace(/^www\\./, "");
          const match = Object.entries(providerDomains).find(([, domains]) =>
            domains.some(domain => host === domain || host.endsWith("." + domain))
          );
          if (match) {
            detectedProvider = match[0];
            break;
          }
        } catch {}
      }
    }

    const routedData = { ...data, provider: detectedProvider };
    renderResult(routedData, url);

    // Ưu tiên trang lấy mã đã cấu hình theo nhà cung cấp.
    // Nếu không có trang riêng, mở URL đích đã được API phân tích.
    const codePage = CODE_PAGES[detectedProvider];
    const destination = data.destination;
    const targetPage = codePage || (
      destination && validUrl(destination) ? destination : null
    );

    if (providerTab) {
      if (codePage || (targetPage && data.status !== "unsupported")) {
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
