import { useState, useEffect } from 'react';
import { Zap, Wind, Thermometer, DoorOpen, Factory, Warehouse, Snowflake, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ComponentTemplate {
  id: string;
  name: string;
  type: string;
  icon: any;
  color: string;
  description: string;
  isCustom?: boolean;
}

const defaultTemplates: ComponentTemplate[] = [
  {
    id: 'heat-pump',
    name: 'Värmepump',
    type: 'heat_pump',
    icon: Thermometer,
    color: '#ef4444',
    description: 'Luft/vatten eller luft/luft värmepump'
  },
  {
    id: 'ventilation-unit',
    name: 'Ventilationsaggregat',
    type: 'ventilation',
    icon: Wind,
    color: '#3b82f6',
    description: 'FTX eller F-ventilation'
  },
  {
    id: 'electrical-panel',
    name: 'Elcentral',
    type: 'electrical',
    icon: Zap,
    color: '#eab308',
    description: 'Huvudcentral eller undercentral'
  },
  {
    id: 'district-heating',
    name: 'Fjärrvärmecentral',
    type: 'district_heating',
    icon: Factory,
    color: '#dc2626',
    description: 'Fjärrvärme anslutning och central'
  },
  {
    id: 'entrance',
    name: 'Entréparti',
    type: 'entrance',
    icon: DoorOpen,
    color: '#059669',
    description: 'Entréparti med tillhörande utrustning'
  },
  {
    id: 'motorized-gate',
    name: 'Maskindriven Port',
    type: 'motorized_gate',
    icon: Warehouse,
    color: '#7c3aed',
    description: 'Motordriven port eller grind'
  },
  {
    id: 'loading-dock',
    name: 'Lastbrygga',
    type: 'loading_dock',
    icon: Warehouse,
    color: '#ea580c',
    description: 'Lastbrygga med tillhörande system'
  },
  {
    id: 'cooling-unit',
    name: 'Kylaggregat',
    type: 'cooling',
    icon: Snowflake,
    color: '#0ea5e9',
    description: 'Kylaggregat eller kylsystem'
  },
  {
    id: 'other',
    name: 'Övrigt',
    type: 'other',
    icon: MoreHorizontal,
    color: '#64748b',
    description: 'Övrig teknisk utrustning'
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
