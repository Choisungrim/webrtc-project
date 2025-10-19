import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Offer, ConnectedSocket } from './interfaces/offer.interface';

@WebSocketGateway({
  cors: {
    origin: ['https://localhost:3000', 'https://192.168.100.20:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class SignalingGateway_COPY
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private offers: Offer[] = [];
  private connectedSockets: ConnectedSocket[] = [];

  handleConnection(socket: Socket) {
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if (password !== 'x') {
      socket.disconnect(true);
      return;
    }

    this.connectedSockets.push({ socketId: socket.id, userName });
    if (this.offers.length) socket.emit('availableOffers', this.offers);
  }
  // Disconnection handler
  handleDisconnect(socket: Socket) {
    this.connectedSockets = this.connectedSockets.filter(
      (s) => s.socketId !== socket.id,
    );
    this.offers = this.offers.filter((o) => o.socketId !== socket.id);
  }

  @SubscribeMessage('newOffer')
  handleNewOffer(socket: Socket, newOffer: any) {
    const userName = socket.handshake.auth.userName;
    const newOfferEntry: Offer = {
      offererUserName: userName,
      offer: newOffer,
      offerIceCandidates: [],
      answererUserName: null,
      answer: null,
      answererIceCandidates: [],
      socketId: socket.id,
    };

    this.offers = this.offers.filter((o) => o.offererUserName !== userName);
    this.offers.push(newOfferEntry);
    socket.broadcast.emit('newOfferAwaiting', [newOfferEntry]);
  }
  // Answer handler with ICE candidate acknowledgment
  @SubscribeMessage('newAnswer')
  async awaithandleNewAnswer(socket: Socket, offerObj: any) {
    const userName = socket.handshake.auth.userName;
    const offerToUpdate = this.offers.find(
      (o) => o.offererUserName === offerObj.offererUserName,
    );

    if (!offerToUpdate) return;

    // Send existing ICE candidates to answerer
    socket.emit('existingIceCandidates', offerToUpdate.offerIceCandidates);

    // Update offer with answer information
    offerToUpdate.answer = offerObj.answer;
    offerToUpdate.answererUserName = userName;
    offerToUpdate.answererSocketId = socket.id;

    // Notify both parties
    this.server
      .to(offerToUpdate.socketId)
      .emit('answerResponse', offerToUpdate);
    socket.emit('answerConfirmation', offerToUpdate);
  }
  // ICE candidate handler with storage
  @SubscribeMessage('sendIceCandidateToSignalingServer')
  handleIceCandidate(socket: Socket, iceCandidateObj: any) {
    const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;

    // Store candidate in the offer object
    const offer = this.offers.find((o) =>
      didIOffer
        ? o.offererUserName === iceUserName
        : o.answererUserName === iceUserName,
    );

    if (offer) {
      if (didIOffer) {
        offer.offerIceCandidates.push(iceCandidate);
      } else {
        offer.answererIceCandidates.push(iceCandidate);
      }
    }

    // Forward candidate to other peer
    const targetUserName = didIOffer
      ? offer?.answererUserName
      : offer?.offererUserName;
    const targetSocket = this.connectedSockets.find(
      (s) => s.userName === targetUserName,
    );

    if (targetSocket) {
      this.server
        .to(targetSocket.socketId)
        .emit('receivedIceCandidateFromServer', iceCandidate);
    }
  }
}
