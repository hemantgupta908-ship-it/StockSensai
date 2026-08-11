import { useState } from "react";
import { User, UserCircle, UserCheck, UserGear, UserFocus, UserList, IdentificationCard, ShieldCheck } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface AvatarOption {
  id: string;
  label: string;
  type?: "initial" | "svg" | "url" | "icon";
  url?: string;
  svgContent?: string;
  iconName?: string;
}

export interface UserpicsPack {
  id: string;
  name: string;
  avatars: AvatarOption[];
}

export const USERPICS_PACKS: UserpicsPack[] = [
  {
    id: "vector-profiles",
    name: "Vector Profile Silhouettes",
    avatars: [
      { id: "vector-user-solid", label: "Solid Profile", type: "icon", iconName: "UserSolid" },
      { id: "vector-user-outline", label: "Outline Profile", type: "icon", iconName: "UserOutline" },
      { id: "vector-user-check", label: "Verified User", type: "icon", iconName: "UserCheck" },
      { id: "vector-user-gear", label: "Admin Profile", type: "icon", iconName: "UserGear" },
      { id: "vector-user-focus", label: "Focused User", type: "icon", iconName: "UserFocus" },
      { id: "vector-user-card", label: "ID Badge", type: "icon", iconName: "IdentificationCard" },
      { id: "vector-user-shield", label: "Protected User", type: "icon", iconName: "ShieldUser" },
    ],
  },
  {
    id: "initials",
    name: "Initial Badge",
    avatars: [
      { id: "initial", label: "Letter Initial", type: "initial" },
    ],
  },
  {
    id: "personas",
    name: "Personas Pack",
    avatars: [
      { id: "personas-alex", label: "Alex", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Alex" },
      { id: "personas-maya", label: "Maya", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Maya" },
      { id: "personas-blake", label: "Blake", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Blake" },
      { id: "personas-sam", label: "Sam", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Sam" },
      { id: "personas-chloe", label: "Chloe", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Chloe" },
      { id: "personas-leo", label: "Leo", type: "url", url: "https://api.dicebear.com/7.x/personas/svg?seed=Leo" },
    ],
  },
  {
    id: "notionists",
    name: "Notionists Pack",
    avatars: [
      { id: "notion-creative", label: "Creative Notion", type: "url", url: "https://api.dicebear.com/7.x/notionists/svg?seed=CreativeNotion" },
      { id: "notion-pop", label: "Pop Notion", type: "url", url: "https://api.dicebear.com/7.x/notionists/svg?seed=NotionPop" },
      { id: "notion-neon", label: "Neon Notion", type: "url", url: "https://api.dicebear.com/7.x/notionists/svg?seed=NotionNeon" },
      { id: "notion-artist", label: "Artist Notion", type: "url", url: "https://api.dicebear.com/7.x/notionists/svg?seed=NotionArtist" },
      { id: "notion-vibe", label: "Vibe Notion", type: "url", url: "https://api.dicebear.com/7.x/notionists/svg?seed=NotionVibe" },
    ],
  },
  {
    id: "micah",
    name: "Micah Art Pack",
    avatars: [
      { id: "micah-art", label: "Micah Art", type: "url", url: "https://api.dicebear.com/7.x/micah/svg?seed=MicahArt" },
      { id: "micah-shadow", label: "Micah Shadow", type: "url", url: "https://api.dicebear.com/7.x/micah/svg?seed=Shadow" },
      { id: "micah-vibrant", label: "Micah Vibrant", type: "url", url: "https://api.dicebear.com/7.x/micah/svg?seed=MicahVibrant" },
      { id: "micah-cool", label: "Micah Cool", type: "url", url: "https://api.dicebear.com/7.x/micah/svg?seed=MicahCool" },
      { id: "micah-retro", label: "Micah Retro", type: "url", url: "https://api.dicebear.com/7.x/micah/svg?seed=MicahRetro" },
    ],
  },
  {
    id: "peeps",
    name: "Open Peeps Pack",
    avatars: [
      { id: "peep-kai", label: "Doodle Peep", type: "url", url: "https://api.dicebear.com/7.x/open-peeps/svg?seed=DoodlePeep" },
      { id: "peep-dev", label: "Dev Peep", type: "url", url: "https://api.dicebear.com/7.x/open-peeps/svg?seed=PeepDev" },
      { id: "peep-rocker", label: "Rocker Peep", type: "url", url: "https://api.dicebear.com/7.x/open-peeps/svg?seed=PeepRocker" },
      { id: "croodles-art", label: "Doodle Art", type: "url", url: "https://api.dicebear.com/7.x/croodles/svg?seed=ArtisticOne" },
      { id: "croodles-funky", label: "Funky Doodle", type: "url", url: "https://api.dicebear.com/7.x/croodles/svg?seed=Funky" },
    ],
  },
  {
    id: "expressions",
    name: "3D Expressions Pack",
    avatars: [
      { id: "fun-sparkle", label: "Sparkle", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sparkle" },
      { id: "fun-coolguy", label: "Cool Guy", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=CoolGuy" },
      { id: "fun-starry", label: "Starry Eyes", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Starry" },
      { id: "fun-happy", label: "Happy Face", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Happy" },
      { id: "fun-wink", label: "Wink", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Wink" },
      { id: "fun-love", label: "Heart Eyes", type: "url", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Love" },
    ],
  },
  {
    id: "pixel",
    name: "8-Bit Pixel Pack",
    avatars: [
      { id: "pixel-gamer", label: "Pixel Gamer", type: "url", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=GamerPixel" },
      { id: "pixel-retro", label: "Retro Hero", type: "url", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=RetroHero" },
      { id: "pixel-ninja", label: "Pixel Ninja", type: "url", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=NinjaPixel" },
      { id: "pixel-wizard", label: "Pixel Wizard", type: "url", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=WizardPixel" },
      { id: "pixel-knight", label: "Pixel Knight", type: "url", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=KnightPixel" },
    ],
  },
  {
    id: "bots",
    name: "Cyber Bots Pack",
    avatars: [
      { id: "bot-neon", label: "Neon Bot", type: "url", url: "https://api.dicebear.com/7.x/bottts/svg?seed=NeonBot" },
      { id: "bot-cyber", label: "Cyber Punk", type: "url", url: "https://api.dicebear.com/7.x/bottts/svg?seed=CyberPunk" },
      { id: "bot-mecha", label: "Mecha Bot", type: "url", url: "https://api.dicebear.com/7.x/bottts/svg?seed=MechaBot" },
      { id: "bot-giga", label: "Giga Bot", type: "url", url: "https://api.dicebear.com/7.x/bottts/svg?seed=GigaBot" },
    ],
  },
  {
    id: "os-badges",
    name: "OS & Tech Badges",
    avatars: [
      { id: "os-ios", label: "iOS", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=iOSApp" },
      { id: "os-android", label: "Android", type: "url", url: "https://api.dicebear.com/7.x/bottts/svg?seed=AndroidDroid" },
      { id: "os-mac", label: "macOS", type: "url", url: "https://api.dicebear.com/7.x/shapes/svg?seed=MacOS" },
      { id: "os-windows", label: "Windows", type: "url", url: "https://api.dicebear.com/7.x/shapes/svg?seed=WindowsOS" },
      { id: "os-cyber", label: "Linux Tech", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=LinuxTech" },
    ],
  },
  {
    id: "avataaars",
    name: "Avataaars Pack",
    avatars: [
      { id: "avataaars-1", label: "Ava Spec", type: "url", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=AvaSpec" },
      { id: "avataaars-2", label: "Ava Chill", type: "url", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=AvaChill" },
      { id: "avataaars-3", label: "Ava Vibe", type: "url", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=AvaVibe" },
      { id: "avataaars-4", label: "Ava Hero", type: "url", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=AvaHero" },
      { id: "avataaars-5", label: "Ava Cool", type: "url", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=AvaCool" },
    ],
  },
  {
    id: "lorelei",
    name: "Lorelei Art Pack",
    avatars: [
      { id: "lorelei-1", label: "Lorelei Star", type: "url", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=LoreleiStar" },
      { id: "lorelei-2", label: "Lorelei Sun", type: "url", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=LoreleiSun" },
      { id: "lorelei-3", label: "Lorelei Moon", type: "url", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=LoreleiMoon" },
      { id: "lorelei-4", label: "Lorelei Wave", type: "url", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=LoreleiWave" },
    ],
  },
  {
    id: "big-smile",
    name: "Big Smile Pack",
    avatars: [
      { id: "smile-1", label: "Sunny Smile", type: "url", url: "https://api.dicebear.com/7.x/big-smile/svg?seed=SunnySmile" },
      { id: "smile-2", label: "Joy Smile", type: "url", url: "https://api.dicebear.com/7.x/big-smile/svg?seed=JoySmile" },
      { id: "smile-3", label: "Cheery Smile", type: "url", url: "https://api.dicebear.com/7.x/big-smile/svg?seed=CheerySmile" },
      { id: "smile-4", label: "Bliss Smile", type: "url", url: "https://api.dicebear.com/7.x/big-smile/svg?seed=BlissSmile" },
    ],
  },
  {
    id: "profile-icons",
    name: "Profile Icons Pack",
    avatars: [
      { id: "profile-user", label: "Pro User", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=ProUser" },
      { id: "profile-circle", label: "User Badge", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=UserBadge" },
      { id: "profile-shield", label: "Security Shield", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=SecurityShield" },
      { id: "profile-executive", label: "Executive", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=ExecutiveSuite" },
      { id: "profile-crown", label: "VIP Crown", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=VIPCrown" },
      { id: "profile-star", label: "Star Performer", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=StarPerformer" },
      { id: "profile-flame", label: "Power Flame", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=PowerFlame" },
      { id: "profile-sparkles", label: "Sparkles", type: "url", url: "https://api.dicebear.com/7.x/identicon/svg?seed=SparkleMode" },
    ],
  },
];

export const PRESET_AVATARS: AvatarOption[] = USERPICS_PACKS.flatMap((p) => p.avatars);

interface UserAvatarProps {
  avatarVal?: string;
  email?: string;
  className?: string;
}

export function UserAvatar({ avatarVal, email, className }: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const initial = email?.charAt(0).toUpperCase() || "N";

  // Check if avatarVal matches an avatar ID or URL
  const preset = PRESET_AVATARS.find((a) => a.id === avatarVal || a.url === avatarVal);

  if (hasError || !avatarVal || avatarVal === "initial" || preset?.type === "initial") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-accent text-white font-bold select-none shadow-sm shrink-0",
          className
        )}
      >
        {initial}
      </div>
    );
  }

  if (preset?.type === "icon") {
    const iconName = preset.iconName;
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-fill/10 text-label select-none shrink-0 dark:bg-white/10 dark:text-white",
          className
        )}
      >
        {iconName === "UserSolid" && <User className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "UserOutline" && <User className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "UserCheck" && <UserCheck className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "UserGear" && <UserGear className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "UserFocus" && <UserFocus className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "IdentificationCard" && <IdentificationCard className="h-3/5 w-3/5" weight="regular" />}
        {iconName === "ShieldUser" && <ShieldCheck className="h-3/5 w-3/5" weight="regular" />}
      </div>
    );
  }

  const avatarSrc = preset?.url || avatarVal;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-fill/10 border border-separator/30 dark:border-white/10 select-none shadow-sm",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={avatarSrc}
        src={avatarSrc}
        alt="User Avatar"
        className="h-full w-full object-cover"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
