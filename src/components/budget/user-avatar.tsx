import {
  User,
  UserCheck,
  UserGear,
  UserFocus,
  IdentificationCard,
  ShieldCheck,
  Wallet,
  Coins,
  TrendUp,
  Bank,
  Crown,
  Diamond,
  Trophy,
  Flame,
  Sparkle,
  RocketLaunch,
  Lightning,
  Infinity as InfinityIcon,
  ChartLineUp,
  Compass,
  Target,
  Key,
  Globe,
  Cpu,
  Coffee,
  Headphones,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface AvatarOption {
  id: string;
  label: string;
  type?: "initial" | "icon";
  iconName?: string;
}

export const PRESET_AVATARS: AvatarOption[] = [
  // Identity & Profile
  { id: "initial", label: "Letter Initial", type: "initial" },
  { id: "vector-user-solid", label: "Solid Profile", type: "icon", iconName: "UserSolid" },
  { id: "vector-user-outline", label: "Outline Profile", type: "icon", iconName: "UserOutline" },
  { id: "vector-user-check", label: "Verified User", type: "icon", iconName: "UserCheck" },
  { id: "vector-user-gear", label: "Admin Profile", type: "icon", iconName: "UserGear" },
  { id: "vector-user-focus", label: "Focused User", type: "icon", iconName: "UserFocus" },
  { id: "vector-user-card", label: "ID Badge", type: "icon", iconName: "IdentificationCard" },
  { id: "vector-user-shield", label: "Protected Shield", type: "icon", iconName: "ShieldUser" },

  // Prestige & Status
  { id: "vector-crown", label: "VIP Crown", type: "icon", iconName: "Crown" },
  { id: "vector-diamond", label: "High Net Worth", type: "icon", iconName: "Diamond" },
  { id: "vector-trophy", label: "Top Performer", type: "icon", iconName: "Trophy" },
  { id: "vector-flame", label: "Power Flame", type: "icon", iconName: "Flame" },
  { id: "vector-sparkle", label: "Sparkle Mode", type: "icon", iconName: "Sparkle" },
  { id: "vector-rocket", label: "High Growth", type: "icon", iconName: "RocketLaunch" },
  { id: "vector-lightning", label: "Fast Speed", type: "icon", iconName: "Lightning" },
  { id: "vector-infinity", label: "Infinite Wealth", type: "icon", iconName: "Infinity" },

  // Wealth, Finance & Strategy
  { id: "vector-trend", label: "Growth Trend", type: "icon", iconName: "TrendUp" },
  { id: "vector-chart", label: "Market Analytics", type: "icon", iconName: "ChartLineUp" },
  { id: "vector-coins", label: "Wealth Coins", type: "icon", iconName: "Coins" },
  { id: "vector-wallet", label: "Investor Wallet", type: "icon", iconName: "Wallet" },
  { id: "vector-bank", label: "Bank Vault", type: "icon", iconName: "Bank" },
  { id: "vector-target", label: "Goal Target", type: "icon", iconName: "Target" },
  { id: "vector-compass", label: "Strategy Compass", type: "icon", iconName: "Compass" },
  { id: "vector-key", label: "Secure Key", type: "icon", iconName: "Key" },

  // Modern Lifestyle & Tech
  { id: "vector-globe", label: "Global Nomad", type: "icon", iconName: "Globe" },
  { id: "vector-cpu", label: "Quant & Tech", type: "icon", iconName: "Cpu" },
  { id: "vector-coffee", label: "Coffee Lover", type: "icon", iconName: "Coffee" },
  { id: "vector-audio", label: "Audio & Pulse", type: "icon", iconName: "Headphones" },
];

export const USERPICS_PACKS = [
  {
    id: "vector-profiles",
    name: "Vector Profile Silhouettes",
    avatars: PRESET_AVATARS,
  },
];

interface UserAvatarProps {
  avatarVal?: string;
  email?: string;
  className?: string;
}

export function UserAvatar({ avatarVal, email, className }: UserAvatarProps) {
  const initial = email?.charAt(0).toUpperCase() || "N";
  const preset = PRESET_AVATARS.find((a) => a.id === avatarVal);

  if (!avatarVal || avatarVal === "initial" || preset?.type === "initial") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-accent text-accent-fg font-bold select-none shadow-sm shrink-0",
          className,
        )}
      >
        {initial}
      </div>
    );
  }

  const iconName = preset?.iconName;
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-fill/10 text-label select-none shrink-0 dark:bg-white/10 dark:text-white border border-separator/30 dark:border-white/10",
        className,
      )}
    >
      {iconName === "UserSolid" && <User className="h-3/5 w-3/5" weight="fill" />}
      {iconName === "UserOutline" && <User className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "UserCheck" && <UserCheck className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "UserGear" && <UserGear className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "UserFocus" && <UserFocus className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "IdentificationCard" && <IdentificationCard className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "ShieldUser" && <ShieldCheck className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Crown" && <Crown className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Diamond" && <Diamond className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Trophy" && <Trophy className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Flame" && <Flame className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Sparkle" && <Sparkle className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "RocketLaunch" && <RocketLaunch className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Lightning" && <Lightning className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Infinity" && <InfinityIcon className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "TrendUp" && <TrendUp className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "ChartLineUp" && <ChartLineUp className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Coins" && <Coins className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Wallet" && <Wallet className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Bank" && <Bank className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Target" && <Target className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Compass" && <Compass className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Key" && <Key className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Globe" && <Globe className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Cpu" && <Cpu className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Coffee" && <Coffee className="h-3/5 w-3/5" weight="regular" />}
      {iconName === "Headphones" && <Headphones className="h-3/5 w-3/5" weight="regular" />}
    </div>
  );
}
