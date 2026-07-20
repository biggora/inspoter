
x Добавить новый раздел хостинги, для мониторинга и управления хостингами с поддержкой API  
 * cPanel https://documentation.cpanel.net/display/DD/Guide+to+cPanel+API+2
 * Hostinger https://developers.hostinger.com/#description/introduction

Добавить раздел напоминания (подписки, регулярные платежи и так далее)

x Добавить возможность настройки исходящих вебхуков.
 * скорректировать настройку вэбхука более детально, разделить их по разделам

Добавить раздел заметки (Obsidian)

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