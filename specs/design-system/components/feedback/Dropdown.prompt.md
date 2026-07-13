One-liner: Anchored menu that opens under a trigger; self-managing open/close.

```jsx
<Dropdown
  align="right"
  trigger={<IconButton icon="ri-more-2-line" aria-label="Меню" />}
>
  <DropdownLabel>admin · Оператор</DropdownLabel>
  <DropdownItem icon="ri-user-line">Профиль</DropdownItem>
  <DropdownSep />
  <DropdownItem icon="ri-logout-box-r-line" danger>
    Выйти
  </DropdownItem>
</Dropdown>
```

- Closes on outside click and on item select. `align` pins the menu's left/right edge to the trigger.
- `DropdownItem`: `active` for the current selection (log/source filters), `danger` for destructive rows. Menus use the menu shadow.
