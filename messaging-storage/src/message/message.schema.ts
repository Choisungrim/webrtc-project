import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
    @Prop({ required: true })
    type: string;

    @Prop({ type: Object })
    payload: any;

    @Prop()
    sender?: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
