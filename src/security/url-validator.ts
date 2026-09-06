const INTERNAL_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
];

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.aws.internal',
  'instance-data.ec2.internal',
  'metadata.azure.internal',
]);

export type HostnameResolver = {
  resolve(hostname: string): Promise<string[]>;
};

export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function validatePublicHttpUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UnsafeUrlError('올바른 웹사이트 URL을 입력해 주세요.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('http 또는 https URL만 지원합니다.');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('사용자 정보가 포함된 URL은 지원하지 않습니다.');
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isInternalHostname(hostname)) {
    throw new UnsafeUrlError('내부 네트워크 주소는 분석할 수 없습니다.');
  }

  const ip = parseIpAddress(hostname);
  if (ip && !isPublicIpAddress(ip)) {
    throw new UnsafeUrlError('공개 인터넷 IP 주소만 분석할 수 있습니다.');
  }

  return url;
}

export async function validateResolvedPublicUrl(
  input: string | URL,
  resolver: HostnameResolver,
) {
  const url = validatePublicHttpUrl(input.toString());
  const hostname = normalizeHostname(url.hostname);
  const literalIp = parseIpAddress(hostname);
  if (literalIp) return { url, addresses: [hostname] };

  let addresses: string[];
  try {
    addresses = await resolver.resolve(hostname);
  } catch {
    throw new UnsafeUrlError('웹사이트 주소의 DNS 정보를 확인하지 못했습니다.');
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError('웹사이트 주소의 공개 IP를 확인하지 못했습니다.');
  }

  const normalizedAddresses = [...new Set(addresses.map(normalizeHostname))];
  if (
    normalizedAddresses.some((address) => {
      const parsed = parseIpAddress(address);
      return !parsed || !isPublicIpAddress(parsed);
    })
  ) {
    throw new UnsafeUrlError(
      '내부 네트워크로 연결되는 웹사이트는 분석할 수 없습니다.',
    );
  }

  return { url, addresses: normalizedAddresses };
}

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function isInternalHostname(hostname: string) {
  if (hostname === 'localhost' || METADATA_HOSTS.has(hostname)) return true;
  if (INTERNAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }
  return !hostname.includes('.') && !parseIpAddress(hostname);
}

type ParsedIp =
  | { version: 4; bytes: [number, number, number, number] }
  | { version: 6; parts: number[] };

function parseIpAddress(hostname: string): ParsedIp | null {
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return { version: 4, bytes: ipv4 };
  const ipv6 = parseIpv6(hostname);
  return ipv6 ? { version: 6, parts: ipv6 } : null;
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (bytes.some((byte) => !Number.isInteger(byte) || byte > 255)) return null;
  return bytes as [number, number, number, number];
}

function parseIpv6(value: string) {
  if (!value.includes(':') || value.includes('%')) return null;
  let normalized = value;
  const ipv4Tail = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const bytes = parseIpv4(ipv4Tail);
    if (!bytes) return null;
    const first = ((bytes[0] << 8) | bytes[1]).toString(16);
    const second = ((bytes[2] << 8) | bytes[3]).toString(16);
    normalized = normalized.slice(0, -ipv4Tail.length) + `${first}:${second}`;
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const [left = '', right = ''] = normalized.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  if (
    [...leftParts, ...rightParts].some((part) => !/^[\da-f]{1,4}$/i.test(part))
  ) {
    return null;
  }

  const missing = 8 - leftParts.length - rightParts.length;
  if (normalized.includes('::') ? missing < 1 : missing !== 0) return null;
  return [
    ...leftParts.map((part) => Number.parseInt(part, 16)),
    ...Array.from({ length: missing }, () => 0),
    ...rightParts.map((part) => Number.parseInt(part, 16)),
  ];
}

function isPublicIpAddress(ip: ParsedIp) {
  if (ip.version === 4) return isPublicIpv4(ip.bytes);

  const parts = ip.parts;
  if (parts.every((part) => part === 0)) return false;
  if (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) {
    return false;
  }
  if ((parts[0] & 0xfe00) === 0xfc00) return false;
  if ((parts[0] & 0xffc0) === 0xfe80) return false;
  if ((parts[0] & 0xff00) === 0xff00) return false;

  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  const isNat64 =
    parts[0] === 0x64 &&
    parts[1] === 0xff9b &&
    parts.slice(2, 6).every((part) => part === 0);
  if (isIpv4Mapped || isNat64) {
    return isPublicIpv4([
      parts[6] >> 8,
      parts[6] & 0xff,
      parts[7] >> 8,
      parts[7] & 0xff,
    ]);
  }

  return true;
}

function isPublicIpv4([a, b]: [number, number, number, number]) {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}
