
# Åtgärdsplan: Visa Integrationer-fliken för Founders

## Problem
OrganizationSettings-sidan kontrollerar bara `organization_members.role` för att avgöra om användaren är admin. Din `founder`-roll i `user_roles`-tabellen ignoreras, vilket betyder att du som founder inte ser admin-flikarna trots att du borde ha full åtkomst.

## Lösning
Utöka admin-kontrollen i `OrganizationSettings.tsx` så att den även kollar `user_roles`-tabellen för `admin` eller `founder`-roller.

## Förändringar

### 1. Uppdatera OrganizationSettings.tsx
- Lägg till en ny fråga som kollar `user_roles`-tabellen
- Kombinera båda kontrollerna för att sätta `isAdmin`

**Ny logik:**
```typescript
// Kolla om användaren är founder/admin i user_roles
const { data: systemRoles } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", user?.id);

const isSystemAdmin = systemRoles?.some(
  r => r.role === "admin" || r.role === "founder"
) || false;

// isAdmin = true om antingen organization_members har owner/admin
// ELLER user_roles har admin/founder
const isAdmin = 
  memberData.role === "owner" || 
  memberData.role === "admin" || 
  isSystemAdmin;
```

---

## Tekniska detaljer

### Filer som ändras:
| Fil | Ändring |
|-----|---------|
| `src/pages/OrganizationSettings.tsx` | Lägg till kontroll av `user_roles`-tabellen |

### Steg:
1. I `fetchOrganizationData()` - lägg till en fråga mot `user_roles`
2. Uppdatera `isAdmin`-variabeln att kombinera båda kontrollerna
3. Skicka `isAdmin` som state istället för att beräkna det från `userRole`

Detta följer samma mönster som redan används i `useModuleAccess.tsx` (rad 38-50).
