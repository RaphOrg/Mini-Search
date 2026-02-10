import { readFile } from 'node:fs/promises';

import { getDocumentById, insertDocument, insertDocumentsBatch } from '../db/documents.js';

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(`Usage:
  node src/cli/documents.js add --title "..." --body "..."
  node src/cli/documents.js add --json '{"title":"...","body":"..."}'
  node src/cli/documents.js batch --file ./docs.json
  node src/cli/documents.js get --id 123

Notes:
- batch file format: {"documents":[{"title":"...","body":"..."}, ...]} or [{...}, {...}]
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    args[key] = val;
    i++;
  }
  return args;
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    process.exitCode = cmd ? 0 : 1;
    return;
  }

  const args = parseArgs(rest);

  if (cmd === 'add') {
    let payload;
    if (args.json) payload = JSON.parse(args.json);
    else payload = { title: args.title, body: args.body };

    const doc = await insertDocument({ title: payload.title, body: payload.body ?? payload.content });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ document: doc }, null, 2));
    return;
  }

  if (cmd === 'batch') {
    if (!args.file) throw new Error('--file is required');
    const raw = await readFile(args.file, 'utf8');
    const parsed = JSON.parse(raw);
    const docs = Array.isArray(parsed) ? parsed : parsed.documents ?? parsed.docs;
    const inserted = await insertDocumentsBatch(
      (docs ?? []).map((d) => ({ title: d.title, body: d.body ?? d.content, createdAt: d.created_at ?? d.createdAt }))
    );
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ documents: inserted, count: inserted.length }, null, 2));
    return;
  }

  if (cmd === 'get') {
    const id = args.id;
    if (!id) throw new Error('--id is required');
    const doc = await getDocumentById(id);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ document: doc }, null, 2));
    process.exitCode = doc ? 0 : 2;
    return;
  }

  printUsage();
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
}
