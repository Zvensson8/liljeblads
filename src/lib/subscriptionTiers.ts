// Centralized subscription tier configuration
export interface TierLimits {
  properties: number;
  users: number;
  components: number;
  workOrders: number;
  projects: number;
  documents: number;
  storageMb: number;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  limits: TierLimits;
  features: string[];
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: "small",
    name: "Liten",
    price: 45000,
    limits: {
      properties: 10,
      users: 5,
      components: 500,
      workOrders: 1000,
      projects: 100,
      documents: 500,
      storageMb: 1024,
    },
    features: [
      "Upp till 10 fastigheter",
      "Upp till 5 användare",
      "500 komponenter",
      "1 000 arbetsordrar",
      "100 projekt",
      "1 GB lagring",
      "E-postsupport",
    ],
  },
  {
    id: "medium",
    name: "Mellan",
    price: 150000,
    limits: {
      properties: 50,
      users: 20,
      components: 2500,
      workOrders: 5000,
      projects: 500,
      documents: 2000,
      storageMb: 5120,
    },
    features: [
      "Upp till 50 fastigheter",
      "Upp till 20 användare",
      "2 500 komponenter",
      "5 000 arbetsordrar",
      "500 projekt",
      "5 GB lagring",
      "Projekthantering",
      "Prioriterad support",
    ],
  },
  {
    id: "large",
    name: "Stor",
    price: 450000,
    limits: {
      properties: 150,
      users: 40,
      components: 10000,
      workOrders: 20000,
      projects: 2000,
      documents: 10000,
      storageMb: 20480,
    },
    features: [
      "Upp till 150 fastigheter",
      "Upp till 40 användare",
      "10 000 komponenter",
      "20 000 arbetsordrar",
      "2 000 projekt",
      "20 GB lagring",
      "Avancerad rapportering",
      "API-åtkomst",
      "Dedikerad support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 900000,
    limits: {
      properties: 500,
      users: 100,
      components: 50000,
      workOrders: 100000,
      projects: 5000,
      documents: 25000,
      storageMb: 51200,
    },
    features: [
      "Upp till 500 fastigheter",
      "Upp till 100 användare",
      "50 000 komponenter",
      "100 000 arbetsordrar",
      "5 000 projekt",
      "50 GB lagring",
      "SSO integration",
      "24/7 support",
      "Dedikerad kundansvarig",
    ],
  },
  {
    id: "enterprise_plus",
    name: "Enterprise Plus",
    price: 1800000,
    limits: {
      properties: 2000,
      users: 250,
      components: 100000,
      workOrders: 200000,
      projects: 10000,
      documents: 50000,
      storageMb: 204800,
    },
    features: [
      "Upp till 2 000 fastigheter",
      "Upp till 250 användare",
      "100 000 komponenter",
      "200 000 arbetsordrar",
      "10 000 projekt",
      "200 GB lagring",
      "Obegränsad funktionalitet",
      "Anpassad branding",
      "SSO integration",
      "24/7 premium support",
      "Dedikerad kundansvarig",
      "On-premise möjlighet",
    ],
  },
];

// Helper to get tier config by id
export const getTierById = (tierId: string): SubscriptionTier | undefined => {
  return SUBSCRIPTION_TIERS.find((t) => t.id === tierId);
};

// Helper to get tier limits as a map for quick lookup
export const TIER_CONFIGS: Record<string, { name: string; limits: TierLimits }> = 
  SUBSCRIPTION_TIERS.reduce((acc, tier) => {
    acc[tier.id] = { name: tier.name, limits: tier.limits };
    return acc;
  }, {} as Record<string, { name: string; limits: TierLimits }>);

// Format storage for display
export const formatStorage = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(0)} GB`;
  }
  return `${mb} MB`;
};
