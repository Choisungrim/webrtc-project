import { Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  constructor(
    @Inject('MESSAGE_PUBLISHER') private readonly kafka: ClientKafka,
  ) { }

  //loop
  async connectKafkaWithRetry(maxRetries = 10, delay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.kafka.connect();
        console.log('Connected to Kafka');
        return;
      } catch (err) {
        console.warn(`Kafka connection failed, retrying... (${i + 1}/${maxRetries})`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error('Could not connect to Kafka after retries');
  }

  async onModuleInit() {
    await this.connectKafkaWithRetry();
    await new Promise((res) => setTimeout(res, 2000));
    this.kafka.subscribeToResponseOf('message.log');
  }


  handleConnection(socket: Socket) {
    const userName = socket.handshake.auth?.userName;
    console.log(`WebSocket Connected: ${userName} (${socket.id})`);
  }

  handleDisconnect(socket: Socket) {
    console.log(`Disconnected: ${socket.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() data: { room: string }, @ConnectedSocket() socket: Socket) {
    const { room } = data;
    socket.join(room);
  }

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() msg: any,
    @ConnectedSocket() socket: Socket,
  ) {
    console.log(`[RECEIVED]:`, msg);

    switch (msg.type) {
      case 'chat':
        this.server.emit('chatMessage', msg);
        break;

      case 'command':
        this.server.emit('robotCommand', msg);
        break;

      case 'telemetry':
        this.server.emit('robotTelemetry', msg);
        break;

      case 'status':
        this.server.emit('statusUpdate', msg);
        break;

      default:
        console.warn('Unknown type:', msg.type);
        break;
    }
    console.log(msg)

    this.kafka.emit('message.log', msg).subscribe({
      next: () => console.log("Kafka Publish"),
      error: (err) => console.error("Kafka Publish error", err)
    });
  }
}
