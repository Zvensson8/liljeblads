/** Display names for SC component type codes (shared list UI). */
const TYPE_MAP: Record<string, string> = {
  SC1: 'SC1 Styr och övervakningssystem',
  'SC2.1.1': 'SC2.1.1 Takbeläggningar och Tätskikt',
  'SC2.3': 'SC2.3 Entréer Portar mm',
  'SC2.3.1': 'SC2.3.1 Entrépartier Karuselldörrar',
  'SC2.3.3': 'SC2.3.3 Manuella Portar',
  'SC2.3.4': 'SC2.3.4 Maskindrivna Portar',
  'SC2.3.7': 'SC2.3.7 Lastbryggor',
  'SC2.6.2': 'SC2.6.2 Skyddsrum',
  'SC4.1.2.5.1': 'SC4.1.2.5.1 Fettavskiljare',
  'SC4.1.2.5.3': 'SC4.1.2.5.3 Oljeavskiljare',
  'SC4.1.6.9': 'SC4.1.6.9 Fjärrvärmeväxlare',
  'SC4.2.4.6': 'SC4.2.4.6 Port Vertikal',
  'SC4.2.4.7': 'SC4.2.4.7 Port Horisontell',
  'SC4.5.1': 'SC4.5.1 Kylanläggning',
  'SC4.6.2.6': 'SC4.6.2.6 Värmepump',
  'SC4.6.2.6.1': 'SC4.6.2.6.1 Värmeväxlare',
  'SC4.7': 'SC4.7 Ventsystem',
  'SC5.5': 'SC5.5 Reserv eller nödkraftsystem',
  'SC7.1': 'SC7.1 Hiss',
  'SC7.2': 'SC7.2 Rulltrappor och Rullramper',
};

export function getTypeDisplayName(typeCode: string): string {
  return TYPE_MAP[typeCode] || typeCode;
}
