
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const VERSION = "10.0";
const MAX_REDIRECTS = 8;
const TIMEOUT_MS = 7000;
const WORKER_TIMEOUT_MS = 20000;

const WORKER_URL = process.env.WORKER_URL;
const WORKER_API_KEY = process.env.WORKER_API_KEY;

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const WORKER_STATUSES = new Set([
  "manual_required",
  "verification_required",
  "worker_unavailable",
  "unsupported"
]);

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;

  const p = ip.split(".").map(Number);
  const [a, b, c] = p;

  if (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) return false;

  return true;
}

function getProvider(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  const providers = [
    { name: "Link4m", domains: ["link4m.org", "link4m.com", "link4m.co"] },
    { name: "Traffic19", domains: ["traffic19.com"] }
  ];

  for (const provider of providers) {
    if (provider.domains.some(domain =>
      host === domain
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

  if (!url.hostname || url.hostname.includes("%")) {
    throw new Error("Tên miền hoặc IP không hợp lệ.");
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Chỉ hỗ trợ cổng HTTP và HTTPS thông dụng.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname) === 6) {
    throw new Error("Không hỗ trợ địa chỉ IPv6.");
  }

  if (net.isIP(hostname) === 4 && !isPublicIPv4(hostname)) {
    throw new Error("Địa chỉ IP không công khai.");
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Không hỗ trợ tên miền nội bộ.");
  }

  return url;
}

async function getPublicIP(hostname) {
  if (net.isIP(hostname) === 4) {
    if (!isPublicIPv4(hostname)) {
      throw new Error("Địa chỉ IP không công khai.");
    }
    return hostname;
  }

  const records = await dns.lookup(hostname, {
    all: true,
    verbatim: true,
    family: 4
  });

  if (!records.length) {
    throw new Error("Không tìm thấy địa chỉ IPv4.");
  }

  if (records.some(record => !isPublicIPv4(record.address))) {
    throw new Error("Tên miền trả về IP không công khai.");
  }

  return records[0].address;
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
        "User-Agent": "AUTO-LINK-PRO/10.0",
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
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const ip = await getPublicIP(hostname);

  let result = await requestOnce(url, "HEAD", ip);
  let method = "HEAD";

  if ([405, 501].includes(result.statusCode)) {
    result = await requestOnce(url, "GET", ip);
    method = "GET";
  }

  return { ...result, method };
}

async function inspectWithWorker(url) {
  if (!WORKER_URL || !WORKER_API_KEY) {
    return {
      status: "worker_unavailable",
      message: "Worker chưa được cấu hình trong Vercel."
    };
  }

  let endpoint;

  try {
    endpoint = new URL("/inspect", WORKER_URL.replace(/\/+$/, ""));
  } catch {
    return {
      status: "worker_unavailable",
      message: "Địa chỉ Worker không hợp lệ."
    };
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "auto-code-worker.onrender.com"
  ) {
    return {
      status: "worker_unavailable",
      message: "Địa chỉ Worker không hợp lệ."
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WORKER_API_KEY}`
      },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: "worker_unavailable",
        message: typeof data.message === "string"
          ? data.message.slice(0, 300)
          : `Worker trả về HTTP ${response.status}.`
      };
    }

    const status = WORKER_STATUSES.has(data.status)
      ? data.status
      : "manual_required";

    return {
      status,
      message: typeof data.message === "string"
        ? data.message.slice(0, 500)
        : "Worker đã phản hồi."
    };
  } catch {
    return {
      status: "worker_unavailable",
      message: "Không thể kết nối Worker."
    };
  } finally {
    clearTimeout(timer);
  }
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

    if ([401, 403].includes(result.statusCode)) {
      return {
        status: "manual_required",
        destination: current.href,
        code: null,
        message: `Nhà cung cấp ${provider} yêu cầu thao tác trực tiếp. Hãy mở trang để tiếp tục.`,
        history
      };
    }

    if (result.statusCode === 429) {
      return {
        status: "blocked",
        destination: current.href,
        code: null,
        message: "Nhà cung cấp đang giới hạn yêu cầu. Vui lòng thử lại sau.",
        history
      };
    }

    if ([404, 410].includes(result.statusCode)) {
      return {
        status: "unsupported",
        destination: null,
        code: null,
        message: result.statusCode === 404
          ? "Không tìm thấy đường dẫn."
          : "Đường dẫn có thể đã hết hạn hoặc bị gỡ.",
        history
      };
    }

    if (result.statusCode >= 500) {
      return {
        status: "unsupported",
        destination: null,
        code: null,
        message: `Máy chủ nhà cung cấp gặp lỗi HTTP ${result.statusCode}.`,
        history
      };
    }

    if (REDIRECT_CODES.has(result.statusCode) && result.location) {
      current = validateUrl(new URL(result.location, current).href);
      continue;
    }

    if (result.statusCode >= 200 && result.statusCode < 300) {
      const supported = provider === "Link4m" || provider === "Traffic19";
      const workerResult = supported
        ? await inspectWithWorker(current.href)
        : null;

      return {
        status: workerResult?.status === "manual_required"
          ? "manual_required"
          : "verification_required",
        destination: current.href,
        code: null,
        worker: workerResult,
        message: workerResult?.message ||
          "Trang đã phản hồi. Hãy tiếp tục trực tiếp trên trang nhà cung cấp.",
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
      version: VERSION,
      status: "unsupported",
      message: "Chỉ hỗ trợ phương thức POST."
    });
  }

  let originalUrl = "";
  let provider = "Không xác định";

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
        version: VERSION,
        status: "unsupported",
        message: "Vui lòng nhập link hợp lệ."
      });
    }

    const url = validateUrl(body.url.trim());
    originalUrl = url.href;
    provider = getProvider(url.hostname);

    const result = await resolveRedirects(originalUrl);

    return res.status(200).json({
      version: VERSION,
      provider,
      originalUrl,
      code: null,
      ...result
    });
  } catch (error) {
    return res.status(200).json({
      version: VERSION,
      status: "unsupported",
      provider,
      originalUrl,
      destination: null,
      code: null,
      message: error.message || "Có lỗi khi xử lý liên kết.",
      history: []
    });
  }
}
