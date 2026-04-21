import cluster from 'node:cluster';
import os from 'node:os';

const maxWorkers = Number(process.env.API_CLUSTER_WORKERS || 0);
const cpuCount = os.cpus().length;
const workers = maxWorkers > 0 ? maxWorkers : Math.max(1, cpuCount - 1);

if (cluster.isPrimary) {
  // eslint-disable-next-line no-console
  console.log(`Starting API cluster with ${workers} workers`);

  for (let i = 0; i < workers; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    const timestamp = new Date().toISOString();
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    // eslint-disable-next-line no-console
    console.error(`[${timestamp}] Worker ${worker.process.pid} exited (${reason}). Restarting...`);
    cluster.fork();
  });
} else {
  await import('./index.js');
}
