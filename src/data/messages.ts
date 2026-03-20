export type OfferStatus = "pending" | "accepted" | "declined" | "countered";

export type BaseMessage = {
  id: string;
  senderId: string;
  timestamp: string;
  isMe: boolean;
};

export type TextMessage = BaseMessage & {
  kind: "text";
  text: string;
};

export type OfferMessage = BaseMessage & {
  kind: "offer";
  amount: string;
  cardName: string;
  status: OfferStatus;
};

export type Message = TextMessage | OfferMessage;

export type Conversation = {
  id: string;
  user: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  online: boolean;
  topic?: string;
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    user: "vault_king",
    lastMessage: "Sent you an offer: $7,800",
    timestamp: "2m",
    unread: 2,
    online: true,
    topic: "Charizard Holo PSA 10",
  },
  {
    id: "c2",
    user: "mtg_legend",
    lastMessage: "Offer accepted! I'll ship tomorrow.",
    timestamp: "14m",
    unread: 0,
    online: true,
    topic: "Black Lotus BGS 9.5",
  },
  {
    id: "c3",
    user: "poke_grader",
    lastMessage: "Do you have the receipt for the grade?",
    timestamp: "1h",
    unread: 1,
    online: false,
    topic: "Pikachu Illustrator PSA 7",
  },
  {
    id: "c4",
    user: "sports_slabs",
    lastMessage: "Thanks for the purchase! Tracking sent.",
    timestamp: "3h",
    unread: 0,
    online: false,
    topic: "Luka Doncic RC PSA 10",
  },
  {
    id: "c5",
    user: "slab_hunter",
    lastMessage: "Is the centering on the front 60/40?",
    timestamp: "1d",
    unread: 0,
    online: false,
    topic: "Blastoise Holo PSA 9",
  },
  {
    id: "c6",
    user: "ygo_vault",
    lastMessage: "Interested — is it still available?",
    timestamp: "1d",
    unread: 0,
    online: false,
    topic: "Dark Magician CGC 9.5",
  },
];

export const mockMessages: Record<string, Message[]> = {
  c1: [
    { id: "m1", senderId: "vault_king", timestamp: "10:02 AM", isMe: false, kind: "text", text: "Hey! Interested in the Charizard Holo PSA 10?" },
    { id: "m2", senderId: "me", timestamp: "10:04 AM", isMe: true, kind: "text", text: "Yes! What's your best price?" },
    { id: "m3", senderId: "vault_king", timestamp: "10:06 AM", isMe: false, kind: "offer", amount: "$8,000", cardName: "Charizard Holo PSA 10", status: "declined" },
    { id: "m4", senderId: "me", timestamp: "10:10 AM", isMe: true, kind: "offer", amount: "$7,600", cardName: "Charizard Holo PSA 10", status: "countered" },
    { id: "m5", senderId: "vault_king", timestamp: "10:12 AM", isMe: false, kind: "offer", amount: "$7,800", cardName: "Charizard Holo PSA 10", status: "pending" },
  ],
  c2: [
    { id: "m1", senderId: "mtg_legend", timestamp: "9:00 AM", isMe: false, kind: "text", text: "Hi, saw your offer on the Black Lotus. Are you serious?" },
    { id: "m2", senderId: "me", timestamp: "9:05 AM", isMe: true, kind: "text", text: "100%. I can pay immediately via bank transfer." },
    { id: "m3", senderId: "me", timestamp: "9:08 AM", isMe: true, kind: "offer", amount: "$95,000", cardName: "Black Lotus BGS 9.5", status: "accepted" },
    { id: "m4", senderId: "mtg_legend", timestamp: "9:20 AM", isMe: false, kind: "text", text: "Offer accepted! I'll ship tomorrow." },
  ],
  c3: [
    { id: "m1", senderId: "poke_grader", timestamp: "Yesterday", isMe: false, kind: "text", text: "Hey, is the Pikachu Illustrator still available?" },
    { id: "m2", senderId: "me", timestamp: "Yesterday", isMe: true, kind: "text", text: "Yes it is!" },
    { id: "m3", senderId: "poke_grader", timestamp: "Yesterday", isMe: false, kind: "text", text: "Do you have the receipt for the grade?" },
  ],
};
