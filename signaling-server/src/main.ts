import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./livekit.host.com+1-key.pem'),
    cert: fs.readFileSync('./livekit.host.com+1.pem'),
  };

  const app = await NestFactory.create(AppModule, { httpsOptions });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: ['localhost:9092'] },
      consumer: { groupId: 'message-storage' },
    },
  });
  app.useWebSocketAdapter(new IoAdapter(app));


  const localAddr = '172.30.1.48';
  const localPort = 3000;
  const listenPort = 8181;
  const https = 'https://';
  app.enableCors({
    origin: [
      `${https}${localAddr}:${localPort}`,
      `${https}localhost:${localPort}`,
    ],
    credential: true,
  });
  await app.startAllMicroservices();
  await app.listen(listenPort);
  console.log(`Signaling server running on ${https}${localAddr}:${listenPort}`);
}
bootstrap();
