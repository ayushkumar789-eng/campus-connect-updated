import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, '.mongodb_data');

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

// Self-heal stale lockfile from unclean shutdowns
const lockFile = path.join(dbPath, 'mongod.lock');
if (fs.existsSync(lockFile)) {
  try {
    const content = fs.readFileSync(lockFile, 'utf8').trim();
    if (content) {
      const pid = parseInt(content, 10);
      let isAlive = false;
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0);
          isAlive = true;
        } catch {
          isAlive = false;
        }
      }
      if (!isAlive) {
        console.log(`Clearing stale mongod.lock (dead process ${pid})...`);
        fs.writeFileSync(lockFile, '');
      }
    }
  } catch (err) {
    console.warn('Could not inspect mongod.lock:', err.message);
  }
}

function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

const isRunning = await checkPort(27017);

if (isRunning) {
  console.log('✅ MongoDB is already running on port 27017.');
  // Keep alive so process runner (concurrently) doesn't exit
  setInterval(() => {}, 1 << 30);
} else {
  console.log('Starting local MongoDB on port 27017 with persistent storage...');
  try {
    const mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbPath: dbPath,
        storageEngine: 'wiredTiger',
      },
    });

    console.log('✅ Local MongoDB started at: mongodb://127.0.0.1:27017/campusconnect');

    const cleanup = async () => {
      console.log('\nStopping MongoDB...');
      await mongod.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive so MongoDB stays running
    setInterval(() => {}, 1 << 30);
  } catch (err) {
    console.error('Failed to start MongoDB:', err);
    process.exit(1);
  }
}
