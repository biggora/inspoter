One-liner: Centered dialog with scrim, header, body, and optional footer actions.

```jsx
<Modal
  open={open}
  onClose={close}
  title="Остановить сервер"
  footer={<>
    <Button variant="ghost" onClick={close}>Отмена</Button>
    <Button variant="primary" onClick={confirm}>Подтвердить</Button>
  </>}
>
  Сервер «web-prod-01» будет остановлен. Сервисы станут недоступны.
</Modal>
```

- Closes on scrim click and Escape. `size` sm 360 / md 448 (default) / lg 560.
- Only floating layer that uses a shadow — everything else in Inspot is border-defined.
