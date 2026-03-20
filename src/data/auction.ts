export type AuctionItem = {
  id: string;
  cardName: string;
  edition: string;
  grade: string;
  currentBid: string;
  bidCount: number;
  watchers: number;
  timeLeft: string;
  seller: string;
  category: string;
};

export const AUCTION_FILTERS = ["All", "Pokémon", "MTG", "Sports", "YGO"];

export const auctionItems: AuctionItem[] = [
  {
    id: "a1",
    cardName: "Charizard Holo",
    edition: "1st Edition Base Set",
    grade: "PSA 10",
    currentBid: "$28,500",
    bidCount: 47,
    watchers: 312,
    timeLeft: "2h 14m",
    seller: "vault_king",
    category: "Pokémon",
  },
  {
    id: "a2",
    cardName: "Black Lotus",
    edition: "Beta Edition",
    grade: "BGS 9",
    currentBid: "$98,000",
    bidCount: 31,
    watchers: 540,
    timeLeft: "45m",
    seller: "mtg_legend",
    category: "MTG",
  },
  {
    id: "a3",
    cardName: "Luka Doncic RC",
    edition: "2018 Prizm Silver",
    grade: "PSA 10",
    currentBid: "$6,200",
    bidCount: 22,
    watchers: 88,
    timeLeft: "5h 30m",
    seller: "sports_slabs",
    category: "Sports",
  },
  {
    id: "a4",
    cardName: "Pikachu Illustrator",
    edition: "CoroCoro Promo",
    grade: "PSA 7",
    currentBid: "$48,000",
    bidCount: 58,
    watchers: 720,
    timeLeft: "18m",
    seller: "poke_grader",
    category: "Pokémon",
  },
  {
    id: "a5",
    cardName: "Dark Magician",
    edition: "LOB 1st Edition",
    grade: "CGC 9.5",
    currentBid: "$4,100",
    bidCount: 15,
    watchers: 64,
    timeLeft: "12h 30m",
    seller: "ygo_vault",
    category: "YGO",
  },
  {
    id: "a6",
    cardName: "Blastoise Holo",
    edition: "1st Edition Base Set",
    grade: "PSA 9",
    currentBid: "$3,800",
    bidCount: 19,
    watchers: 143,
    timeLeft: "1h 05m",
    seller: "slab_hunter",
    category: "Pokémon",
  },
];
