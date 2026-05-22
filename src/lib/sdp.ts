export function normalizeSdpString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const decoded = value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = decoded
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return undefined;
  }

  return `${lines.join('\r\n')}\r\n`;
}
