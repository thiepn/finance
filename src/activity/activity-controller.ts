import type {
  ActivityCursor,
  ActivityDetail,
  ActivityEntityKind,
  ActivityFilterCatalog,
  ActivitySearchFilters,
  ActivitySearchPage,
} from "../domain/activity.js";
import type { UUID } from "../domain/finance.js";
import type { FinanceActivityService } from "../services/activity.js";
import {
  mergeActivityFilters,
  parseActivityQuery,
  type ActivityQueryParseOptions,
  type ParsedActivityQuery,
} from "./activity-query.js";

export interface ActivitySearchRequest {
  query?: string;
  filters?: ActivitySearchFilters;
  limit?: number;
  cursor?: ActivityCursor | null;
  parseOptions?: ActivityQueryParseOptions;
}

export interface ActivitySearchResult extends ActivitySearchPage {
  parsedQuery: ParsedActivityQuery;
  appliedFilters: ActivitySearchFilters;
}

export class ActivityController {
  constructor(private readonly service: FinanceActivityService) {}

  async search(request: ActivitySearchRequest = {}): Promise<ActivitySearchResult> {
    const parsedQuery = parseActivityQuery(
      request.query ?? "",
      request.parseOptions,
    );
    const appliedFilters = mergeActivityFilters(
      parsedQuery.filters,
      request.filters ?? {},
    );

    const page = await this.service.search(
      appliedFilters,
      request.limit,
      request.cursor,
    );

    return {
      ...page,
      parsedQuery,
      appliedFilters,
    };
  }

  getDetail(
    entityKind: ActivityEntityKind,
    entityId: UUID,
  ): Promise<ActivityDetail> {
    return this.service.getDetail(entityKind, entityId);
  }

  getFilterCatalog(
    productQuery?: string | null,
    productLimit?: number,
  ): Promise<ActivityFilterCatalog> {
    return this.service.getFilterCatalog(productQuery, productLimit);
  }
}
