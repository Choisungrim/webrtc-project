import { Module } from '@nestjs/common';
import { MessagingGateway } from './signaling.gateway';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [ClientsModule.register([
    {
      name: 'MESSAGE_PUBLISHER',
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'nestjs-consumer-server',
          brokers: ['localhost:9092'],
        },
        consumer: {
          groupId: 'message-storage-server',
          heartbeatInterval: 3000,
          sessionTimeout: 30000,
          retry: {
            retries: 10,
            initialRetryTime: 3000,
          },
        },
      },
    },
  ]),

  ],
  providers: [MessagingGateway],
})
export class SignalingModule { }
