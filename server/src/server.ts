import { createServer } from 'node:http';
import { createApp } from './app';
import { config } from './config/env';
import { connectDB } from './config/db';
import { initSocket } from './sockets';

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Server escuchando en http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
