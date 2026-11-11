
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

  const publicRecords = records.filter(
    record => isPublicIPv4(record.address)
  );

  if (publicRecords.length === 0) {
    throw new Error("Không tìm thấy IP IPv4 công khai.");
  }

  return publicRecords[0].address;
}
