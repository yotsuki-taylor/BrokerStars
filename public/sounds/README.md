# Звуки

`OST1.mp3` — музыка боя. Она идёт вровень с часами матча (`musicAt` в
`src/ui/sfx.ts`), поэтому длина трека должна совпадать с длиной боя: 80 секунд.

Звуковые эффекты и музыка игры. Всё из `public/` Vite кладёт в сборку как есть,
так что файл `public/sounds/click.mp3` в игре доступен по адресу
`${import.meta.env.BASE_URL}sounds/click.mp3` — так же, как текстуры через `tex()`
в `src/ui/components.tsx`.

Формат: только `.mp3` — играет везде, включая Telegram на старых iPhone, где
`.ogg` не работает. Исходники (`.wav`) сюда не кладите: всё из `public/`
попадает в APK. Перевод из WAV:

    ffmpeg -i click.wav -c:a libmp3lame -q:a 4 click.mp3
