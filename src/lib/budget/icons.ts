/**
 * The icon set offered when naming a category, account, goal or policy.
 *
 * Curated from `@phosphor-icons/react`, rendered duotone — the weight is set
 * once app-wide by `IconProvider`, not per call site. Icons are imported by
 * name rather than via a namespace import so the bundler can drop the other
 * ~1,300.
 *
 * Icons are stored by their string key in `iconName`, so renaming a key orphans
 * every record using it. Add freely; rename carefully. The migration from
 * lucide deliberately kept every key and rebound only the component behind it,
 * so categories and loans created before the switch keep their icons.
 */

import {
  Airplane, Anchor, AppleLogo, Armchair, ArrowsLeftRight, Baby,
  Backpack, Bandaids, Bank, Barbell, Basket, Bathtub,
  BatteryFull, Bed, BeerStein, Bell, Bicycle, Bird,
  Boat, BookOpen, BookmarkSimple, Books, BowlFood, BowlSteam,
  Brain, Bread, Briefcase, Bug, Buildings, Bus,
  Cake, Calculator, Camera, Car, Carrot, Cat,
  Chalkboard, ChartLine, ChartPie, Church, Cigarette, Clock,
  Cloud, Coffee, Coins, Compass, Confetti, Cookie,
  Couch, Cpu, CreditCard, CurrencyInr, DeviceMobile, Diamond,
  DiceFive, Dog, Drop, Egg, Eyeglasses, FileText,
  FilmSlate, FirstAid, Fish, Flag, Flame, Flower,
  Footprints, ForkKnife, GameController, GasPump, Gift, Globe,
  GraduationCap, Guitar, Hamburger, Hammer, HandCoins, HandHeart,
  HardDrive, HardDrives, Headphones, Heart, Heartbeat, Hospital,
  House, IceCream, Infinity, Jar, Key, Keyboard,
  Laptop, Leaf, Lightbulb, Lightning, Lock, MapPin,
  MapTrifold, MaskHappy, Medal, Money, Monitor, Mountains,
  Mouse, MusicNotes, Package, PaintRoller, Palette, Park,
  PawPrint, PenNib, Percent, PiggyBank, Pill, Pizza,
  Plant, Plug, Popcorn, Presentation, Printer, Pulse,
  PuzzlePiece, Radio, Receipt, Recycle, Rocket, Scales,
  Scissors, ShieldCheck, ShoppingBag, ShoppingCart, Smiley, Snowflake,
  Sparkle, Star, Stethoscope, Storefront, SuitcaseRolling, Sun,
  Syringe, TShirt, Tag, Target, Taxi, Television,
  Tent, Ticket, Train, Tram, Trash, Tree,
  TreePalm, TrendDown, TrendUp, Truck, Umbrella, User,
  Users, Vault, Wallet, WashingMachine, Watch, Wheelchair,
  WifiHigh, Wine, Wrench, QrCode, Scan, ContactlessPayment, IdentificationCard,
  Garage, CarProfile, TrafficSign, Handshake, HandDeposit, HandWithdraw,
  ChartBar, ChartLineUp, CurrencyBtc, CurrencyDollar, CurrencyEur, Building, BriefcaseMetal,
  FlowerLotus, Shower, Towel, HandSoap, FaceMask,
  type Icon,
} from "@phosphor-icons/react";

export interface IconGroup {
  title: string;
  icons: { name: string; icon: Icon; keywords?: string }[];
}

/**
 * Grouped so the picker can be scanned by eye, and keyworded so search finds
 * things by what they are used *for* — "electricity" should find the bulb.
 */
export const ICON_GROUPS: IconGroup[] = [
  {
    title: "Food & drink",
    icons: [
      { name: "utensils", icon: ForkKnife, keywords: "food dining restaurant eat meal" },
      { name: "utensils-crossed", icon: BowlFood, keywords: "food dining cutlery" },
      { name: "coffee", icon: Coffee, keywords: "cafe tea chai drink breakfast" },
      { name: "pizza", icon: Pizza, keywords: "food takeaway fast food" },
      { name: "sandwich", icon: Hamburger, keywords: "food lunch snack" },
      { name: "salad", icon: Carrot, keywords: "food healthy vegetables" },
      { name: "beef", icon: Hamburger, keywords: "meat food non veg" },
      { name: "fish", icon: Fish, keywords: "seafood food non veg" },
      { name: "egg", icon: Egg, keywords: "food breakfast" },
      { name: "milk", icon: Jar, keywords: "dairy groceries" },
      { name: "croissant", icon: Bread, keywords: "bakery bread breakfast" },
      { name: "cookie", icon: Cookie, keywords: "snack biscuit sweets" },
      { name: "cake-slice", icon: Cake, keywords: "dessert sweets bakery" },
      { name: "ice-cream", icon: IceCream, keywords: "dessert sweets treat" },
      { name: "apple", icon: AppleLogo, keywords: "fruit healthy groceries" },
      { name: "cup-soda", icon: BowlSteam, keywords: "drink soft drink juice" },
      { name: "beer", icon: BeerStein, keywords: "alcohol drinks bar pub" },
      { name: "wine", icon: Wine, keywords: "alcohol drinks bar" },
      { name: "shopping-basket", icon: Basket, keywords: "groceries supermarket" },
    ],
  },
  {
    title: "Transport",
    icons: [
      { name: "car", icon: Car, keywords: "vehicle drive auto" },
      { name: "car-taxi", icon: Taxi, keywords: "taxi cab uber ola ride" },
      { name: "bus", icon: Bus, keywords: "public transport commute" },
      { name: "train", icon: Train, keywords: "rail metro commute" },
      { name: "tram", icon: Tram, keywords: "metro local transport" },
      { name: "plane", icon: Airplane, keywords: "flight travel airfare" },
      { name: "ship", icon: Boat, keywords: "boat ferry cruise" },
      { name: "bike", icon: Bicycle, keywords: "cycle bicycle scooter" },
      { name: "truck", icon: Truck, keywords: "delivery moving freight" },
      { name: "fuel", icon: GasPump, keywords: "petrol diesel gas station" },
      { name: "garage", icon: Garage, keywords: "parking toll garage" },
      { name: "traffic-sign", icon: TrafficSign, keywords: "parking toll sign" },
      { name: "car-profile", icon: CarProfile, keywords: "vehicle auto sedan parking" },
      { name: "footprints", icon: Footprints, keywords: "walk commute" },
    ],
  },
  {
    title: "Home & bills",
    icons: [
      { name: "house", icon: House, keywords: "home rent mortgage" },
      { name: "lightbulb", icon: Lightbulb, keywords: "electricity power bill utility" },
      { name: "droplet", icon: Drop, keywords: "water bill utility" },
      { name: "flame", icon: Flame, keywords: "gas heating lpg utility" },
      { name: "wifi", icon: WifiHigh, keywords: "internet broadband bill" },
      { name: "plug", icon: Plug, keywords: "electricity power utility" },
      { name: "wrench", icon: Wrench, keywords: "repair maintenance plumber" },
      { name: "hammer", icon: Hammer, keywords: "repair renovation diy" },
      { name: "paint-roller", icon: PaintRoller, keywords: "renovation painting decor" },
      { name: "sofa", icon: Couch, keywords: "furniture living room" },
      { name: "armchair", icon: Armchair, keywords: "furniture" },
      { name: "bed", icon: Bed, keywords: "furniture bedroom" },
      { name: "bath", icon: Bathtub, keywords: "bathroom toiletries" },
      { name: "washing-machine", icon: WashingMachine, keywords: "laundry appliance" },
      { name: "trash", icon: Trash, keywords: "waste garbage bill" },
      { name: "key", icon: Key, keywords: "rent deposit house" },
    ],
  },
  {
    title: "Shopping",
    icons: [
      { name: "shopping-bag", icon: ShoppingBag, keywords: "retail purchase" },
      { name: "shopping-cart", icon: ShoppingCart, keywords: "groceries supermarket online" },
      { name: "store", icon: Storefront, keywords: "shop retail market" },
      { name: "package", icon: Package, keywords: "delivery online order parcel" },
      { name: "shirt", icon: TShirt, keywords: "clothes clothing apparel fashion" },
      { name: "watch", icon: Watch, keywords: "accessories jewellery" },
      { name: "glasses", icon: Eyeglasses, keywords: "eyewear optician" },
      { name: "gem", icon: Diamond, keywords: "jewellery gold luxury" },
      { name: "gift", icon: Gift, keywords: "present birthday festival" },
      { name: "tag", icon: Tag, keywords: "sale discount price" },
    ],
  },
  {
    title: "Self-care & grooming",
    icons: [
      { name: "scissors", icon: Scissors, keywords: "salon haircut barber grooming" },
      { name: "sparkles", icon: Sparkle, keywords: "beauty cosmetics spa" },
      { name: "lotus", icon: FlowerLotus, keywords: "spa massage relax meditation wellness" },
      { name: "flower", icon: Flower, keywords: "beauty perfume fragrance" },
      { name: "shower", icon: Shower, keywords: "bath shower wash" },
      { name: "bathtub", icon: Bathtub, keywords: "bath bathroom toiletries" },
      { name: "towel", icon: Towel, keywords: "bath spa salon" },
      { name: "soap", icon: HandSoap, keywords: "soap wash hygiene" },
      { name: "face-mask", icon: FaceMask, keywords: "skincare beauty spa mask" },
      { name: "drop", icon: Drop, keywords: "perfume oil skin care" },
    ],
  },
  {
    title: "Money & Payments",
    icons: [
      { name: "wallet", icon: Wallet, keywords: "cash account money" },
      { name: "qr-code", icon: QrCode, keywords: "scan pay upi paytm gpay phonepe" },
      { name: "contactless", icon: ContactlessPayment, keywords: "nfc tap pay card" },
      { name: "scan", icon: Scan, keywords: "qr code pay upi" },
      { name: "credit-card", icon: CreditCard, keywords: "card debit credit payment" },
      { name: "id-card", icon: IdentificationCard, keywords: "id kyc license passport" },
      { name: "banknote", icon: Money, keywords: "cash salary income money" },
      { name: "coins", icon: Coins, keywords: "cash savings change" },
      { name: "rupee", icon: CurrencyInr, keywords: "inr money india currency" },
      { name: "piggy-bank", icon: PiggyBank, keywords: "savings deposit fund" },
      { name: "landmark", icon: Bank, keywords: "bank government tax" },
      { name: "vault", icon: Vault, keywords: "safe locker deposit" },
      { name: "hand-coins", icon: HandCoins, keywords: "lend borrow loan salary" },
      { name: "handshake", icon: Handshake, keywords: "deal loan borrow agreement" },
      { name: "hand-deposit", icon: HandDeposit, keywords: "borrow receive get money loan" },
      { name: "hand-withdraw", icon: HandWithdraw, keywords: "lend give pay out money loan" },
      { name: "receipt", icon: Receipt, keywords: "bill invoice tax fees" },
      { name: "calculator", icon: Calculator, keywords: "accounting tax budget" },
      { name: "percent", icon: Percent, keywords: "interest tax discount" },
      { name: "trending-up", icon: TrendUp, keywords: "investment profit growth gain" },
      { name: "trending-down", icon: TrendDown, keywords: "loss expense decline" },
      { name: "chart-pie", icon: ChartPie, keywords: "budget breakdown analytics" },
      { name: "chart-line", icon: ChartLine, keywords: "investment stocks sip growth" },
      { name: "chart-bar", icon: ChartBar, keywords: "trading stocks analytics graph" },
      { name: "chart-line-up", icon: ChartLineUp, keywords: "trading growth stocks market" },
      { name: "currency-btc", icon: CurrencyBtc, keywords: "crypto bitcoin cryptocurrency trading" },
      { name: "currency-dollar", icon: CurrencyDollar, keywords: "usd foreign account dollar money" },
      { name: "currency-eur", icon: CurrencyEur, keywords: "euro foreign account money" },
      { name: "building", icon: Building, keywords: "brokerage corporate institution account" },
      { name: "briefcase-metal", icon: BriefcaseMetal, keywords: "portfolio business corporate account" },
    ],
  },
  {
    title: "Health",
    icons: [
      { name: "heart", icon: Heart, keywords: "health love wellness" },
      { name: "heart-pulse", icon: Heartbeat, keywords: "health insurance medical" },
      { name: "stethoscope", icon: Stethoscope, keywords: "doctor clinic consultation" },
      { name: "hospital", icon: Hospital, keywords: "medical treatment emergency" },
      { name: "pill", icon: Pill, keywords: "medicine pharmacy chemist" },
      { name: "syringe", icon: Syringe, keywords: "vaccine injection medical" },
      { name: "bandage", icon: Bandaids, keywords: "first aid injury" },
      { name: "cross", icon: FirstAid, keywords: "medical pharmacy health" },
      { name: "dumbbell", icon: Barbell, keywords: "gym fitness workout" },
      { name: "activity", icon: Pulse, keywords: "fitness health tracking" },
      { name: "brain", icon: Brain, keywords: "mental health therapy" },
      { name: "accessibility", icon: Wheelchair, keywords: "care disability support" },
    ],
  },
  {
    title: "Entertainment",
    icons: [
      { name: "film", icon: FilmSlate, keywords: "movie cinema streaming" },
      { name: "popcorn", icon: Popcorn, keywords: "cinema movie snacks" },
      { name: "tv", icon: Television, keywords: "television streaming subscription" },
      { name: "music", icon: MusicNotes, keywords: "spotify songs streaming" },
      { name: "headphones", icon: Headphones, keywords: "audio music podcast" },
      { name: "guitar", icon: Guitar, keywords: "music instrument hobby" },
      { name: "radio", icon: Radio, keywords: "audio broadcast" },
      { name: "gamepad", icon: GameController, keywords: "gaming games console" },
      { name: "dices", icon: DiceFive, keywords: "games board gambling" },
      { name: "ticket", icon: Ticket, keywords: "event concert booking" },
      { name: "drama", icon: MaskHappy, keywords: "theatre show performance" },
      { name: "party-popper", icon: Confetti, keywords: "celebration party festival" },
      { name: "camera", icon: Camera, keywords: "photography hobby" },
      { name: "palette", icon: Palette, keywords: "art hobby craft" },
    ],
  },
  {
    title: "Work & study",
    icons: [
      { name: "briefcase", icon: Briefcase, keywords: "work job business office" },
      { name: "building", icon: Buildings, keywords: "office company rent" },
      { name: "laptop", icon: Laptop, keywords: "work computer freelance" },
      { name: "presentation", icon: Presentation, keywords: "meeting business work" },
      { name: "printer", icon: Printer, keywords: "office stationery printing" },
      { name: "file-text", icon: FileText, keywords: "documents paperwork admin" },
      { name: "pen-tool", icon: PenNib, keywords: "design freelance creative" },
      { name: "graduation-cap", icon: GraduationCap, keywords: "education college tuition fees" },
      { name: "school", icon: Chalkboard, keywords: "education school fees" },
      { name: "book-open", icon: BookOpen, keywords: "books reading study course" },
      { name: "library", icon: Books, keywords: "books study education" },
      { name: "clock", icon: Clock, keywords: "time hourly subscription" },
    ],
  },
  {
    title: "Travel",
    icons: [
      { name: "palmtree", icon: TreePalm, keywords: "holiday vacation beach" },
      { name: "luggage", icon: SuitcaseRolling, keywords: "trip travel baggage" },
      { name: "backpack", icon: Backpack, keywords: "trip travel school" },
      { name: "hotel", icon: Buildings, keywords: "stay accommodation booking" },
      { name: "tent", icon: Tent, keywords: "camping outdoors trip" },
      { name: "mountain", icon: Mountains, keywords: "trek hiking trip" },
      { name: "map", icon: MapTrifold, keywords: "trip navigation route" },
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
      { name: "smile", icon: Smiley, keywords: "personal fun leisure" },
      { name: "dog", icon: Dog, keywords: "pet animal vet" },
      { name: "cat", icon: Cat, keywords: "pet animal vet" },
      { name: "bird", icon: Bird, keywords: "pet animal" },
      { name: "paw-print", icon: PawPrint, keywords: "pet animal vet grooming" },
    ],
  },
  {
    title: "Nature",
    icons: [
      { name: "park", icon: Park, keywords: "park garden outdoors" },
      { name: "leaf", icon: Leaf, keywords: "eco green plants" },
      { name: "trees", icon: Tree, keywords: "garden outdoors nature" },
      { name: "flower", icon: Flower, keywords: "garden gift decor" },
      { name: "sprout", icon: Plant, keywords: "growth garden plants" },
      { name: "cloud", icon: Cloud, keywords: "weather storage subscription" },
      { name: "snowflake", icon: Snowflake, keywords: "winter cooling ac" },
      { name: "droplets", icon: Drop, keywords: "water utility" },
      { name: "bug", icon: Bug, keywords: "pest control maintenance" },
      { name: "recycle", icon: Recycle, keywords: "eco waste sustainability" },
    ],
  },
  {
    title: "Tech",
    icons: [
      { name: "smartphone", icon: DeviceMobile, keywords: "phone mobile recharge bill" },
      { name: "monitor", icon: Monitor, keywords: "computer desktop screen" },
      { name: "keyboard", icon: Keyboard, keywords: "computer peripheral" },
      { name: "mouse", icon: Mouse, keywords: "computer peripheral" },
      { name: "cpu", icon: Cpu, keywords: "hardware computer parts" },
      { name: "hard-drive", icon: HardDrive, keywords: "storage backup hardware" },
      { name: "server", icon: HardDrives, keywords: "hosting cloud subscription" },
      { name: "battery", icon: BatteryFull, keywords: "power charging device" },
    ],
  },
  {
    title: "Other",
    icons: [
      { name: "star", icon: Star, keywords: "favourite important" },
      { name: "bookmark", icon: BookmarkSimple, keywords: "saved important" },
      { name: "bell", icon: Bell, keywords: "reminder notification" },
      { name: "shield", icon: ShieldCheck, keywords: "insurance protection security" },
      { name: "lock", icon: Lock, keywords: "security locked private" },
      { name: "zap", icon: Lightning, keywords: "electricity power fast" },
      { name: "award", icon: Medal, keywords: "achievement bonus reward" },
      { name: "target", icon: Target, keywords: "goal objective plan" },
      { name: "flag", icon: Flag, keywords: "goal milestone marker" },
      { name: "scale", icon: Scales, keywords: "balance correction legal" },
      { name: "arrow-left-right", icon: ArrowsLeftRight, keywords: "transfer move between accounts" },
      { name: "anchor", icon: Anchor, keywords: "fixed stable deposit" },
      { name: "puzzle", icon: PuzzlePiece, keywords: "misc other hobby" },
      { name: "rocket", icon: Rocket, keywords: "growth investment launch" },
      { name: "infinity", icon: Infinity, keywords: "ongoing recurring unlimited" },
      { name: "church", icon: Church, keywords: "donation religious charity" },
      { name: "cigarette", icon: Cigarette, keywords: "tobacco vices habit" },
      { name: "parcel", icon: Package, keywords: "delivery shipping order" },
    ],
  },
];

/** Flat lookup, built once. */
const ICON_BY_NAME = new Map<string, Icon>();
for (const group of ICON_GROUPS) {
  for (const entry of group.icons) ICON_BY_NAME.set(entry.name, entry.icon);
}

export const ICON_COUNT = ICON_BY_NAME.size;

/** Resolve a stored `iconName`. Returns null for unknown or unset names. */
export function getIcon(name: string | null | undefined): Icon | null {
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
