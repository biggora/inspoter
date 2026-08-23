
x Добавить новый раздел хостинги, для мониторинга и управления хостингами с поддержкой API  
 * cPanel https://documentation.cpanel.net/display/DD/Guide+to+cPanel+API+2
 * Hostinger https://developers.hostinger.com/#description/introduction

[x] Добавить возможность настройки исходящих вебхуков.
 * скорректировать настройку вэбхука более детально, разделить их по разделам

[ ] Добавить раздел заметки (Obsidian)
[ ] Добавить новый раздел в инспоттер календарь.
[x] Добавить новый раздел в инспоттер Kanban.
[x] Создать в inspoter раздел контакты по такому же принципу как Google контакт с поддержкой тех же форматов и самых популярных.
[ ] добавить латышский язык

Добавить в почте возможность ставить метки на письмах, фильтры, вебхуки.

Необходимо разработать и добавить OpenAPI спецификацию. 


commit and merge to main

/model claude-opus-4-6[1m]

Hetzner API
https://robot.hetzner.com/doc/webservice/en.html#general
Hostinger API 
https://developers.hostinger.com/#description/introduction
cPanel API
https://documentation.cpanel.net/display/DD/Guide+to+cPanel+API+2


Backup/Restore
Известные ограничения (задокументированы в architecture.md): архив собирается в памяти целиком (лимит импорта 512 МиБ через BACKUP_MAX_IMPORT_BYTES, streaming — future work); неверный пароль и повреждённый файл неразличимы (свойство GCM); e2e-тест в браузере не гонялся — ручная проверка по чек-листу из плана рекомендуется перед мержем. 18 падающих unit-тестов и ~113 файлов в format:check — pre-existing проблемы репозитория, подтверждены на чистом дереве до наших изменений.


curl -X POST http://your-host/api/webhooks/mail \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json" \
-d '{"sender":"noreply@example.com","subject":"Test","body":"Hello"}'


этот же механизм необходимо будет реализовать как минимум в трёх разделах domains, hosting, servers.

"Что стоит знать: это N+1 к провайдеру на каждый заход в раздел (страница force-dynamic). На пяти зонах RSC-пейлоад отдаётся за ~730 мс. При десятках зон это станет заметно и упрётся в лимиты Cloudflare — тогда счётчик имеет смысл догружать лениво на клиенте или кэшировать. Сейчас не усложнял."


http://atzinums.blogspot.com/


Два замечания по решениям, которые стоит знать:

Поиск по алертам ищет по хранимому английскому тексту, то есть на русской локали оператор ищет английскими словами. Альтернатива — индексировать переводы.
Исторические тексты алертов по вашему решению не переписывались, так что старые записи останутся русскими до вытеснения; категории и папка Inbox мигрированы.

