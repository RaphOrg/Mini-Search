import { buildInvertedIndex } from './build.js';
import { closePool } from '../shared/db.js';
import { config } from '../shared/config.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export async function runIndexCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const batchSize = args.batchSize ? Number(args.batchSize) : config.indexBatchSize;
  const persistPath = args.persistPath ?? config.indexPersistPath;

  const index = await buildInvertedIndex({ batchSize, persistPath });

  const termCount = index.postings.size;
  console.log(JSON.stringify({ docCount: index.docCount, termCount }, null, 2));

  // Print a few sample terms deterministically.
  const sampleTerms = [...index.postings.keys()].sort().slice(0, 10);
  for (const t of sampleTerms) {
    console.log(t, index.postings.get(t).slice(0, 5));
  }

  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIndexCli().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
