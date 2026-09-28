import { spawn } from 'node:child_process';

const trainingPort = String(process.env.TRAINING_PORT || 3001);
const training = spawn(process.execPath, ['src/training-server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: trainingPort }
});

training.on('exit', (code, signal) => {
  console.error(`[varangym] training API exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  if (code !== 0) process.exit(code || 1);
});

await import('./server.js');

for (const sig of ['SIGTERM','SIGINT']) {
  process.on(sig, () => {
    if (!training.killed) training.kill(sig);
  });
}
