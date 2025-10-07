import { Zap, Wind, Droplets, Thermometer, Gauge, Fan, Box } from 'lucide-react';

export interface ComponentTemplate {
  id: string;
  name: string;
  type: string;
  icon: any;
  color: string;
  description: string;
}

export const useComponentLibrary = () => {
  const templates: ComponentTemplate[] = [
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
      id: 'radiator',
      name: 'Radiator',
      type: 'radiator',
      icon: Gauge,
      color: '#f59e0b',
      description: 'Vattenburet värmesystem'
    },
    {
      id: 'fan',
      name: 'Fläkt',
      type: 'fan',
      icon: Fan,
      color: '#06b6d4',
      description: 'Cirkulationsfläkt eller frånluftsaggregat'
    },
    {
      id: 'water-heater',
      name: 'Varmvattenberedare',
      type: 'water_heater',
      icon: Droplets,
      color: '#8b5cf6',
      description: 'Ackumulatortank eller beredare'
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
      id: 'duct',
      name: 'Kanal',
      type: 'duct',
      icon: Box,
      color: '#6366f1',
      description: 'Ventilationskanal'
    }
  ];

  return { templates };
};
