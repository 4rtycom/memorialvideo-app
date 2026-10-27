export const project = {
  brand: "memorialvideo",
  title: "Eleanor’s remembrance",
  person: "Eleanor Williams",
  years: "1948 – 2025",
  ownerInitial: "S",
  invitePath: "memorialvideo.app/add/eleanor-7h...",
  watchPath: "memorialvideo.app/watch/eleanor…",
} as const;

export const navItems = [
  { href: "/", label: "Overview", icon: "⌂" },
  { href: "/memories", label: "Memories", icon: "▦" },
  { href: "/contributors", label: "Contributors", icon: "♧" },
  { href: "/life-story", label: "Life story", icon: "◈" },
  { href: "/film", label: "The film", icon: "▷" },
  { href: "/music", label: "Music & words", icon: "♫" },
  { href: "/share", label: "Share & download", icon: "↓" },
] as const;

export const memories = [
  { id: "b", year: "1948", title: "A little girl with a big smile", status: "✓ Enhanced", image: "/fixtures/memory-b.png" },
  { id: "a", year: "1966", title: "A day to remember", status: "Ready for film", image: "/fixtures/memory-a.png" },
  { id: "f", year: "1971", title: "Together from the start", status: "Ready for film", image: "/fixtures/memory-f.png" },
  { id: "d", year: "1988", title: "Summer with the family", status: "From Sophie", image: "/fixtures/memory-d.png" },
  { id: "e", year: "1996", title: "Afternoons outdoors", status: "Ready for film", image: "/fixtures/memory-e.png" },
  { id: "c", year: "2018", title: "A favourite afternoon", status: "Ready for film", image: "/fixtures/memory-c.png" },
] as const;

export const chapters = [
  { id: "01", title: "The early years", count: "8 memories", image: "/fixtures/chapter-b.png" },
  { id: "02", title: "Finding her people", count: "11 memories", image: "/fixtures/chapter-f.png" },
  { id: "03", title: "A life full of love", count: "17 memories", image: "/fixtures/chapter-d.png" },
  { id: "04", title: "All the joy she gave", count: "12 memories", image: "/fixtures/chapter-c.png" },
] as const;

export const filmChapters = [
  "01  The early years",
  "02  The people she loved",
  "03  The joyful days",
  "04  Forever close",
] as const;

/** All five FilmStyleManifest keys — first-class in the creator desk. */
export const styles = [
  {
    id: "timeless",
    title: "Timeless",
    desc: "Tender paper light, quiet dissolve, soft editorial frames.",
    image: "/fixtures/chapter-b.png",
    swatch: "#F6F1E8",
    accent: "#A9784C",
  },
  {
    id: "warm_light",
    title: "Warm Light",
    desc: "Golden afternoons, full-bleed photos, a gentle warm grade.",
    image: "/fixtures/chapter-c.png",
    swatch: "#F3E3CF",
    accent: "#C46A3A",
  },
  {
    id: "cinematic_dark",
    title: "Cinematic Dark",
    desc: "Spotlight stills, deeper grain, bold titles on night matte.",
    image: "/fixtures/studio-j.png",
    swatch: "#121418",
    accent: "#D4B483",
  },
  {
    id: "family_album",
    title: "Family Album",
    desc: "Album pacing, soft grain, editorial chapters that feel close.",
    image: "/fixtures/studio-f.png",
    swatch: "#EFE6D6",
    accent: "#8B5A3C",
  },
  {
    id: "simple_contemporary",
    title: "Simple & Contemporary",
    desc: "Clean type, calm fades, a restrained modern grade.",
    image: "/fixtures/chapter-d.png",
    swatch: "#F4F2EE",
    accent: "#4A5560",
  },
] as const;

export const soundtrack = [
  { title: "Quiet piano", desc: "Soft, timeless and gentle", duration: "03:12", selected: true },
  { title: "Golden afternoon", desc: "Warm acoustic, full of life", duration: "03:45", selected: false },
  { title: "A peaceful moment", desc: "Thoughtful, calm strings", duration: "04:07", selected: false },
] as const;

export const incoming = [
  { from: "From Sophie", title: "Eleanor’s favourite park", image: "/fixtures/memory-c.png" },
  { from: "From Mark", title: "The whole family together", image: "/fixtures/memory-d.png" },
  { from: "From Anna", title: "A beautiful day in June", image: "/fixtures/memory-f.png" },
] as const;

export const storyMoments = [
  { id: "01", title: "The early years", image: "/fixtures/edit-b.png", active: false },
  { id: "02", title: "Finding love", image: "/fixtures/edit-f.png", active: true },
  { id: "03", title: "Family together", image: "/fixtures/edit-d.png", active: false },
  { id: "04", title: "A lasting legacy", image: "/fixtures/edit-c.png", active: false },
] as const;
