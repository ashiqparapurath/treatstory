/** Routing/display metadata only. Message plaintext and private keys never belong here. */
export type SupportChatTicket = {
  id: string;
  ownerUid: string;
  category: string;
  orderId?: string;
  subject?: string;
  status: string;
  participantLabel?: string;
  unread?: number;
  lastPreview?: string;
  encrypted?: boolean;
  createdAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
};
