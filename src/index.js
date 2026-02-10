import { startServer } from './server/server.js';
import { initAppIndex } from './state/index.js';

// Phase 1: seed a tiny in-memory corpus so /search can be exercised via curl.
// In later phases, this will be replaced with a real ingestion/indexing pipeline.
initAppIndex([
  {
    id: 1,
    text: 'the quick brown fox jumps over the lazy dog',
  },
  {
    id: 2,
    text: 'the quick red fox leaped over the sleeping cat',
  },
  {
    id: 3,
    text: 'cats and dogs can be friends',
  },
]);

startServer();
