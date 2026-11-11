
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 7000;

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;

  const [a, b, c, d] = ip.split(".").map(Number);

  if ([a, b, c, d].some(
    n => !Number.isInteger(n) || n < 0 || n > 255
  )) return false;

  return !(
    a === 0 || a === 10 || a === 127 ||
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
  const host = hostname.toLowerCase();

  if (host === "link4m.org" || host.endsWith(".link4m.org")) {
    return "Link4m";
  }

  if (host === "link4m.com" || host.endsWith(".link4m.com")) {
    return "Link4m";
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

  const record = records.find(r => isPublicIPv4(r.address));

  if (!record) {
    throw new Error("Không tìm thấy IP công khai.");
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
  const transport = url.protocol === "https:" ? https : http;

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
        "User-Agent": "AUTO-LINK-PRO/3.0",
        "Accept": "*/*"
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
      req.destroy(new Error("Máy chủ phản hồi quá lâu."));
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

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const result = await checkUrl(current);

    history.push({
      url: current.toString(),
      status: result.statusCode,
      method: result.method
    });

    const redirects = [301, 302, 303, 307, 308];

    if (redirects.includes(result.statusCode)) {
      if (!result.location) {
        return {
          status: "incomplete",
          httpCode: result.statusCode,
          destination: null,
          message: "Máy chủ không cung cấp địa chỉ chuyển hướng.",
          history
        };
      }

      if (i === MAX_REDIRECTS) {
        throw new Error("Vượt quá 8 lần chuyển hướng.");
      }

      current = validateUrl(
        new URL(result.location, current).toString()
      );

      continue;
    }

    if ([401, 403, 429].includes(result.statusCode)) {
      const provider = getProvider(current.hostname);

      let message = "Máy chủ từ chối hoặc giới hạn truy cập.";

      if (provider === "Link4m" && result.statusCode === 403) {
        message =
          "Link4m trả HTTP 403. Máy chủ không cho phép yêu cầu kiểm tra tự động này. Hãy mở link bằng trình duyệt thông thường.";
      } else if (result.statusCode === 429) {
        message = "Máy chủ giới hạn số lượng yêu cầu.";
      } else if (result.statusCode === 401) {
        message = "Máy chủ yêu cầu xác thực.";
      }

      return {
        status: "blocked",
        httpCode: result.statusCode,
        destination: null,
        provider,
        message,
        canResolve: false,
        history
      };
    }

    if (result.statusCode >= 200 && result.statusCode < 300) {
      return {
        status: "success",
        httpCode: result.statusCode,
        method: result.method,
        destination: current.toString(),
        provider: getProvider(startUrl.hostname),
        message: "Đã kiểm tra được địa chỉ cuối của chuyển hướng HTTP.",
        canResolve: true,
        history
      };
    }

    return {
      status: "unsupported",
      httpCode: result.statusCode,
      destination: null,
      provider: getProvider(startUrl.hostname),
      message: "Không tìm thấy chuyển hướng HTTP công khai.",
      canResolve: false,
      history
    };
  }

  throw new Error("Không thể hoàn tất kiểm tra.");
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Chỉ hỗ trợ POST."
    });
  }

  try {
    const raw = String(req.body?.url || "").trim();

    if (!raw || raw.length > 2048) {
      return res.status(400).json({
        status: "error",
        error: "Link không hợp lệ hoặc quá dài."
      });
    }

    const url = validateUrl(raw);
    const result = await resolveRedirects(url);

    return res.status(200).json({
      version: "3.0",
      input: url.toString(),
      ...result
    });

  } catch (error) {
    return res.status(400).json({
      version: "3.0",
      status: "error",
      error: error.message || "Không thể xử lý link."
    });
  }
}
