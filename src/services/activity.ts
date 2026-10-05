import type { UUID } from "../domain/finance.js";
import type {
  ActivityCursor,
  ActivityDetail,
  ActivityEntityKind,
  ActivityFilterCatalog,
  ActivitySearchFilters,
  ActivitySearchPage,
} from "../domain/activity.js";

export interface FinanceActivityService {
  search(
    filters?: ActivitySearchFilters,
    limit?: number,
    cursor?: ActivityCursor | null,
  ): Promise<ActivitySearchPage>;

  getDetail(
    entityKind: ActivityEntityKind,
    entityId: UUID,
  ): Promise<ActivityDetail>;

  getFilterCatalog(
    productQuery?: string | null,
    productLimit?: number,
  ): Promise<ActivityFilterCatalog>;
}
