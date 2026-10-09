// Disposable development/test fixture, NOT the persistent local deployment.
// For persistent local data use the repository's compose.yaml instead.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const mongo = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27017 }],
  replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger', ip: '127.0.0.1' },
});
console.log(
  'Test MongoDB replica set ready at mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await mongo.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
