export type Listing = {
  id: string;
  cardName: string;
  edition: string;
  grade: string;
  price: string;
  seller: string;
  postedAt: string;
  category: string;
  description: string;
  views: number;
  condition: string;
  sellerRating: number;
  sellerSales: number;
  stockAvailable: number;
};

export type WantedPost = {
  id: string;
  cardName: string;
  edition: string;
  gradeWanted: string;
  offerPrice: string;
  buyer: string;
  postedAt: string;
  category: string;
  description: string;
  views: number;
  buyerRating: number;
  buyerPurchases: number;
};

export const MARKET_FILTERS = ["All", "Pokémon", "MTG", "Sports", "YGO"];

export const listings: Listing[] = [
  {
    id: "l1",
    cardName: "Charizard Holo",
    edition: "1999 Base Set",
    grade: "PSA 10",
    price: "$8,240",
    seller: "vault_king",
    postedAt: "2h ago",
    category: "Pokémon",
    description:
      "Gem Mint PSA 10 Charizard from the original 1999 Base Set. One of the most iconic and sought-after cards in the hobby. Clean holo with no visible scratches or whitening. Comes with original PSA case in excellent condition.",
    views: 1842,
    condition: "Gem Mint",
    sellerRating: 4.9,
    sellerSales: 247,
    stockAvailable: 3,
  },
  {
    id: "l2",
    cardName: "Black Lotus",
    edition: "Alpha Edition",
    grade: "BGS 9.5",
    price: "$124,500",
    seller: "mtg_legend",
    postedAt: "5h ago",
    category: "MTG",
    description:
      "Near-perfect BGS 9.5 Alpha Black Lotus. The crown jewel of Magic: The Gathering. Sub-grades: Centering 9, Corners 9.5, Edges 10, Surface 9.5. Authenticated and in tamper-proof BGS case.",
    views: 5631,
    condition: "Gem Mint",
    sellerRating: 5.0,
    sellerSales: 89,
    stockAvailable: 1,
  },
  {
    id: "l3",
    cardName: "Pikachu Illustrator",
    edition: "CoroCoro Promo",
    grade: "PSA 7",
    price: "$52,000",
    seller: "poke_grader",
    postedAt: "1d ago",
    category: "Pokémon",
    description:
      "One of the rarest Pokémon cards in existence, awarded in the 1998 CoroCoro Illustration Contest. PSA 7 with light edge wear consistent with grade. Only 39 known copies graded by PSA.",
    views: 3214,
    condition: "Near Mint",
    sellerRating: 4.8,
    sellerSales: 156,
    stockAvailable: 2,
  },
  {
    id: "l4",
    cardName: "Shohei Ohtani RC",
    edition: "2018 Topps Chrome",
    grade: "PSA 10",
    price: "$4,120",
    seller: "sports_slabs",
    postedAt: "3h ago",
    category: "Sports",
    description:
      "PSA 10 Gem Mint Shohei Ohtani Rookie Card from 2018 Topps Chrome. A modern grail in the sports card market. Sharp corners and flawless chrome finish.",
    views: 982,
    condition: "Gem Mint",
    sellerRating: 4.7,
    sellerSales: 312,
    stockAvailable: 4,
  },
  {
    id: "l5",
    cardName: "Dark Magician",
    edition: "LOB 1st Edition",
    grade: "CGC 9",
    price: "$3,800",
    seller: "ygo_vault",
    postedAt: "6h ago",
    category: "YGO",
    description:
      "CGC 9 Mint Dark Magician from Legend of Blue Eyes 1st Edition. A cornerstone of any Yu-Gi-Oh! collection. Beautiful centering with strong eye appeal.",
    views: 671,
    condition: "Mint",
    sellerRating: 4.6,
    sellerSales: 198,
    stockAvailable: 5,
  },
  {
    id: "l6",
    cardName: "Blastoise Holo",
    edition: "1999 Base Set",
    grade: "PSA 9",
    price: "$2,100",
    seller: "slab_hunter",
    postedAt: "12h ago",
    category: "Pokémon",
    description:
      "PSA 9 Mint Base Set Blastoise. Clean holo with strong centering. A classic Pokémon card that pairs perfectly with any Base Set collection.",
    views: 542,
    condition: "Mint",
    sellerRating: 4.5,
    sellerSales: 78,
    stockAvailable: 2,
  },
];

export const wantedPosts: WantedPost[] = [
  {
    id: "w1",
    cardName: "Charizard Holo",
    edition: "1st Edition Base Set",
    gradeWanted: "PSA 10",
    offerPrice: "$30,000+",
    buyer: "collector_x",
    postedAt: "1h ago",
    category: "Pokémon",
    description:
      "Looking for a PSA 10 1st Edition Base Set Charizard. Must be in original PSA case with no cracks or scratches on the holder. Willing to negotiate above asking price for the right card.",
    views: 2340,
    buyerRating: 4.9,
    buyerPurchases: 134,
  },
  {
    id: "w2",
    cardName: "Mox Ruby",
    edition: "Alpha Edition",
    gradeWanted: "PSA 8+",
    offerPrice: "$8,000",
    buyer: "mtg_grinder",
    postedAt: "4h ago",
    category: "MTG",
    description:
      "Seeking Alpha Mox Ruby in PSA 8 or higher. Part of a Power Nine completion project. Can also consider BGS graded copies. Serious buyer with verified funds.",
    views: 876,
    buyerRating: 4.7,
    buyerPurchases: 67,
  },
  {
    id: "w3",
    cardName: "Lugia Holo",
    edition: "Neo Genesis 1st Ed",
    gradeWanted: "PSA 9 or 10",
    offerPrice: "$6,500",
    buyer: "neo_hunter",
    postedAt: "8h ago",
    category: "Pokémon",
    description:
      "Want to buy Neo Genesis 1st Edition Lugia in PSA 9 or 10. Prefer strong centering. Building a complete Neo set in high grade.",
    views: 1102,
    buyerRating: 4.8,
    buyerPurchases: 89,
  },
  {
    id: "w4",
    cardName: "LeBron James RC",
    edition: "2003 Topps Chrome",
    gradeWanted: "BGS 9.5",
    offerPrice: "$20,000",
    buyer: "hoop_slabs",
    postedAt: "2d ago",
    category: "Sports",
    description:
      "Looking for a BGS 9.5 2003 Topps Chrome LeBron James Rookie. Prefer strong sub-grades (9.5+ on centering). Also open to PSA 10 at adjusted price.",
    views: 1567,
    buyerRating: 4.6,
    buyerPurchases: 45,
  },
  {
    id: "w5",
    cardName: "Blue-Eyes White Dragon",
    edition: "SDK 1st Edition",
    gradeWanted: "CGC 9+",
    offerPrice: "$2,400",
    buyer: "duel_king",
    postedAt: "1d ago",
    category: "YGO",
    description:
      "Searching for a CGC 9 or higher SDK 1st Edition Blue-Eyes White Dragon. Prefer clean case with no reholder marks.",
    views: 498,
    buyerRating: 4.5,
    buyerPurchases: 32,
  },
];
