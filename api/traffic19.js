const API_BASE = "https://api.traffic19.com/api/admin/shortlink/quicklink";

function validateInput(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL không hợp lệ.");
  }

  if (!["http:", "https:"].includes(url.protocol) ||
      !url.hostname || url.username || url.password) {
    throw new Error("Chỉ chấp nhận URL HTTP/HTTPS hợp lệ.");
  }

  if (url.href.length > 2048) {
    throw new Error("URL quá dài (tối đa 2048 ký tự).");
  }

  return url.href;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      message: "Chỉ hỗ trợ POST."
    });
  }

  const token = process.env.TRAFFIC19_API_TOKEN;
  if (!token) {
    return res.status(503).json({
      success: false,
      message: "Chưa cấu hình TRAFFIC19_API_TOKEN trên Vercel."
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const url = validateInput(body?.url);
    const params = new URLSearchParams({
      tokenUser: token,
      format: "json",
      url
    });

    if (typeof body?.link_du_phong === "string" &&
        body.link_du_phong.trim()) {
      params.set("link_du_phong", body.link_du_phong.trim().slice(0, 500));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response;
    let raw;
    try {
      response = await fetch(`${API_BASE}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      raw = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: `Traffic19 trả về HTTP ${response.status}.`
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    const shortUrl = typeof data?.html === "string"
      ? data.html.trim()
      : raw.trim();

    let parsed;
    try {
      parsed = new URL(shortUrl);
    } catch {
      parsed = null;
    }

    if (data?.success !== true && !parsed) {
      return res.status(502).json({
        success: false,
        message: typeof data?.message === "string"
          ? data.message.slice(0, 250)
          : "Traffic19 không trả về link rút gọn hợp lệ."
      });
    }

    if (!parsed || !["http:", "https:"].includes(parsed.protocol) ||
        !["traffic19.com", "www.traffic19.com"].includes(parsed.hostname)) {
      return res.status(502).json({
        success: false,
        message: "Phản hồi từ Traffic19 không phải link Traffic19 hợp lệ."
      });
    }

    return res.status(200).json({
      success: true,
      shortUrl: parsed.href
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.name === "AbortError"
        ? "Traffic19 phản hồi quá thời gian."
        : (error.message || "Không thể tạo link.")
    });
  }
}
