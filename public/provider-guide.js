(() => {
  "use strict";
  const result = document.getElementById("result");
  if (!result) return;

  const guides = {
    Link4m: {
      title: "HƯỚNG DẪN TỪNG BƯỚC · LINK4M",
      intro: "Bạn tự thao tác trên trang Link4m. AUTO LINK PRO chỉ theo dõi checklist, không tự bấm quảng cáo hay vượt xác minh.",
      steps: [
        "Mở trang lấy mã Link4m bằng nút ở phần trên.",
        "Đọc yêu cầu hiện trên Link4m và tự hoàn thành CAPTCHA nếu được yêu cầu.",
        "Nếu Link4m yêu cầu tìm từ khóa, dùng khung Google Search phía trên; kiểm tra từ khóa rồi tự mở Google.",
        "Tự chọn kết quả phù hợp theo đúng yêu cầu của Link4m; không chọn kết quả quảng cáo nếu không được yêu cầu.",
        "Quay lại trang Link4m, tự thực hiện bước tiếp theo và nhấn nút lấy mã khi trang cho phép.",
        "Sao chép mã do Link4m cấp, quay lại và nhập vào ô mã."
      ]
    },
    TopLinks: {
      title: "HƯỚNG DẪN TỪNG BƯỚC · TOPLINKS",
      intro: "Yêu cầu có thể khác nhau theo từng chiến dịch. Hãy ưu tiên nội dung đang hiển thị trên trang TopLinks.",
      steps: [
        "Mở trang lấy mã TopLinks bằng nút ở phần trên.",
        "Đọc toàn bộ yêu cầu và ghi nhớ điều kiện hoàn thành được hiển thị.",
        "Tự thực hiện các bước được yêu cầu trên trang; nếu có CAPTCHA hoặc xác minh, hãy tự hoàn thành.",
        "Chỉ nhấn nút tiếp tục/lấy mã khi trang cho phép và các điều kiện đã hoàn tất.",
        "Sao chép mã được cấp, quay lại AUTO LINK PRO và nhập vào ô mã."
      ]
    },
    Traffic19: {
      title: "HƯỚNG DẪN TỪNG BƯỚC · TRAFFIC19",
      intro: "Các chiến dịch Traffic19 có thể có quy trình khác nhau. Không nên đoán bước nếu trang chưa hiển thị yêu cầu.",
      steps: [
        "Mở trang lấy mã Traffic19 bằng nút ở phần trên.",
        "Đọc yêu cầu cụ thể của chiến dịch trên trang Traffic19.",
        "Tự hoàn thành các thao tác mà trang yêu cầu; nếu có CAPTCHA/xác minh, tự xử lý trên trang.",
        "Kiểm tra điều kiện hoàn tất rồi tự nhấn nút nhận mã nếu được cung cấp.",
        "Sao chép mã được cấp, quay lại AUTO LINK PRO và nhập vào ô mã."
      ]
    }
  };

  function addGuide() {
    if (result.querySelector(".provider-guide")) return;
    const text = result.innerText || "";
    const match = text.match(/Nhà cung cấp:\\s*(TopLinks|Link4m|Traffic19)/i);
    if (!match) return;
    const provider = match[1];
    const guide = guides[provider];
    if (!guide) return;

    const section = document.createElement("section");
    section.className = "provider-guide";
    const title = document.createElement("h4");
    title.textContent = guide.title;
    const intro = document.createElement("p");
    intro.textContent = guide.intro;
    const progress = document.createElement("p");
    progress.className = "provider-guide-progress";
    progress.setAttribute("role", "status");
    const list = document.createElement("ol");
    list.className = "provider-guide-list";
    const checks = [];

    guide.steps.forEach((step, index) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "provider-guide-step-" + index;
      const span = document.createElement("span");
      span.textContent = step;
      label.append(checkbox, span);
      item.appendChild(label);
      list.appendChild(item);
      checks.push(checkbox);
      checkbox.addEventListener("change", updateProgress);
    });

    function updateProgress() {
      const done = checks.filter(check => check.checked).length;
      progress.textContent = "Tiến độ checklist: " + done + "/" + checks.length + " bước.";
      if (done === checks.length) {
        progress.textContent += " Bạn đã đánh dấu hoàn tất các bước; hãy kiểm tra lại yêu cầu trên trang nhà cung cấp.";
      }
    }
    updateProgress();
    section.append(title, intro, list, progress);
    result.appendChild(section);
  }

  const observer = new MutationObserver(addGuide);
  observer.observe(result, { childList: true, subtree: true });
  addGuide();
})();