export type LiveStream = {
  id: string;
  streamer: string;
  title: string;
  category: string;
  viewers: string;
  tags: string[];
  bgColor: string;
};

export const liveStreams: LiveStream[] = [
  {
    id: "ls1",
    streamer: "vault_king",
    title: "Ripping a PSA 10 Charizard Case 🔥",
    category: "Pokémon",
    viewers: "2.4K",
    tags: ["Pack Opening", "Vintage"],
    bgColor: "#0A1628",
  },
  {
    id: "ls2",
    streamer: "mtg_legend",
    title: "Alpha Edition Draft Night",
    category: "MTG",
    viewers: "1.1K",
    tags: ["Draft", "Rare Pulls"],
    bgColor: "#0D0A1E",
  },
  {
    id: "ls3",
    streamer: "sports_slabs",
    title: "NBA Prizm Blaster Opening Marathon",
    category: "Sports",
    viewers: "890",
    tags: ["Basketball", "Prizm"],
    bgColor: "#0A1A14",
  },
  {
    id: "ls4",
    streamer: "poke_grader",
    title: "Live Grading Session — Your Cards!",
    category: "Pokémon",
    viewers: "3.7K",
    tags: ["Grading", "Interactive"],
    bgColor: "#1A0E0A",
  },
  {
    id: "ls5",
    streamer: "ygo_vault",
    title: "Starlight Rare Hunt 💎 25th Anniversary",
    category: "YGO",
    viewers: "640",
    tags: ["Pack Opening", "YuGiOh"],
    bgColor: "#0E0A1A",
  },
  {
    id: "ls6",
    streamer: "collector_x",
    title: "Auction Night — Starting at RM1!",
    category: "Mixed",
    viewers: "5.1K",
    tags: ["Auction", "Deals"],
    bgColor: "#0A0F1E",
  },
];
