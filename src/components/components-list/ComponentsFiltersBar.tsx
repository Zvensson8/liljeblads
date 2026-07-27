import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Sparkles, X } from 'lucide-react';
import { getTypeDisplayName } from '@/lib/componentTypeLabels';
import type { RiskLevel } from '@/lib/componentRisk';
import type { ComponentsSort, ServiceFilter } from '@/lib/componentsListFilter';

export interface ComponentsFiltersBarProps {
  uniqueTypes: string[];
  uniqueProperties: string[];
  uniqueManufacturers: string[];
  uniqueModels: string[];
  filterType: string;
  filterProperty: string;
  filterManufacturer: string;
  filterModel: string;
  filterService: ServiceFilter;
  filterRisk: 'all' | RiskLevel;
  sortBy: ComponentsSort;
  hasActiveFilters: boolean;
  suggesting: boolean;
  riskListEmpty: boolean;
  onFilterType: (v: string) => void;
  onFilterProperty: (v: string) => void;
  onFilterManufacturer: (v: string) => void;
  onFilterModel: (v: string) => void;
  onFilterService: (v: ServiceFilter) => void;
  onFilterRisk: (v: 'all' | RiskLevel) => void;
  onSortBy: (v: ComponentsSort) => void;
  onClearFilters: () => void;
  onGenerateRiskSuggestions: () => void;
}

export function ComponentsFiltersBar(props: ComponentsFiltersBarProps) {
  const {
    uniqueTypes,
    uniqueProperties,
    uniqueManufacturers,
    uniqueModels,
    filterType,
    filterProperty,
    filterManufacturer,
    filterModel,
    filterService,
    filterRisk,
    sortBy,
    hasActiveFilters,
    suggesting,
    riskListEmpty,
    onFilterType,
    onFilterProperty,
    onFilterManufacturer,
    onFilterModel,
    onFilterService,
    onFilterRisk,
    onSortBy,
    onClearFilters,
    onGenerateRiskSuggestions,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filtrera:</span>
      </div>

      <Select value={filterType} onValueChange={onFilterType}>
        <SelectTrigger className="w-[220px] h-9">
          <SelectValue placeholder="Komponenttyp">
            {filterType !== 'all' ? getTypeDisplayName(filterType) : 'Alla typer'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla typer</SelectItem>
          {uniqueTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {getTypeDisplayName(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filterProperty} onValueChange={onFilterProperty}>
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Fastighet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla fastigheter</SelectItem>
          {uniqueProperties.map((prop) => (
            <SelectItem key={prop} value={prop!}>
              {prop}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filterManufacturer} onValueChange={onFilterManufacturer}>
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Tillverkare" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla tillverkare</SelectItem>
          {uniqueManufacturers.map((mfr) => (
            <SelectItem key={mfr} value={mfr!}>
              {mfr}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filterModel} onValueChange={onFilterModel}>
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Modell" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla modeller</SelectItem>
          {uniqueModels.map((model) => (
            <SelectItem key={model} value={model!}>
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterService}
        onValueChange={(value) => onFilterService(value as ServiceFilter)}
      >
        <SelectTrigger className="w-[200px] h-9">
          <SelectValue placeholder="Service" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla service</SelectItem>
          <SelectItem value="latest">Senaste service</SelectItem>
          <SelectItem value="with_service">Med registrerad service</SelectItem>
          <SelectItem value="none">Ingen service</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filterRisk}
        onValueChange={(value) => onFilterRisk(value as 'all' | RiskLevel)}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Risk" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla risknivåer</SelectItem>
          <SelectItem value="medium">Medel och högre</SelectItem>
          <SelectItem value="high">Hög och kritisk</SelectItem>
          <SelectItem value="critical">Endast kritisk</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sortBy} onValueChange={(value) => onSortBy(value as ComponentsSort)}>
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Sortering" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Standardsortering</SelectItem>
          <SelectItem value="risk">Högst risk först</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="h-9"
        disabled={suggesting || riskListEmpty}
        onClick={onGenerateRiskSuggestions}
      >
        <Sparkles className="h-4 w-4 mr-1" />
        {suggesting ? 'Skapar…' : 'Riskförslag'}
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-9">
          <X className="h-4 w-4 mr-1" />
          Rensa filter
        </Button>
      )}
    </div>
  );
}
