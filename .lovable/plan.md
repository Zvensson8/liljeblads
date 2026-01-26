

# Åtgärda Arbetsorder-triggern

## Problem
Triggerfunktionen `queue_work_order_embedding` på `work_orders`-tabellen refererar till en kolumn `component_id` som inte existerar. Detta blockerar alla INSERT och UPDATE-operationer på arbetsordrar.

## Orsak
Tabellen `work_orders` är kopplad till **fastigheter** via `property_id`, inte till komponenter. Triggern skrevs felaktigt och antar att arbetsordrar har en `component_id`-kolumn.

## Lösning

### Steg 1: Uppdatera triggerfunktionen
Ändra funktionen `queue_work_order_embedding` så att den hämtar `organization_id` direkt från `properties`-tabellen via `property_id`:

```sql
CREATE OR REPLACE FUNCTION queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Hämta organization_id via property_id
    SELECT organization_id INTO org_id 
    FROM properties 
    WHERE id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    -- Hämta organization_id via property_id
    SELECT organization_id INTO org_id 
    FROM properties 
    WHERE id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Steg 2: Ta bort duplicerad trigger
Det finns två triggrar som använder samma funktion. Vi behåller en och tar bort duplicatet:

```sql
DROP TRIGGER IF EXISTS work_orders_embedding_trigger ON work_orders;
```

## Resultat
Efter denna ändring kommer du kunna:
- Skapa nya arbetsordrar
- Uppdatera status och annan information
- Dra-och-släpp i Kanban-vyn

Embedding-kön kommer fortfarande fungera korrekt för AI-sökningar.

## Tekniska detaljer

### Före (trasig)
```
work_orders.component_id → components.property_id → properties.organization_id
         ↑
    Existerar inte!
```

### Efter (korrekt)
```
work_orders.property_id → properties.organization_id
         ↑
    Fungerar!
```

