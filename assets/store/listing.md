# Store listing copy

Paste these into Play Console. The English one is the default locale (`en-US`);
Russian is a second locale added under **Store listing → Manage translations**.

Every claim here is read off the game rather than remembered. Eighty seconds is
`durationSec` in `src/sim/config.ts`; the leagues and their blurbs are
`src/ui/leagues.ts`; what the five abilities actually do is `src/sim/abilities.ts`
and the item text in `src/ui/i18n.ts`; what a share pays for being held is
`DIVIDEND_YIELD` in `src/market/protocol.ts`; seven upgrades and the 700 they
add to the opening book are `ROOM_STEPS` and `ROOM_CASH_TOTAL`; the 10 000
everybody starts on is `startingCash`; twenty-eight companies and twenty awards
are their catalogues. If any of
those change, this file is wrong and should change with them.

THE OFFICE PARAGRAPH IS THE PROOF OF THAT. It described the renovation as
decoration — "somewhere worth sitting" and nothing else — for as long as the
renovation was decoration, and stayed that way for a release after it started
paying out. A description that undersells the thing coins are actually for is a
description that costs installs.

THE SHARE COUNTER IS THE SECOND PROOF, and a worse one. It promised three
orders a day for a release after the limit was taken out, and said nothing at
all about dividends for the release that added them — so it was advertising a
restriction the game no longer has while hiding the reward it had just gained.
A description that names a rule the game does not have teaches a new player,
on their first day, that the text cannot be trusted.

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

## English — full description (2786 / 4000)

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

AN OFFICE THAT PAYS FOR ITSELF
Coins go into the room behind the menu: walls, a window, a desk, shelves, a
monitor, posters. Seven upgrades from a bare room to somewhere worth sitting —
and every one of them raises the cash you sit down with, up to 700 on a starting
10,000. A finished office opens every match ahead of a rival who never
renovated. Clothes too: five things to wear, five grades of each, and the good
ones are not just for looking at.

A SHARE COUNTER
Between matches there is a slower game. Dollars buy a piece of a company you
have actually played against, the price moves once a night, and everything you
held overnight pays a dividend in the morning — more from the dull companies
than from the exciting ones, which pay in their price or not at all. Trade as
often as you like: the house takes its cut on both sides and the price only
moves at midnight, so nothing here is won by hurrying. The coins you win are
one table; what your shares are worth is another, and they reward opposite
habits.

DUELS
Play a friend rather than the house. Same eighty seconds, same three companies,
both of you watching one market — the server runs the match, so neither side
can be looking at a different chart. Invite by link or by code.

TWENTY AWARDS
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

## Русский — полное описание (2580 / 4000)

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

КАБИНЕТ, КОТОРЫЙ ОКУПАЕТСЯ
Монеты уходят в комнату за меню: стены, окно, стол, полки, монитор, постеры.
Семь шагов от пустой комнаты до места, где хочется сидеть, — и каждый шаг
добавляет денег на старте матча, до 700 к стартовым 10 000. Законченный кабинет
начинает каждый забег впереди соперника без ремонта. И одежда: пять вещей, по
пять уровней каждая, и хорошие нужны не только для вида.

СТОЙКА АКЦИЙ
Между матчами идёт медленная игра. Доллары покупают кусок компании, против
которой ты уже играл, цена меняется раз за ночь, а всё, что пролежало ночь в
портфеле, наутро платит дивиденды — скучные компании больше, чем яркие: те
зарабатывают ценой или не платят вовсе. Заявок сколько угодно: дом берёт своё с
обеих сторон, а цена двигается только в полночь, так что спешкой тут ничего не
выигрывается. Заработанные монеты — один рейтинг, стоимость акций — другой, и
они поощряют противоположные привычки.

ДУЭЛИ
Сыграй с другом, а не с машиной. Те же восемьдесят секунд, те же три компании,
один рынок на двоих — матч считает сервер, так что смотреть в разные графики
не выйдет. Позвать можно ссылкой или кодом.

ДВАДЦАТЬ НАГРАД
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

**Tags** — pick from Play's own list; there is no free text, and the list is
filtered by the CATEGORY above, so changing the category changes what is on
offer. Four are set: **Casual, Simulation, Time management, Economic strategy**.

Read Play's own tooltip before judging a tag by its name. Two of these looked
wrong and were not. TIME MANAGEMENT sounds like Diner Dash; Play defines it as
allocating resources quickly and in sequence, with the horizon set by the clock
rather than by long-term goals — which is the match exactly, and is why the
difficulty ladder is built on `holdTicks` rather than on money. ECONOMIC
STRATEGY is the other half: "earning through strategic investments" is the
share counter and the dollars board. The two tags contradict each other in
Play's own wording and both are still true here, because the match has no long
game and the meta between matches is nothing else.

Rejected, and why, so nobody re-adds them: CLICKERS (no idle loop at all — it
brings people who bounce, and Play counts retention), MINI-GAMES (means a
collection of small games, and this is one game), LIFESTYLE SIMULATION (true of
the office and the wardrobe, but they are the meta rather than the game).
Nothing in the list names the stock market; the theme is carried by the title,
the descriptions and the banner instead, which is what search actually reads.

**Contact details** — an email address is required and is shown publicly on the
listing. Use one you are willing to publish.

**Privacy policy** — a public URL, required because the game signs people in
with Google. It has to say what is collected (a Google account id and display
name), what it is used for (one account across two devices, a leaderboard), and
how to delete it — which the game does itself, in Settings → Account. The
document is `public/privacy.html` and ships with the web build, so it cannot
drift from the game by a release.

**Data safety** — the form Play keeps beside the policy, and it has to agree
with it. Two things were added the day the settings sheet grew a FEEDBACK box:
the **message text a player types**, and an **email address, if they choose to
give one** for a reply. Both are collected and **neither is stored** — the
report is carried to the developers and kept in no table — which is exactly what
the form has a checkbox for. Answering "we collect nothing" because the game
used to collect nothing is how a Data safety form and a privacy policy end up
contradicting each other, and it is the policy that will be read out to you.

**Financial features** — the declaration a game about a stock market obviously
attracts. The honest answer is none of them: invented companies, play money, no
transaction anybody can make. Said plainly in the last paragraph of both
descriptions on purpose, and it should stay said.
