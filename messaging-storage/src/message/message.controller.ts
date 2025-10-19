import { Controller, Logger } from '@nestjs/common';

import { MessagePattern, Payload } from '@nestjs/microservices';
import { MessagesService } from './message.service';

@Controller()
export class MessageController {
    private readonly logger = new Logger(MessageController.name);

    constructor(private readonly messagesService: MessagesService) { }

    @MessagePattern('message.log')
    async handleMessageLog(@Payload() message: any) {
        const data = message?.value ?? message;

        this.logger.log(`[RECEIVED] from Kafka: ${JSON.stringify(data)}`);

        await this.messagesService.saveMessage(data);
    }

}
