import { describe, expect, it } from "vitest";

import {
  contactDetailHref,
  contactDuplicatesHref,
  contactsListHref,
  parseContactsFilters,
  type ContactsFilters,
} from "@/components/contacts/list-params";

const empty: ContactsFilters = {
  query: "",
  labelId: null,
  starred: false,
  page: 1,
};

describe("parseContactsFilters", () => {
  it("defaults an absent query string to the unfiltered first page", () => {
    expect(parseContactsFilters({})).toEqual(empty);
  });

  it("trims the query", () => {
    expect(parseContactsFilters({ query: "  ivanov  " }).query).toBe("ivanov");
  });

  it("treats only the literal true as starred", () => {
    expect(parseContactsFilters({ starred: "true" }).starred).toBe(true);
    expect(parseContactsFilters({ starred: "1" }).starred).toBe(false);
    expect(parseContactsFilters({ starred: "false" }).starred).toBe(false);
  });

  it("falls back to page 1 for a non-numeric or zero page", () => {
    expect(parseContactsFilters({ page: "abc" }).page).toBe(1);
    expect(parseContactsFilters({ page: "0" }).page).toBe(1);
    expect(parseContactsFilters({ page: "3" }).page).toBe(3);
  });
});

describe("contactsListHref", () => {
  it("is a bare path when nothing is filtered", () => {
    expect(contactsListHref(empty)).toBe("/contacts");
  });

  it("omits page 1", () => {
    expect(contactsListHref({ ...empty, page: 1 })).toBe("/contacts");
  });

  it("round-trips through parseContactsFilters", () => {
    const filters: ContactsFilters = {
      query: "иванов & co",
      labelId: "label-1",
      starred: true,
      page: 4,
    };
    const search = new URLSearchParams(contactsListHref(filters).split("?")[1]);
    expect(
      parseContactsFilters({
        query: search.get("query") ?? undefined,
        labelId: search.get("labelId") ?? undefined,
        starred: search.get("starred") ?? undefined,
        page: search.get("page") ?? undefined,
      }),
    ).toEqual(filters);
  });

  it("returns to the first page when a filter is patched", () => {
    const onPage3: ContactsFilters = { ...empty, page: 3 };
    expect(contactsListHref(onPage3, { query: "ivanov" })).toBe(
      "/contacts?query=ivanov",
    );
    expect(contactsListHref(onPage3, { labelId: "label-1" })).toBe(
      "/contacts?labelId=label-1",
    );
    expect(contactsListHref(onPage3, { starred: true })).toBe(
      "/contacts?starred=true",
    );
  });

  it("keeps the filters when a page is patched", () => {
    expect(
      contactsListHref({ ...empty, query: "ivanov", page: 2 }, { page: 3 }),
    ).toBe("/contacts?query=ivanov&page=3");
  });

  it("keeps the current page when the patch is empty", () => {
    expect(contactsListHref({ ...empty, page: 3 })).toBe("/contacts?page=3");
  });
});

describe("contactDetailHref", () => {
  it("carries the list view into the detail URL", () => {
    expect(
      contactDetailHref("c1", {
        query: "ivanov",
        labelId: "label-1",
        starred: true,
        page: 2,
      }),
    ).toBe("/contacts/c1?query=ivanov&labelId=label-1&starred=true&page=2");
  });

  it("stays bare when the list is unfiltered", () => {
    expect(contactDetailHref("c1", empty)).toBe("/contacts/c1");
  });
});

describe("contactDuplicatesHref", () => {
  it("carries the list view so merging returns to it", () => {
    expect(contactDuplicatesHref({ ...empty, query: "ivanov" })).toBe(
      "/contacts/duplicates?query=ivanov",
    );
  });
});
