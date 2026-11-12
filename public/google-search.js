(() => {
  "use strict";
  const headingText = "TÌM TRANG PHÙ HỢP TRÊN GOOGLE";
  const cleanKeyword = value => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 200);

  function enhanceGooglePanel() {
    const result = document.getElementById("result");
    if (!result) return;
    const heading = [...result.querySelectorAll("h4")].find(el => el.textContent.trim() === headingText);
    if (!heading || heading.dataset.v12Enhanced === "yes") return;

    let detected = "";
    let node = heading.nextElementSibling;
    while (node && node.tagName !== "H4") {
      if (!detected && node.classList?.contains("verification-code")) detected = cleanKeyword(node.textContent);
      if (!detected && node.matches?.('input[type="search"]')) detected = cleanKeyword(node.value);
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }

    heading.dataset.v12Enhanced = "yes";
    heading.textContent = "GOOGLE SEARCH SMART · V12";

    const panel = document.createElement("div");
    panel.className = "google-smart";
    const intro = document.createElement("p");
    intro.textContent = detected
      ? "Đã tìm thấy từ khóa công khai từ liên kết. Hãy kiểm tra lại trước khi mở Google."
      : "Chưa đọc được từ khóa tự động. Nhập chính xác từ khóa mà nhà cung cấp yêu cầu.";
    const label = document.createElement("label");
    label.htmlFor = "v12GoogleKeyword";
    label.textContent = "TỪ KHÓA TÌM KIẾM";
    const input = document.createElement("input");
    input.id = "v12GoogleKeyword";
    input.type = "search";
    input.maxLength = 200;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Nhập từ khóa cần tìm trên Google";
    input.value = detected;
    const status = document.createElement("small");
    status.className = "google-smart-status";
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "google-smart-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "MỞ GOOGLE ↗";
    open.disabled = !input.value.trim();
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "paste-btn";
    copy.textContent = "SAO CHÉP TỪ KHÓA";
    copy.disabled = !input.value.trim();
    const fallback = document.createElement("a");
    fallback.className = "result-link";
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.hidden = true;
    fallback.textContent = "MỞ KẾT QUẢ GOOGLE ↗";

    function update() {
      const keyword = cleanKeyword(input.value);
      open.disabled = !keyword;
      copy.disabled = !keyword;
      fallback.hidden = !keyword;
      if (keyword) fallback.href = "https://www.google.com/search?q=" + encodeURIComponent(keyword);
      status.textContent = keyword ? "Từ khóa sẵn sàng. Bạn tự kiểm tra kết quả và chọn trang phù hợp." : "Nhập từ khóa để bật tìm kiếm.";
    }
    input.addEventListener("input", update);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !open.disabled) open.click();
    });
    open.addEventListener("click", () => {
      const keyword = cleanKeyword(input.value);
      if (!keyword) return;
      const url = "https://www.google.com/search?q=" + encodeURIComponent(keyword);
      const tab = window.open(url, "_blank");
      if (tab) status.textContent = "Đã yêu cầu mở Google trong tab mới. Nếu Chrome đang đăng nhập, phiên Google hiện tại sẽ được dùng.";
      else {
        fallback.hidden = false;
        fallback.href = url;
        status.textContent = "Chrome đã chặn cửa sổ mới. Dùng liên kết dự phòng bên dưới.";
      }
    });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(cleanKeyword(input.value));
        status.textContent = "Đã sao chép từ khóa.";
      } catch {
        input.focus();
        input.select();
        status.textContent = "Trình duyệt không cho sao chép tự động. Nhấn Ctrl+C để sao chép.";
      }
    });
    actions.append(open, copy);
    panel.append(intro, label, input, actions, status, fallback);
    heading.insertAdjacentElement("afterend", panel);
    update();
  }

  const start = () => {
    enhanceGooglePanel();
    const result = document.getElementById("result");
    if (result && !result.dataset.v12Observer) {
      result.dataset.v12Observer = "yes";
      new MutationObserver(enhanceGooglePanel).observe(result, { childList: true, subtree: true });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();