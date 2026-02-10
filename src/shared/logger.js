function serializeMeta(meta) {
  if (!meta) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return ' ' + String(meta);
  }
}

export const logger = {
  info(message, meta) {
    process.stdout.write(`[info] ${message}${serializeMeta(meta)}\n`);
  },
  error(message, meta) {
    process.stderr.write(`[error] ${message}${serializeMeta(meta)}\n`);
  },
};
