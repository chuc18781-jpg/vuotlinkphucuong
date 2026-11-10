const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// This starter intentionally does not defeat ad gates, CAPTCHAs, login walls,
// or provider verification. Add only official, documented provider APIs here.
const PROVIDERS = {
  // "short.example": async (url) => {
  //   // Call the provider's documented API here using a server-side env var.
  //   // Return { destination: "https://destination.example/path" }.
  // }
};

function isPublicHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split(".").map(Number);
    if (p.some(n => n > 255)) return false;
    return !(p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || p[0] >= 224);
  }
  return !h.includes(":") && h.includes(".");
}

function validateUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Đường link không hợp lệ."); }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new Error("Chỉ hỗ trợ link HTTP hoặc HTTPS.");
  if (!isPublicHostname(url.hostname)) throw new Error("Tên miền này không được hỗ trợ.");
  if (url.username || url.password) throw new Error("Không nhận link có thông tin đăng nhập.");
  return url;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Chỉ hỗ trợ POST." });
  }

  try {
    const raw = String(req.body?.url || "").trim();
    if (!raw || raw.length > 2048) return res.status(400).json({ error: "Vui lòng nhập link (tối đa 2048 ký tự)." });
    const url = validateUrl(raw);
    const provider = PROVIDERS[url.hostname.toLowerCase()];

    if (!provider) {
      return res.status(200).json({
        status: "unsupported",
        input: url.toString(),
        message: "Tên miền này chưa có API chính thức được cấu hình. Website không tự vượt quảng cáo, CAPTCHA hoặc bước xác minh."
      });
    }

    const result = await provider(url.toString());
    const destination = validateUrl(result?.destination).toString();
    return res.status(200).json({ status: "success", input: url.toString(), destination });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Không thể xử lý link." });
  }
}