import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './message.schema';

@Injectable()
export class MessagesService {
    constructor(
        @InjectModel(Message.name) private messageModel: Model<Message>,
    ) { }

    async saveMessage(data: any) {
        console.log('save to mongodb:', data);
        return await this.messageModel.create({
            type: data.type,
            payload: data,
            sender: data.sender || null,
        });
    }

}
