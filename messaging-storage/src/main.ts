import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.KAFKA,
      options: {
        client: { brokers: ['localhost:9092'] },
        consumer: { groupId: 'message-storage-server-mongo' },
        subscribe: { topics: ['message.log'], fromBeginning: true },
      },
    },
  );

  await app.startAllMicroservices();
  await app.listen(3001);
  console.log('Microservice is running...');
}
bootstrap();
