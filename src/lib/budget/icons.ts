/**
 * The icon set offered when naming a category, account, goal or policy.
 *
 * Curated from `lucide-react`, which the app already ships — it is the same
 * family of stroke icons as Phosphor, so adding a second icon library would
 * have cost bundle size and given two slightly different stroke weights sitting
 * next to each other. Icons are imported by name rather than via a namespace
 * import so the bundler can drop the other ~5,000.
 *
 * Icons are stored by their string key in `iconName`, so renaming a key orphans
 * every record using it. Add freely; rename carefully.
 */

import {
  Accessibility, Activity, Anchor, Apple, Armchair, ArrowLeftRight, Award,
  BadgeIndianRupee, Backpack, Bandage, Banknote, Bath, Battery, Baby, Bed, Beef, Beer,
  Bell, Bike, Bird, BookOpen, Bookmark, Brain, Briefcase, Bug, Building2, Bus,
  Cake, CakeSlice, Calculator, Camera, Car, CarTaxiFront, Cat, ChartLine, ChartPie,
  Church, Cigarette, Clock, Cloud, Coffee, Coins, Compass, Cookie, Cpu, CreditCard,
  Croissant, Cross, CupSoda,
  Dices, Dog, Drama, Droplet, Droplets, Dumbbell,
  Egg,
  FileText, Film, Fish, Flag, Flame, Flower2, Footprints, Fuel,
  Gamepad2, Gem, Gift, Glasses, Globe, GraduationCap, Guitar,
  HandCoins, HandHeart, Hammer, HardDrive, Headphones, Heart, HeartPulse, Hospital,
  Hotel, House,
  IceCream, Infinity as InfinityIcon,
  Key, Keyboard,
  Landmark, Laptop, Leaf, Library, Lightbulb, Lock, Luggage,
  Map as MapIcon, MapPin, Milk, Monitor, Mountain, Mouse, Music,
  PaintRoller, Palette, Palmtree, Package, Package as Parcel, ParkingMeter, PartyPopper,
  PawPrint, PenTool, Percent, PiggyBank, Pill, Pizza, Plane, Plug, Popcorn,
  Presentation, Printer, Puzzle,
  Radio, Receipt, Recycle, Rocket,
  Salad, Sandwich, Scale, School, Scissors, Server, Shield, Shirt, ShoppingBag,
  ShoppingBasket, ShoppingCart, Ship, Smartphone, Smile, Snowflake, Sofa, Sparkles,
  Sprout, Star, Stethoscope, Store, Sun, Syringe,
  Tag, Target, Tent, Ticket, TrainFront, TramFront, Trash2, Trees, TrendingDown,
  TrendingUp, Truck, Tv,
  Umbrella, User, Users, Utensils, UtensilsCrossed,
  Vault,
  Wallet, WashingMachine, Watch, Wifi, Wine, Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface IconGroup {
  title: string;
  icons: { name: string; icon: LucideIcon; keywords?: string }[];
}

/**
 * Grouped so the picker can be scanned by eye, and keyworded so search finds
 * things by what they are used *for* — "electricity" should find the bulb.
 */
export const ICON_GROUPS: IconGroup[] = [
  {
    title: "Food & drink",
    icons: [
      { name: "utensils", icon: Utensils, keywords: "food dining restaurant eat meal" },
      { name: "utensils-crossed", icon: UtensilsCrossed, keywords: "food dining cutlery" },
      { name: "coffee", icon: Coffee, keywords: "cafe tea chai drink breakfast" },
      { name: "pizza", icon: Pizza, keywords: "food takeaway fast food" },
      { name: "sandwich", icon: Sandwich, keywords: "food lunch snack" },
      { name: "salad", icon: Salad, keywords: "food healthy vegetables" },
      { name: "beef", icon: Beef, keywords: "meat food non veg" },
      { name: "fish", icon: Fish, keywords: "seafood food non veg" },
      { name: "egg", icon: Egg, keywords: "food breakfast" },
      { name: "milk", icon: Milk, keywords: "dairy groceries" },
      { name: "croissant", icon: Croissant, keywords: "bakery bread breakfast" },
      { name: "cookie", icon: Cookie, keywords: "snack biscuit sweets" },
      { name: "cake-slice", icon: CakeSlice, keywords: "dessert sweets bakery" },
      { name: "ice-cream", icon: IceCream, keywords: "dessert sweets treat" },
      { name: "apple", icon: Apple, keywords: "fruit healthy groceries" },
      { name: "cup-soda", icon: CupSoda, keywords: "drink soft drink juice" },
      { name: "beer", icon: Beer, keywords: "alcohol drinks bar pub" },
      { name: "wine", icon: Wine, keywords: "alcohol drinks bar" },
      { name: "shopping-basket", icon: ShoppingBasket, keywords: "groceries supermarket" },
    ],
  },
  {
    title: "Transport",
    icons: [
      { name: "car", icon: Car, keywords: "vehicle drive auto" },
      { name: "car-taxi", icon: CarTaxiFront, keywords: "taxi cab uber ola ride" },
      { name: "bus", icon: Bus, keywords: "public transport commute" },
      { name: "train", icon: TrainFront, keywords: "rail metro commute" },
      { name: "tram", icon: TramFront, keywords: "metro local transport" },
      { name: "plane", icon: Plane, keywords: "flight travel airfare" },
      { name: "ship", icon: Ship, keywords: "boat ferry cruise" },
      { name: "bike", icon: Bike, keywords: "cycle bicycle scooter" },
      { name: "truck", icon: Truck, keywords: "delivery moving freight" },
      { name: "fuel", icon: Fuel, keywords: "petrol diesel gas station" },
      { name: "parking", icon: ParkingMeter, keywords: "parking toll" },
      { name: "footprints", icon: Footprints, keywords: "walk commute" },
    ],
  },
  {
    title: "Home & bills",
    icons: [
      { name: "house", icon: House, keywords: "home rent mortgage" },
      { name: "lightbulb", icon: Lightbulb, keywords: "electricity power bill utility" },
      { name: "droplet", icon: Droplet, keywords: "water bill utility" },
      { name: "flame", icon: Flame, keywords: "gas heating lpg utility" },
      { name: "wifi", icon: Wifi, keywords: "internet broadband bill" },
      { name: "plug", icon: Plug, keywords: "electricity power utility" },
      { name: "wrench", icon: Wrench, keywords: "repair maintenance plumber" },
      { name: "hammer", icon: Hammer, keywords: "repair renovation diy" },
      { name: "paint-roller", icon: PaintRoller, keywords: "renovation painting decor" },
      { name: "sofa", icon: Sofa, keywords: "furniture living room" },
      { name: "armchair", icon: Armchair, keywords: "furniture" },
      { name: "bed", icon: Bed, keywords: "furniture bedroom" },
      { name: "bath", icon: Bath, keywords: "bathroom toiletries" },
      { name: "washing-machine", icon: WashingMachine, keywords: "laundry appliance" },
      { name: "trash", icon: Trash2, keywords: "waste garbage bill" },
      { name: "key", icon: Key, keywords: "rent deposit house" },
    ],
  },
  {
    title: "Shopping",
    icons: [
      { name: "shopping-bag", icon: ShoppingBag, keywords: "retail purchase" },
      { name: "shopping-cart", icon: ShoppingCart, keywords: "groceries supermarket online" },
      { name: "store", icon: Store, keywords: "shop retail market" },
      { name: "package", icon: Package, keywords: "delivery online order parcel" },
      { name: "shirt", icon: Shirt, keywords: "clothes clothing apparel fashion" },
      { name: "watch", icon: Watch, keywords: "accessories jewellery" },
      { name: "glasses", icon: Glasses, keywords: "eyewear optician" },
      { name: "gem", icon: Gem, keywords: "jewellery gold luxury" },
      { name: "gift", icon: Gift, keywords: "present birthday festival" },
      { name: "tag", icon: Tag, keywords: "sale discount price" },
      { name: "scissors", icon: Scissors, keywords: "salon haircut barber grooming" },
      { name: "sparkles", icon: Sparkles, keywords: "beauty cosmetics spa" },
    ],
  },
  {
    title: "Money",
    icons: [
      { name: "wallet", icon: Wallet, keywords: "cash account money" },
      { name: "credit-card", icon: CreditCard, keywords: "card debit credit payment" },
      { name: "banknote", icon: Banknote, keywords: "cash salary income money" },
      { name: "coins", icon: Coins, keywords: "cash savings change" },
      { name: "rupee", icon: BadgeIndianRupee, keywords: "inr money india currency" },
      { name: "piggy-bank", icon: PiggyBank, keywords: "savings deposit fund" },
      { name: "landmark", icon: Landmark, keywords: "bank government tax" },
      { name: "vault", icon: Vault, keywords: "safe locker deposit" },
      { name: "hand-coins", icon: HandCoins, keywords: "lend borrow loan salary" },
      { name: "receipt", icon: Receipt, keywords: "bill invoice tax fees" },
      { name: "calculator", icon: Calculator, keywords: "accounting tax budget" },
      { name: "percent", icon: Percent, keywords: "interest tax discount" },
      { name: "trending-up", icon: TrendingUp, keywords: "investment profit growth gain" },
      { name: "trending-down", icon: TrendingDown, keywords: "loss expense decline" },
      { name: "chart-pie", icon: ChartPie, keywords: "budget breakdown analytics" },
      { name: "chart-line", icon: ChartLine, keywords: "investment stocks sip growth" },
    ],
  },
  {
    title: "Health",
    icons: [
      { name: "heart", icon: Heart, keywords: "health love wellness" },
      { name: "heart-pulse", icon: HeartPulse, keywords: "health insurance medical" },
      { name: "stethoscope", icon: Stethoscope, keywords: "doctor clinic consultation" },
      { name: "hospital", icon: Hospital, keywords: "medical treatment emergency" },
      { name: "pill", icon: Pill, keywords: "medicine pharmacy chemist" },
      { name: "syringe", icon: Syringe, keywords: "vaccine injection medical" },
      { name: "bandage", icon: Bandage, keywords: "first aid injury" },
      { name: "cross", icon: Cross, keywords: "medical pharmacy health" },
      { name: "dumbbell", icon: Dumbbell, keywords: "gym fitness workout" },
      { name: "activity", icon: Activity, keywords: "fitness health tracking" },
      { name: "brain", icon: Brain, keywords: "mental health therapy" },
      { name: "accessibility", icon: Accessibility, keywords: "care disability support" },
    ],
  },
  {
    title: "Entertainment",
    icons: [
      { name: "film", icon: Film, keywords: "movie cinema streaming" },
      { name: "popcorn", icon: Popcorn, keywords: "cinema movie snacks" },
      { name: "tv", icon: Tv, keywords: "television streaming subscription" },
      { name: "music", icon: Music, keywords: "spotify songs streaming" },
      { name: "headphones", icon: Headphones, keywords: "audio music podcast" },
      { name: "guitar", icon: Guitar, keywords: "music instrument hobby" },
      { name: "radio", icon: Radio, keywords: "audio broadcast" },
      { name: "gamepad", icon: Gamepad2, keywords: "gaming games console" },
      { name: "dices", icon: Dices, keywords: "games board gambling" },
      { name: "ticket", icon: Ticket, keywords: "event concert booking" },
      { name: "drama", icon: Drama, keywords: "theatre show performance" },
      { name: "party-popper", icon: PartyPopper, keywords: "celebration party festival" },
      { name: "camera", icon: Camera, keywords: "photography hobby" },
      { name: "palette", icon: Palette, keywords: "art hobby craft" },
    ],
  },
  {
    title: "Work & study",
    icons: [
      { name: "briefcase", icon: Briefcase, keywords: "work job business office" },
      { name: "building", icon: Building2, keywords: "office company rent" },
      { name: "laptop", icon: Laptop, keywords: "work computer freelance" },
      { name: "presentation", icon: Presentation, keywords: "meeting business work" },
      { name: "printer", icon: Printer, keywords: "office stationery printing" },
      { name: "file-text", icon: FileText, keywords: "documents paperwork admin" },
      { name: "pen-tool", icon: PenTool, keywords: "design freelance creative" },
      { name: "graduation-cap", icon: GraduationCap, keywords: "education college tuition fees" },
      { name: "school", icon: School, keywords: "education school fees" },
      { name: "book-open", icon: BookOpen, keywords: "books reading study course" },
      { name: "library", icon: Library, keywords: "books study education" },
      { name: "clock", icon: Clock, keywords: "time hourly subscription" },
    ],
  },
  {
    title: "Travel",
    icons: [
      { name: "palmtree", icon: Palmtree, keywords: "holiday vacation beach" },
      { name: "luggage", icon: Luggage, keywords: "trip travel baggage" },
      { name: "backpack", icon: Backpack, keywords: "trip travel school" },
      { name: "hotel", icon: Hotel, keywords: "stay accommodation booking" },
      { name: "tent", icon: Tent, keywords: "camping outdoors trip" },
      { name: "mountain", icon: Mountain, keywords: "trek hiking trip" },
      { name: "map", icon: MapIcon, keywords: "trip navigation route" },
      { name: "map-pin", icon: MapPin, keywords: "location place trip" },
      { name: "compass", icon: Compass, keywords: "navigation explore trip" },
      { name: "globe", icon: Globe, keywords: "international abroad travel" },
      { name: "sun", icon: Sun, keywords: "summer holiday weather" },
      { name: "umbrella", icon: Umbrella, keywords: "rain monsoon insurance" },
    ],
  },
  {
    title: "People & pets",
    icons: [
      { name: "user", icon: User, keywords: "personal self individual" },
      { name: "users", icon: Users, keywords: "family friends shared group" },
      { name: "baby", icon: Baby, keywords: "child kids childcare" },
      { name: "cake", icon: Cake, keywords: "birthday celebration" },
      { name: "hand-heart", icon: HandHeart, keywords: "charity donation giving" },
      { name: "smile", icon: Smile, keywords: "personal fun leisure" },
      { name: "dog", icon: Dog, keywords: "pet animal vet" },
      { name: "cat", icon: Cat, keywords: "pet animal vet" },
      { name: "bird", icon: Bird, keywords: "pet animal" },
      { name: "paw-print", icon: PawPrint, keywords: "pet animal vet grooming" },
    ],
  },
  {
    title: "Nature",
    icons: [
      { name: "leaf", icon: Leaf, keywords: "eco green plants" },
      { name: "trees", icon: Trees, keywords: "garden outdoors nature" },
      { name: "flower", icon: Flower2, keywords: "garden gift decor" },
      { name: "sprout", icon: Sprout, keywords: "growth garden plants" },
      { name: "cloud", icon: Cloud, keywords: "weather storage subscription" },
      { name: "snowflake", icon: Snowflake, keywords: "winter cooling ac" },
      { name: "droplets", icon: Droplets, keywords: "water utility" },
      { name: "bug", icon: Bug, keywords: "pest control maintenance" },
      { name: "recycle", icon: Recycle, keywords: "eco waste sustainability" },
    ],
  },
  {
    title: "Tech",
    icons: [
      { name: "smartphone", icon: Smartphone, keywords: "phone mobile recharge bill" },
      { name: "monitor", icon: Monitor, keywords: "computer desktop screen" },
      { name: "keyboard", icon: Keyboard, keywords: "computer peripheral" },
      { name: "mouse", icon: Mouse, keywords: "computer peripheral" },
      { name: "cpu", icon: Cpu, keywords: "hardware computer parts" },
      { name: "hard-drive", icon: HardDrive, keywords: "storage backup hardware" },
      { name: "server", icon: Server, keywords: "hosting cloud subscription" },
      { name: "battery", icon: Battery, keywords: "power charging device" },
    ],
  },
  {
    title: "Other",
    icons: [
      { name: "star", icon: Star, keywords: "favourite important" },
      { name: "bookmark", icon: Bookmark, keywords: "saved important" },
      { name: "bell", icon: Bell, keywords: "reminder notification" },
      { name: "shield", icon: Shield, keywords: "insurance protection security" },
      { name: "lock", icon: Lock, keywords: "security locked private" },
      { name: "zap", icon: Zap, keywords: "electricity power fast" },
      { name: "award", icon: Award, keywords: "achievement bonus reward" },
      { name: "target", icon: Target, keywords: "goal objective plan" },
      { name: "flag", icon: Flag, keywords: "goal milestone marker" },
      { name: "scale", icon: Scale, keywords: "balance correction legal" },
      { name: "arrow-left-right", icon: ArrowLeftRight, keywords: "transfer move between accounts" },
      { name: "anchor", icon: Anchor, keywords: "fixed stable deposit" },
      { name: "puzzle", icon: Puzzle, keywords: "misc other hobby" },
      { name: "rocket", icon: Rocket, keywords: "growth investment launch" },
      { name: "infinity", icon: InfinityIcon, keywords: "ongoing recurring unlimited" },
      { name: "church", icon: Church, keywords: "donation religious charity" },
      { name: "cigarette", icon: Cigarette, keywords: "tobacco vices habit" },
      { name: "parcel", icon: Parcel, keywords: "delivery shipping order" },
    ],
  },
];

/** Flat lookup, built once. */
const ICON_BY_NAME = new Map<string, LucideIcon>();
for (const group of ICON_GROUPS) {
  for (const entry of group.icons) ICON_BY_NAME.set(entry.name, entry.icon);
}

export const ICON_COUNT = ICON_BY_NAME.size;

/** Resolve a stored `iconName`. Returns null for unknown or unset names. */
export function getIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return ICON_BY_NAME.get(name) ?? null;
}

/** Search across names, keywords and group titles. */
export function searchIcons(query: string): IconGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return ICON_GROUPS;

  return ICON_GROUPS.map((group) => ({
    title: group.title,
    icons: group.icons.filter(
      (entry) =>
        entry.name.includes(needle) ||
        (entry.keywords ?? "").includes(needle) ||
        group.title.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.icons.length > 0);
}
