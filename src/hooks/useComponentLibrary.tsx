import { useState, useEffect } from 'react';
import { Zap, Wind, Thermometer, DoorOpen, Factory, Warehouse, Snowflake, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ComponentTemplate {
  id: string;
  name: string;
  type: string;
  icon: LucideIcon;
  color: string;
  description: string;
  isCustom?: boolean;
}

const defaultTemplates: ComponentTemplate[] = [
  {
    id: 'sc1',
    name: 'Styr och övervakningssystem',
    type: 'SC1',
    icon: Zap,
    color: '#eab308',
    description: 'SC1 Styr och övervakningssystem'
  },
  {
    id: 'sc2-1-1',
    name: 'Takbeläggningar och Tätskikt',
    type: 'SC2.1.1',
    icon: MoreHorizontal,
    color: '#64748b',
    description: 'SC2.1.1 Takbeläggningar och Tätskikt'
  },
  {
    id: 'sc2-3',
    name: 'Entréer Portar mm',
    type: 'SC2.3',
    icon: DoorOpen,
    color: '#059669',
    description: 'SC2.3 Entréer Portar mm'
  },
  {
    id: 'sc2-3-1',
    name: 'Entrépartier Karuselldörrar',
    type: 'SC2.3.1',
    icon: DoorOpen,
    color: '#10b981',
    description: 'SC2.3.1 Entrépartier Karuselldörrar'
  },
  {
    id: 'sc2-3-3',
    name: 'Manuella Portar',
    type: 'SC2.3.3',
    icon: Warehouse,
    color: '#84cc16',
    description: 'SC2.3.3 Manuella Portar'
  },
  {
    id: 'sc2-3-4',
    name: 'Maskindrivna Portar',
    type: 'SC2.3.4',
    icon: Warehouse,
    color: '#7c3aed',
    description: 'SC2.3.4 Maskindrivna Portar'
  },
  {
    id: 'sc2-3-7',
    name: 'Lastbryggor',
    type: 'SC2.3.7',
    icon: Warehouse,
    color: '#ea580c',
    description: 'SC2.3.7 Lastbryggor'
  },
  {
    id: 'sc2-6-2',
    name: 'Skyddsrum',
    type: 'SC2.6.2',
    icon: MoreHorizontal,
    color: '#78716c',
    description: 'SC2.6.2 Skyddsrum'
  },
  {
    id: 'sc4-1-2-5-1',
    name: 'Fettavskiljare',
    type: 'SC4.1.2.5.1',
    icon: MoreHorizontal,
    color: '#6366f1',
    description: 'SC4.1.2.5.1 Fettavskiljare'
  },
  {
    id: 'sc4-1-2-5-3',
    name: 'Oljeavskiljare',
    type: 'SC4.1.2.5.3',
    icon: MoreHorizontal,
    color: '#8b5cf6',
    description: 'SC4.1.2.5.3 Oljeavskiljare'
  },
  {
    id: 'sc4-1-6-9',
    name: 'Fjärrvärmeväxlare',
    type: 'SC4.1.6.9',
    icon: Factory,
    color: '#dc2626',
    description: 'SC4.1.6.9 Fjärrvärmeväxlare'
  },
  {
    id: 'sc4-2-4-6',
    name: 'Port Vertikal',
    type: 'SC4.2.4.6',
    icon: Warehouse,
    color: '#a855f7',
    description: 'SC4.2.4.6 Port Vertikal'
  },
  {
    id: 'sc4-2-4-7',
    name: 'Port Horisontell',
    type: 'SC4.2.4.7',
    icon: Warehouse,
    color: '#c026d3',
    description: 'SC4.2.4.7 Port Horisontell'
  },
  {
    id: 'sc4-5-1',
    name: 'Kylanläggning',
    type: 'SC4.5.1',
    icon: Snowflake,
    color: '#0ea5e9',
    description: 'SC4.5.1 Kylanläggning'
  },
  {
    id: 'sc4-6-2-6',
    name: 'Värmepump',
    type: 'SC4.6.2.6',
    icon: Thermometer,
    color: '#ef4444',
    description: 'SC4.6.2.6 Värmepump'
  },
  {
    id: 'sc4-6-2-6-1',
    name: 'Värmeväxlare',
    type: 'SC4.6.2.6.1',
    icon: Thermometer,
    color: '#f97316',
    description: 'SC4.6.2.6.1 Värmeväxlare'
  },
  {
    id: 'sc4-7',
    name: 'Ventsystem',
    type: 'SC4.7',
    icon: Wind,
    color: '#3b82f6',
    description: 'SC4.7 Ventsystem'
  },
  {
    id: 'sc5-5',
    name: 'Reserv eller nödkraftsystem',
    type: 'SC5.5',
    icon: Zap,
    color: '#f59e0b',
    description: 'SC5.5 Reserv eller nödkraftsystem'
  },
  {
    id: 'sc7-1',
    name: 'Hiss',
    type: 'SC7.1',
    icon: MoreHorizontal,
    color: '#06b6d4',
    description: 'SC7.1 Hiss'
  },
  {
    id: 'sc7-2',
    name: 'Rulltrappor och Rullramper',
    type: 'SC7.2',
    icon: MoreHorizontal,
    color: '#14b8a6',
    description: 'SC7.2 Rulltrappor och Rullramper'
  }
];

export const useComponentLibrary = () => {
  const [templates, setTemplates] = useState<ComponentTemplate[]>(defaultTemplates);

  useEffect(() => {
    loadCustomTemplates();
  }, []);

  const loadCustomTemplates = () => {
    const saved = localStorage.getItem('customComponentTemplates');
    if (saved) {
      try {
        const customTemplates = JSON.parse(saved);
        setTemplates([...defaultTemplates, ...customTemplates]);
      } catch (error) {
        console.error('Failed to load custom templates:', error);
      }
    }
  };

  const addCustomTemplate = (template: Omit<ComponentTemplate, 'id' | 'isCustom'>) => {
    const newTemplate: ComponentTemplate = {
      ...template,
      id: `custom-${Date.now()}`,
      isCustom: true
    };

    const customTemplates = templates.filter(t => t.isCustom);
    customTemplates.push(newTemplate);
    
    localStorage.setItem('customComponentTemplates', JSON.stringify(customTemplates));
    setTemplates([...defaultTemplates, ...customTemplates]);
    
    return newTemplate;
  };

  const removeCustomTemplate = (id: string) => {
    const updatedTemplates = templates.filter(t => t.id !== id);
    const customTemplates = updatedTemplates.filter(t => t.isCustom);
    
    localStorage.setItem('customComponentTemplates', JSON.stringify(customTemplates));
    setTemplates(updatedTemplates);
  };

  return { templates, addCustomTemplate, removeCustomTemplate };
};
