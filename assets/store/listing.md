# Store listing copy

Paste these into Play Console. The English one is the default locale (`en-US`);
Russian is a second locale added under **Store listing → Manage translations**.

Every claim here is read off the game rather than remembered. Eighty seconds is
`durationSec` in `src/sim/config.ts`; the leagues and their blurbs are
`src/ui/leagues.ts`; what the five abilities actually do is `src/sim/abilities.ts`
and the item text in `src/ui/i18n.ts`; three orders a day is `ORDERS_A_DAY`;
seven upgrades is `ROOM_STEPS`; twenty-eight companies and twenty-two awards are
their catalogues. If any of those change, this file is wrong and should change
with them.

THE RUSSIAN NAMES ARE THE GAME'S OWN, not translations of the English ones. The
first draft of this file translated BRONZE PIT as "Бронзовая яма" and the game
calls it "Бронзовый ряд"; four of the five leagues were wrong that way. Anything
a player can read on screen is in `i18n.ts` and should be copied from there.

Two things are said plainly in both languages and should stay said: the
companies are invented, and no real money is involved. A game about a stock
market that is coy about either is a game that gets read as a trading app — by a
player deciding whether to install it, or by a reviewer deciding what it is.

---

## English — short description (74 / 80)

```
80 seconds. Three stocks. One rival. Trade fast, read the board, cash out.
```

## English — full description (2312 / 4000)

```
Eighty seconds. Three companies. One rival across the table.

A match is a business year squeezed into eighty seconds — four quarters, prices
that move while you are still deciding, and a rival buying the same three
stocks you are. Whoever ends with the bigger net worth wins. Positions close
themselves at the whistle, so the finish is never a scramble to sell.

BUY, SELL, SHORT
Every company has a character. Some drift, some spike, some fall out of the sky
in the last quarter. Twenty-eight of them, each with its own habits, and three
on the board each match. Learning which is which is the whole game.

FIVE ABILITIES
Five seconds in which your rival cannot open anything new. Ten in which nobody
trades whatever they are deepest in — you included. A dossier that shows what
they are holding for the rest of the match. A margin call that closes their
positions where they stand. A rumour that pushes your biggest position your way
for six seconds. One use each, and when you spend it matters more than having
it.

FIVE LEAGUES
Bronze Pit, Silver Floor, Gold Desk, Global Fund, Bull Crown. The first rival
trades late, small, and panics out. The last one reads the tape before you do —
beat it and you have doubled your money.

AN OFFICE THAT FILLS UP
Coins go into the room behind the menu: walls, a window, a desk, shelves, a
monitor, posters. Seven upgrades from a bare room to somewhere worth sitting.
Clothes too — five things to wear, five grades of each, and the good ones are
not just for looking at.

A SHARE COUNTER
Between matches there is a slower game: three orders a day, prices that move
overnight, and a portfolio ranked on a board of its own. The coins you win are
one table; what your shares are worth is another, and they reward opposite
habits.

DUELS
Play a friend rather than the house. Same eighty seconds, same three companies,
both of you watching one market — the server runs the match, so neither side
can be looking at a different chart. Invite by link or by code.

TWENTY-TWO AWARDS
For winning without trading. For going broke and coming back. For the trade
nobody would have made.

The companies are invented, the money is play money, and nothing here is real
trading or advice about it. It is a game about reading a room full of prices
faster than the person across from you.
```

---

## Русский — короткое описание (76 / 80)

```
80 секунд. Три акции. Один соперник. Кто прочёл рынок быстрее, тот и богаче.
```

## Русский — полное описание (2157 / 4000)

```
Восемьдесят секунд. Три компании. Один соперник напротив.

Матч — это деловой год, сжатый до восьмидесяти секунд: четыре квартала, цены
ползут, пока ты ещё думаешь, а соперник покупает те же три акции. Побеждает тот,
у кого к финалу больше капитал. Позиции закрываются на свистке сами, так что
успевать продать не нужно.

ПОКУПАЙ, ПРОДАВАЙ, ШОРТИ
У каждой компании свой характер. Одна ползёт, другая скачет, третья валится в
последнем квартале. Их двадцать восемь, у каждой свои повадки, и на доску
выходят три. Выучить, кто есть кто, — это и есть игра.

ПЯТЬ СПОСОБНОСТЕЙ
Пять секунд, в которые соперник не может открыть ничего нового. Десять, когда
никто не торгует тем, во что он вложен глубже всего, — ты тоже. Досье: до конца
матча видно, что он держит. Маржин-колл, закрывающий все его позиции там, где
они стоят. Слух, который шесть секунд двигает твою крупнейшую позицию в твою
сторону. По одному разу за матч, и когда потратить — важнее, чем иметь.

ПЯТЬ ЛИГ
Бронзовый ряд, Серебряный зал, Золотой стол, Мировой фонд, Корона быка. Первый
соперник заходит поздно, мелко и паникует. Последний читает ленту раньше тебя —
обыграешь, считай, удвоил счёт.

КАБИНЕТ, КОТОРЫЙ ОБРАСТАЕТ
Монеты уходят в комнату за меню: стены, окно, стол, полки, монитор, постеры.
Семь шагов от пустой комнаты до места, где хочется сидеть. И одежда — пять
вещей, по пять уровней каждая, и хорошие нужны не только для вида.

СТОЙКА АКЦИЙ
Между матчами идёт медленная игра: три заявки в сутки, цены меняются за ночь, а
портфель попадает в отдельную таблицу. Заработанные монеты — один рейтинг,
стоимость акций — другой, и они поощряют противоположные привычки.

ДУЭЛИ
Сыграй с другом, а не с машиной. Те же восемьдесят секунд, те же три компании,
один рынок на двоих — матч считает сервер, так что смотреть в разные графики
не выйдет. Позвать можно ссылкой или кодом.

ДВАДЦАТЬ ДВЕ НАГРАДЫ
За победу без единой сделки. За то, что обанкротился и вернулся. За сделку,
которую никто бы не сделал.

Компании выдуманы, деньги игровые, и ничего здесь не является реальной торговлей
или советом по ней. Это игра про то, чтобы прочитать комнату, полную цен,
быстрее человека напротив.
```

---

## The other fields

**App name** — `Broker Stars` (12 / 30).

**Category** — Games → Simulation. Casual is the other honest answer; Simulation
is closer to what the match actually is.

**Tags** — pick from Play's own list; there is no free text. Stock market,
simulation, competitive and casual are the ones that fit.

**Contact details** — an email address is required and is shown publicly on the
listing. Use one you are willing to publish.

**Privacy policy** — a public URL, required because the game signs people in
with Google. It has to say what is collected (a Google account id and display
name), what it is used for (one account across two devices, a leaderboard), and
how to delete it — which the game does itself, in Settings → Account.
