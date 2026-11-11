
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const VERSION = "4.0";
const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 7000;

const REDIRECT_CODES = [301, 302, 303, 307, 308];

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;

  const [a, b, c, d] = ip.split(".").map(Number);

  if ([a, b, c, d].some(
    n => !Number.isInteger(n) || n < 0 || n > 255
  )) return false;

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c <= 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function getProvider(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  const domains = [
    "link4m.org",
    "link4m.com",
    "link4m.co"
  ];

  if (domains.some(
    domain => host === domain || host.endsWith("." + domain)
  )) {
    return "Link4m";
  }

  if (host === "bit.ly" || host.endsWith(".bit.ly")) {
    return "Bitly";
  }

  if (host === "tinyurl.com" || host.endsWith(".tinyurl.com")) {
    return "TinyURL";
  }

  return "Unknown";
}

async function getPublicIP(hostname) {
  if (net.isIP(hostname)) {
    if (!isPublicIPv4(hostname)) {
      throw new Error("Địa chỉ IP không công khai.");
    }

    return hostname;
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Không hỗ trợ tên miền nội bộ.");
  }

  const records = await dns.lookup(hostname, {
    all: true,
    verbatim: true
  });

  if (
    records.some(record =>
      net.isIP(record.address) === 6
    )
  ) {
    throw new Error("Tên miền có IPv6; yêu cầu kiểm tra an toàn bổ sung.");
  }

  const record = records.find(
    item => isPublicIPv4(item.address)
  );

  if (!record) {
    throw new Error("Không tìm thấy IP công khai hợp lệ.");
  }

  return record.address;
}

function validateUrl(raw) {
  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Đường link không hợp lệ.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Chỉ hỗ trợ HTTP và HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Không nhận link chứa thông tin đăng nhập.");
  }

  if (!url.hostname || url.hostname.includes(":")) {
    throw new Error("Tên miền không được hỗ trợ.");
  }

  return url;
}

async function requestOnce(url, method) {
  const ip = await getPublicIP(url.hostname);
  const transport =
    url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method,
      timeout: TIMEOUT_MS,

      lookup: (hostname, options, callback) => {
        if (options?.all) {
          callback(null, [{
            address: ip,
            family: 4
          }]);
        } else {
          callback(null, ip, 4);
        }
      },

      headers: {
        "User-Agent": "AUTO-LINK-PRO/4.0",
        "Accept": "text/html,application/xhtml+xml,*/*"
      }
    }, response => {
      const result = {
        statusCode: response.statusCode || 0,
        location: response.headers.location || null,
        method
      };

      response.destroy();
      resolve(result);
    });

    req.on("timeout", () => {
      req.destroy(
        new Error("Máy chủ phản hồi quá lâu.")
      );
    });

    req.on("error", reject);
    req.end();
  });
}

async function checkUrl(url) {
  let result = await requestOnce(url, "HEAD");

  if ([405, 501].includes(result.statusCode)) {
    result = await requestOnce(url, "GET");
  }

  return result;
}

async function resolveRedirects(startUrl) {
  let current = startUrl;
  const history = [];

  const provider = getProvider(startUrl.hostname);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const result = await checkUrl(current);

    history.push({
      step: i + 1,
      url: current.toString(),
      status: result.statusCode,
      method: result.method
    });

    if (REDIRECT_CODES.includes(result.statusCode)) {
      if (!result.location) {
        return {
          status: "incomplete",
          httpCode: result.statusCode,
          destination: null,
          provider,
          canResolve: false,
          message: "Máy chủ không cung cấp địa chỉ chuyển hướng.",
          history
        };
      }

      if (i === MAX_REDIRECTS) {
        return {
          status: "limit_reached",
          httpCode: result.statusCode,
          destination: null,
          provider,
          canResolve: false,
          message: "Đã đạt giới hạn 8 lần chuyển hướng.",
          history
        };
      }

      current = validateUrl(
        new URL(result.location, current).toString()
      );

      continue;
    }

    if ([401, 403, 429].includes(result.statusCode)) {
      let message;

      if (result.statusCode === 403 && provider === "Link4m") {
        message =
          "Link4m trả HTTP 403. Máy chủ từ chối yêu cầu tự động. Hãy mở link bằng trình duyệt thông thường.";
      } else if (result.statusCode === 429) {
        message =
          "Máy chủ đang giới hạn số lượng yêu cầu.";
      } else {
        message =
          "Máy chủ yêu cầu xác thực hoặc từ chối truy cập.";
      }

      return {
        status: "blocked",
        httpCode: result.statusCode,
        destination: null,
        provider,
        canResolve: false,
        message,
        history
      };
    }

    if (
      result.statusCode >= 200 &&
      result.statusCode < 300
    ) {
      return {
        status: "success",
        httpCode: result.statusCode,
        destination: current.toString(),
        provider,
        canResolve: true,
        message:
          "Đã xác định địa chỉ cuối qua chuyển hướng HTTP công khai.",
        history
      };
    }

    return {
      status: "unsupported",
      httpCode: result.statusCode,
      destination: null,
      provider,
      canResolve: false,
      message:
        "Không tìm thấy chuyển hướng HTTP công khai.",
      history
    };
  }

  throw new Error("Không thể hoàn tất kiểm tra.");
}

export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      version: VERSION,
      status: "error",
      message: "Chỉ hỗ trợ POST."
    });
  }

  try {
    const raw = String(req.body?.url || "").trim();

    if (!raw || raw.length > 2048) {
      return res.status(400).json({
        version: VERSION,
        status: "error",
        message: "Link không hợp lệ hoặc quá dài."
      });
    }

    const url = validateUrl(raw);
    const result = await resolveRedirects(url);

    return res.status(200).json({
      version: VERSION,
      input: url.toString(),
      ...result
    });

  } catch (error) {
    return res.status(400).json({
      version: VERSION,
      status: "error",
      message:
        error.message || "Không thể xử lý đường link."
    });
  }
}
