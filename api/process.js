
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 7000;

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;

  const p = ip.split(".").map(Number);
  if (p.some(n => n < 0 || n > 255)) return false;

  const [a, b, c] = p;

  if (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) return false;

  return true;
}

async function resolvePublicIPv4(hostname) {
  if (net.isIP(hostname)) {
    if (!isPublicIPv4(hostname)) {
      throw new Error("Địa chỉ IP không được phép.");
    }
    return hostname;
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Tên miền nội bộ không được phép.");
  }

  const records = await dns.lookup(hostname, {
    all: true,
    verbatim: true
  });

  const valid = records.find(
    record => isPublicIPv4(record.address)
  );

  if (!valid) {
    throw new Error("Không tìm thấy địa chỉ IPv4 công khai an toàn.");
  }

  return valid.address;
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

async function requestHead(url) {
  const ip = await resolvePublicIPv4(url.hostname);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: "HEAD",
      timeout: TIMEOUT_MS,
      lookup: (hostname, options, callback) => {
        if (options?.all) {
          callback(null, [{ address: ip, family: 4 }]);
        } else {
          callback(null, ip, 4);
        }
      },
      headers: {
        "User-Agent": "AutoLinkPro/1.0",
        "Accept": "*/*"
      }
    }, response => {
      const result = {
        statusCode: response.statusCode,
        location: response.headers.location || null
      };

      response.destroy();
      resolve(result);
    });

    req.on("timeout", () => {
      req.destroy(new Error("Trang web phản hồi quá lâu."));
    });

    req.on("error", reject);
    req.end();
  });
}

async function resolveRedirects(startUrl) {
  let current = startUrl;
  const history = [];

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const result = await requestHead(current);

    history.push({
      url: current.toString(),
      status: result.statusCode
    });

    const redirects = [301, 302, 303, 307, 308];

    if (redirects.includes(result.statusCode) && result.location) {
      if (i === MAX_REDIRECTS) {
        throw new Error("Đã vượt quá số lần chuyển hướng cho phép.");
      }

      current = validateUrl(
        new URL(result.location, current).toString()
      );

      continue;
    }

    if ([401, 403, 429].includes(result.statusCode)) {
      return {
        status: "blocked",
        destination: current.toString(),
        message: "Trang đích yêu cầu quyền truy cập hoặc giới hạn truy cập.",
        history
      };
    }

    if (result.statusCode >= 200 && result.statusCode < 400) {
      return {
        status: "success",
        destination: current.toString(),
        message: "Đã kiểm tra được đích chuyển hướng HTTP.",
        history
      };
    }

    return {
      status: "unsupported",
      destination: current.toString(),
      message: "Máy chủ không hỗ trợ kiểm tra bằng HTTP HEAD.",
      history
    };
  }

  throw new Error("Không thể hoàn tất kiểm tra chuyển hướng.");
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
        error: "Vui lòng nhập link hợp lệ, tối đa 2048 ký tự."
      });
    }

    const url = validateUrl(raw);
    const result = await resolveRedirects(url);

    return res.status(200).json({
      input: url.toString(),
      ...result
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      error: error.message || "Không thể kiểm tra link."
    });
  }
}
