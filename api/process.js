
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 7000;

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;

  const p = ip.split(".").map(Number);
  const [a, b] = p;

  if (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113)
  ) return false;

  return true;
}

function getProvider(hostname) {
  const host = hostname.toLowerCase();

  const providers = [
    { name: "Link4m", domains: ["link4m.org", "link4m.com", "link4m.co"] },
    { name: "Traffic19", domains: ["traffic19.com"] }
  ];

  for (const provider of providers) {
    if (provider.domains.some(domain =>
      host === domain || host.endsWith("." + domain)
    )) return provider.name;
  }

  if (host === "bit.ly") return "Bitly";
  if (host === "tinyurl.com") return "TinyURL";

  return "Không xác định";
}

function validateUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Đường dẫn không hợp lệ.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Chỉ hỗ trợ HTTP và HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("URL chứa thông tin đăng nhập không được hỗ trợ.");
  }

  if (!url.hostname || url.hostname.includes(":")) {
    throw new Error("Tên miền hoặc IP không hợp lệ.");
  }

  return url;
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
    verbatim: true,
    family: 4
  });

  const publicRecords = records.filter(record =>
    isPublicIPv4(record.address)
  );

  if (!publicRecords.length) {
    throw new Error("Không tìm thấy IP IPv4 công khai.");
  }

  return publicRecords[0].address;
}

function requestOnce(url, method, ip) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;

    const request = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method,
      headers: {
        "User-Agent": "AUTO-LINK-PRO/6.0",
        "Accept": "text/html,application/json,*/*",
        "Connection": "close"
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          callback(null, [{ address: ip, family: 4 }]);
        } else {
          callback(null, ip, 4);
        }
      }
    }, response => {
      const result = {
        statusCode: response.statusCode || 0,
        location: response.headers.location || null,
        contentType: response.headers["content-type"] || ""
      };

      response.resume();
      response.on("end", () => resolve(result));
      response.on("error", reject);
    });

    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(new Error("Máy chủ phản hồi quá lâu."));
    });

    request.on("error", reject);
    request.end();
  });
}

async function checkUrl(url) {
  const ip = await getPublicIP(url.hostname);
  let result = await requestOnce(url, "HEAD", ip);
  let method = "HEAD";

  if ([405, 501].includes(result.statusCode)) {
    result = await requestOnce(url, "GET", ip);
    method = "GET";
  }

  return { ...result, method };
}

function classifyResponse(code, provider) {
  if (code === 401 || code === 403) {
    return {
      status: "blocked",
      message: `Nhà cung cấp ${provider} từ chối yêu cầu kiểm tra tự động.`
    };
  }

  if (code === 404) {
    return {
      status: "unsupported",
      message: "Không tìm thấy đường dẫn."
    };
  }

  if (code === 410) {
    return {
      status: "unsupported",
      message: "Đường dẫn có thể đã hết hạn hoặc bị gỡ."
    };
  }

  if (code === 429) {
    return {
      status: "blocked",
      message: "Nhà cung cấp đang giới hạn số lượng yêu cầu."
    };
  }

  if (code >= 500) {
    return {
      status: "unsupported",
      message: `Máy chủ nhà cung cấp gặp lỗi HTTP ${code}.`
    };
  }

  return null;
}

async function resolveRedirects(input) {
  let current = validateUrl(input);
  const history = [];

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const provider = getProvider(current.hostname);
    const result = await checkUrl(current);

    history.push({
      url: current.href,
      status: result.statusCode,
      method: result.method
    });

    const failure = classifyResponse(result.statusCode, provider);

    if (failure) {
      return {
        ...failure,
        destination: null,
        code: null,
        history
      };
    }

    if (
      [301, 302, 303, 307, 308].includes(result.statusCode) &&
      result.location
    ) {
      current = validateUrl(
        new URL(result.location, current).href
      );
      continue;
    }

    if (result.statusCode >= 200 && result.statusCode < 300) {
      return {
        status: "verification_required",
        destination: current.href,
        code: null,
        message:
          "Đã truy cập được trang. Có thể cần hoàn thành các bước xác minh trên trình duyệt.",
        history
      };
    }

    return {
      status: "unsupported",
      destination: null,
      code: null,
      message: `Không xác định được kết quả. HTTP ${result.statusCode}.`,
      history
    };
  }

  return {
    status: "unsupported",
    destination: null,
    code: null,
    message: "Đã vượt quá giới hạn chuyển hướng.",
    history
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      status: "unsupported",
      message: "Chỉ hỗ trợ phương thức POST."
    });
  }

  let originalUrl = "";

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    if (
      typeof body?.url !== "string" ||
      !body.url.trim() ||
      body.url.length > 2048
    ) {
      return res.status(400).json({
        status: "unsupported",
        message: "Vui lòng nhập link hợp lệ."
      });
    }

    const url = validateUrl(body.url.trim());
    originalUrl = url.href;

    const provider = getProvider(url.hostname);
    const result = await resolveRedirects(url.href);

    return res.status(200).json({
      version: "6.0",
      provider,
      originalUrl,
      code: null,
      ...result
    });
  } catch (error) {
    return res.status(200).json({
      version: "6.0",
      status: "unsupported",
      provider: originalUrl
        ? getProvider(new URL(originalUrl).hostname)
        : "Không xác định",
      originalUrl,
      destination: null,
      code: null,
      message: error.message || "Có lỗi khi xử lý liên kết.",
      history: []
    });
  }
}
