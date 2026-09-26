# Multiplatform verification

## Ավտոմատ ստուգումներ

repository-ի root-ից՝ բոլոր երեք OS-երում․

```sh
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Native փաթեթավորումը գործարկեք համապատասխան OS-ում․

| OS | Հրաման |
| --- | --- |
| Windows | `npm run tauri build -- --bundles msi,nsis` |
| macOS | `npm run tauri build -- --bundles app,dmg` |
| Ubuntu/Xubuntu | `npm run tauri build -- --bundles deb,appimage` |

Սովորական push/PR-ի համար GitHub Actions չի գործարկվում։ `vX.Y.Z` tag-ի push-ից [Windows release](.github/workflows/release.yml)-ը `windows-latest` runner-ում կատարում է ստուգումները, կառուցում միայն NSIS installer և կցում GitHub Release-ին։ Ռելիզից առաջ տեղային գործարկել `npm run check:release-version -- vX.Y.Z` և համոզվել, որ tag-ի տարբերակը համընկնում է `package.json`-ի ու `src-tauri/tauri.conf.json`-ի տարբերակներին։ CI-ն չի փորձում headless runner-ում հաստատել toast, tray, audio կամ speech վարքը։

Ռելիզից առաջ տեղային ստուգել `npm run check:release-version -- vX.Y.Z` հրամանը։ Այն պետք է հաջողվի միայն այն դեպքում, երբ tag-ի տարբերակը համընկնում է և՛ `package.json`-ի, և՛ `src-tauri/tauri.conf.json`-ի տարբերակներին։ Tag-ի push-ից հետո ստուգել, որ `Windows release` workflow-ը հաջող է, GitHub Release-ը ստեղծվել է, իսկ կցված NSIS installer-ը ներբեռնվում և տեղադրվում է Windows-ում։

TypeScript թեստերը ծածկում են validation/cache/timeout, current-next summary և speech-ի բացակայությունը։ Rust թեստերը՝ scheduler-ի նախազգուշացում, ավարտի հատում, հաջորդ դաս, կրկնությունների կանխում, sleep/wake/կեսգիշեր, JSON persistence և sound-disabled վարք։ Bundled PCM ֆորմատն ու audio sample-ները ստուգվում են առանց ֆիզիկական audio device-ի։

## Ընդհանուր functional checklist

Ստորևի քայլերը կրկնել **յուրաքանչյուր OS-ում** և արդյունքը գրանցել տվյալ հարթակի բաժնում։ Օգտագործեք միայն մեկուսացված տեղային Supabase դպրոց և առանձին OS փորձնական օգտատեր։ Ամբողջ շղթայի քայլերը՝ [PUBLICATION.md](https://github.com/horarium-classium/scheduler/blob/master/supabase/PUBLICATION.md#teacher--student-տեղային-փորձարկում)։ Հին Gist cache-ը fallback չէ։

- [ ] Առաջին մեկնարկը տեսանելի է, իսկ հաստատված կապով հաջորդը՝ թաքնված tray-ում։ Բացակայող build environment-ը ցույց է տալիս հայերեն սխալ։
- [ ] Կարգավորումների կամ cache-ի ընթերցման ձախողումից հետո «Ստուգել կոդը» հստակ սխալ է ցույց տալիս։ Ուշացած սկզբնական ընթերցման ժամանակ սեղմելը սպասում է պատրաստմանը։
- [ ] 4 տառանոց կոդի ստուգում → դպրոցի/դասարանի անուններ → «Միանալ»։ Պահման ձախողումը հաջողություն չէ։
- [ ] Դասարանի փոփոխության սխալ կոդը/Չեղարկելը պահպանում են նախկին կապը։ Հաջող փոխումից հետո հին notification/զանգ/սպասող խոսք չկա։
- [ ] Local/hosted և երկու դասարանների cache-երը մեկուսացված են։ `schedule-v1.json`-ը չի ներմուծվում և չի ջնջվում։
- [ ] `null`-ը մաքրում է հիշեցումները նաև հաջորդ offline restart-ի համար։ Դատարկ հրապարակումը փոխարինում է նախորդ cache-ը։
- [ ] Վնասված/ավելի նոր cache/settings ֆայլերը չեն վերագրվում։ Հին notification/sound/speech արժեքները պահպանվում են։
- [ ] Համակարգչից տարբեր դպրոցի timezone, դպրոցի կեսգիշեր և DST. բացակայող ժամը բաց է թողնվում, կրկնվող ժամը միայն առաջին անգամ է կատարվում։

- [ ] Առցանց startup-ը բեռնում է դասացուցակը և պահում cache-ը՝ դպրոցի/դասարանի անուններով։
- [ ] Offline restart-ը օգտագործում է cache-ը՝ «պահված տարբերակ» նշումով։
- [ ] Առանց cache-ի և կապի կա հասկանալի error ու կրկին փորձելու հնարավորություն։
- [ ] Invalid time/day/name/overlap և վնասված cache-ը չեն փոխանցվում scheduler-ին։
- [ ] Գլխավոր պատուհանի վերնամասում երևում են դասարանը և դրա կոդը՝ ժամի փոխարեն։ Կոդի վրա սեղմելը բացում և focus է տալիս դասարանի կոդի մուտքագրման ձևին։ Սխալից հետո հասանելի է «Կրկին փորձել»-ը։ Tray-ում ձեռքով թարմացման կետ չկա։ Գործարկման ժամանակ դասացուցակը բեռնվում է UI/cache/scheduler-ում։
- [ ] Կարգավորումների դիալոգ չկա։ Tray-ի երեք անջատիչները փոխում են համապատասխան կարգավորումները, իսկ պահպանման սխալի դեպքում նշումները վերականգնվում են և գլխավոր պատուհանում երևում է սխալը։
- [ ] Teacher-ում հրապարակել փոփոխություն․ Student-ը առանց վերագործարկման առավելագույնը մոտ 15 րոպե 10 վայրկյանում թարմացնում է UI/cache/scheduler-ը։ Կրկնել թաքնված պատուհանով յուրաքանչյուր OS-ում։
- [ ] Անջատել ցանցը․ պարբերական ստուգումը պահպանում է cache-ը և պատուհանը չի բացում։ Կապը վերականգնելիս հաջորդ ստուգումը բեռնում է նոր տարբերակը։
- [ ] 15 րոպեից երկար sleep-ից հետո հաջորդ native tick-ը կատարում է միայն մեկ ստուգում։ Բաց միացման ձևի/հաստատման ընթացքում հարցումը հետաձգվում է, իսկ հին հարցման պատասխանը չի վերագրում նոր դասարանը։
- [ ] Current/next summary-ն, progress-ը և ազատ օրվա վիճակը ճիշտ են, նաև օրափոխությունից հետո։
- [ ] Settings-ը պահպանվում է restart-ից հետո, tray checkmarks-ը համապատասխանում են պահպանված վիճակին։
- [ ] Հայերեն voice-ի դեպքում խոսքը հայերեն է, միայն անգլերենի դեպքում՝ անգլերեն առանց դասանունների, իսկ երկուսի կամ speech API-ի բացակայության դեպքում խոսքը բաց է թողնվում։
- [ ] Օրվա փոփոխությամբ հին notification key-երը հեռացվում են, կեսգիշերի նախազգուշացումը չի կրկնվում։

## Windows manual checklist

OS/version/architecture, build revision և ամսաթիվ՝ **չստուգված**։

- [ ] NSIS build, առանց administrator իրավունքի current-user install, launch, uninstall և WebView2 առկայություն։
- [ ] Նոր գիրք/ժամացույց icon-ը երևում է installer-ում, Start/taskbar-ում և tray-ում՝ light/dark theme ու տարբեր scaling-ով։
- [ ] Native system notification՝ նախազգուշացում, ավարտ, ընթացող դասի ընթացքում startup և duplicate suppression։ Ստուգել notification permissions/Do Not Disturb-ը։
- [ ] System tray՝ Close → hide, Open, կարգավորումների անջատիչներ, Quit։
- [ ] Launch at login՝ ավտոմատ գրանցում առաջին և հաջորդ մեկնարկներին, հաջորդ login-ից գործարկում, նաև հին false կարգավորումներով։
- [ ] Start minimized՝ սովորական launch/login առանց window flash-ի, tray-ից վերադարձ։
- [ ] Sleep/wake՝ բաց թողնված start/end և կեսգիշեր, յուրաքանչյուր event միայն մեկ անգամ։
- [ ] Sound՝ տեսանելի/թաքնված պատուհան, on/off, համաժամանակյա զանգերի միավորում, volume mixer, audio device-ի անջատում և հաջորդ զանգի վերականգնում։
- [ ] Speech՝ WebView2, հայերեն voice-ի առկայությամբ և առանց դրա, speech-disabled և ընթացիկ խոսքի cancellation։
- [ ] Notifications-disabled՝ նոր native notification, զանգ և խոսք չեն գործարկվում։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## macOS manual checklist

OS/version/architecture, build revision և ամսաթիվ՝ **չստուգված**։

- [ ] `.app`/`.dmg` build, drag-install, launch և uninstall։ Ստորագրում/notarization-ը ստուգել տարածման փուլում։
- [ ] Նոր icon-ը երևում է Finder/Dock-ում, իսկ menu bar-ի template icon-ը ընթեռնելի է light/dark mode-ում և Retina/non-Retina էկրաններին։
- [ ] Native system notification՝ Notification Center, permissions/Focus, նախազգուշացում/ավարտ և duplicate suppression։
- [ ] Menu bar tray՝ Close → hide, Open, կարգավորումների անջատիչներ, Quit։ Dock reopen-ը վերադարձնում է պատուհանը։
- [ ] Launch at login՝ LaunchAgent ավտոմատ գրանցում և logout/login-ից հետո փաստացի գործարկում։
- [ ] Start minimized՝ launch/login առանց window flash-ի, tray և Dock reopen։
- [ ] Sleep/wake՝ missed start/end, կեսգիշեր, կրկնությունների բացակայություն։
- [ ] Sound՝ native output, on/off, թաքնված պատուհան, output device-ի փոփոխություն/անջատում և վերականգնում։
- [ ] Speech՝ WKWebView, հայերեն voice-ի առկայությամբ և առանց դրա, hidden window և cancellation։
- [ ] Notifications-disabled՝ բոլոր նոր ազդանշաններն անջատված են։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## Linux — Ubuntu/Xubuntu manual checklist

Distro/version, desktop session (GNOME/XFCE), X11/Wayland, architecture, revision և ամսաթիվ՝ **չստուգված**։ Կրկնել Ubuntu և Xubuntu միջավայրերում։

- [ ] `.deb`/`.AppImage` build, install/run և uninstall։ Ստուգել WebKitGTK/ALSA runtime dependencies-ը և AppImage-ի պահանջները տվյալ distro-ում։
- [ ] Նոր icon-ը երևում է launcher-ում և GNOME/XFCE tray-ում՝ light/dark panel-ներով ու տարբեր scaling-ով։
- [ ] Native system notification՝ session notification daemon-ի միջոցով, pre-alert/end, Do Not Disturb և duplicate suppression։
- [ ] Tray՝ AppIndicator/StatusNotifier-ը երևում է GNOME/XFCE panel-ում, menu-ի Open/կարգավորումների անջատիչներ/Quit-ը աշխատում են։ Raw tray click event չի պահանջվում։
- [ ] Tray-ի ստեղծման սխալի դեպքում app-ը մնում է տեսանելի․ Close-ը չի թաքցնում այն անհասանելի վիճակում։ Ստուգել նաև panel-ի բացակայության սահմանափակումը։
- [ ] Launch at login՝ desktop autostart entry-ի ավտոմատ գրանցում, հաջորդ graphical login, AppImage-ի կայուն ուղի։
- [ ] Start minimized՝ միայն գործող tray-ով, login և սովորական launch, menu-ից վերականգնում։
- [ ] Sleep/wake՝ missed start/end, կեսգիշեր և duplicate suppression։
- [ ] Sound՝ ALSA/default output՝ տվյալ համակարգի PulseAudio/PipeWire ինտեգրմամբ, on/off, թաքնված պատուհան, սարքի փոփոխություն/անջատում և վերականգնում։
- [ ] Speech՝ WebKitGTK API/voice availability։ Հայերեն voice-ի բացակայության դեպքում crash չկա։ Առկայության դեպքում՝ hidden window և cancellation։
- [ ] Notifications-disabled՝ նոր notification, զանգ և խոսք չեն գործարկվում։
- [ ] Ընդհանուր functional checklist-ը կատարված է։

## Փաստացի ստուգումների սահմանները

Icon-երի փոխարինումից հետո առանձին անցել են `npm run icons`, `npm run build` և macOS x86_64 `cargo check --offline` ստուգումները։ Գեներացված app/tray PNG-ները դիտվել են, ICO/ICNS ֆայլերի ձևաչափերը՝ ստուգվել։ Նոր icon-երով native bundle build և երեք OS-ի desktop manual ստուգումներ դեռ չեն կատարվել։ Ստորևի bundle արդյունքը վերաբերում է նախորդ cross-platform փոփոխություններին։

Այս փոփոխությունները ստուգվում են macOS `x86_64-apple-darwin` միջավայրում։ Windows target/VM չկա, իսկ տեղադրված Docker client-ի daemon-ը չի աշխատում, հետևաբար տեղային Linux build նույնպես չի կատարվել։ Remote CI դեռ չի գործարկվել։ Browser/լսողական/desktop manual checklist-երը չեն համարվում անցած ավտոմատ թեստերից կամ build-ից։

Այս cross-platform փոփոխություններից հետո անցած տեղային ստուգումներ․

| Ստուգում | Արդյունք |
| --- | --- |
| `npm test` | 8 թեստ՝ հաջող |
| `npm run build` | Հաջող |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --offline` | 14 թեստ՝ հաջող |
| `cargo check --manifest-path src-tauri/Cargo.toml --offline` | Հաջող՝ macOS x86_64 |
| `npm run tauri build -- --bundles app,dmg` | Հաջող՝ macOS x86_64 `.app` և `.dmg` |
| Workflow YAML parsing | Հաջող, remote job-երը չեն գործարկվել |
| Windows / Linux native builds | Այս միջավայրում չեն կատարվել |

### Speech fallback regression (յուրաքանչյուր OS-ում առանձին)

- Windows / WebView2՝ ստուգել հայերենը, միայն անգլերենը և երկու լեզուների բացակայությունը։
- macOS / WKWebView՝ կրկնել նույն երեք դեպքերը նաև թաքնված պատուհանով։
- Ubuntu/Xubuntu / WebKitGTK՝ կրկնել նույն դեպքերը, ներառյալ անհասանելի speech API-ն։
- Յուրաքանչյուր հարթակում ստուգել `voiceschanged`-ով ուշ բեռնվելը, 5 վայրկյանից հետո հին խոսքի չկրկնվելը և սպասման ընթացքում «Խոսք»/«Ծանուցումներ» անջատելը։
- Փորձնական ծանուցումը և scheduler-ի նախազգուշացումը, սկիզբը, ավարտը պետք է ընտրեն նույն լեզվային քաղաքականությունը. անգլերենը չի արտասանում հայերեն դասանունները։

### «Կաքավիկ» զանգ

- Windows, macOS և Ubuntu/Xubuntu հարթակներից յուրաքանչյուրում փորձնական ծանուցմամբ հաստատել, որ հնչում է «Կաքավիկ»-ի 6 նոտանոց մոտիվը՝ մոտ 2 վայրկյան, առանց կտտոցների։ Կրկնել թաքնված պատուհանով և «Ձայն» անջատված վիճակում։

## Teacher cloud workspace — 2026-09-23

- Node.js/macOS: 18 current unit tests passed, including UUID mapping, validation, serialized saves, retries, and signout disposal. Obsolete localStorage migration tests were removed with the retired local storage code.
- Pages production build passed.
- Local Supabase: all 110 pgTAP assertions passed (including 16 new workspace checks); database lint passed.
- Local HTTP API: authenticated membership lookup, cloud adapter save, second-client read, stale-write rejection, and test-data cleanup passed.
- Hosted: workspace migration applied without seeds; existing «Տնային դպրոց» membership linked to the confirmed user.
- Browser visual/end-to-end interaction check remains unverified: browser tool could not verify its admin-enforced policy.
- Real published Teacher UI needs deployment and the manual checks in [Scheduler-ի Teacher ստուգումները](https://github.com/horarium-classium/scheduler/blob/master/apps/teacher/README.md).

## Publication backend

Run `npm run publication:test:embedded` at repository root after installing root, Teacher and Student dependencies. This starts no server and tests migrations, RLS/roles, immutable history, idempotency, stale versions, invalid references, empty schedules, class lifecycle, anonymous privacy and the actual Student parser. PGlite uses a minimal Auth fixture; it does not verify hosted Auth/PostgREST or simultaneous connections.

Teacher publication adapter/status tests run with `npm test --prefix ../scheduler/apps/teacher`. Against an already running local Supabase with the new migration applied, run `npm run supabase:test` (includes publication and two-connection concurrency) and `npm run supabase:lint`. Never run those local database fixtures against hosted data. Manual publication checks are in [Scheduler publication docs](https://github.com/horarium-classium/scheduler/blob/master/supabase/PUBLICATION.md).

## Student Supabase — 2026-09-26

Անցած ստուգումներ՝ Student `npm test`՝ 15 թեստ, `npm run build`; Rust `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`՝ 25 թեստ, `cargo check --manifest-path src-tauri/Cargo.toml --locked`; Teacher `npm test`՝ 29 թեստ, `npm run build`; `npm run publication:test:embedded`՝ 3 սցենար։ Release environment checker-ը ստուգվել է վավեր, բացակայող և secret բանալիով մուտքերի համար։

Ստուգման հարթակը՝ macOS / x86_64։ Native UI/tray/notification/audio/speech/sleep-wake ձեռքով ստուգումները և Windows/Linux build-երը դեռ չստուգված են։ Docker daemon-ը միացնելուց հետո իրական local Auth/PostgREST ծրագրային հոսքը ստուգվել է։ Teacher UI → Tauri պատուհանով ամբողջ ձեռքով շղթան դեռ չի կատարվել։ Օգտագործողի տեղային բազան չի reset արվել, hosted միջավայրին չենք միացել։

Ավտոմատ ծածկույթ՝ envelope/UUID/version/timezone/HTTP/timeout/null/empty, environment/class cache isolation, Gist cache-ի բացառում, վնասված/ավելի նոր ֆայլերի պահպանում, պահման ձախողում, persistent invalidation, հաստատում/դասարանի փոխում/ուշացած պատասխան, դպրոցի կեսգիշեր/DST/sleep-wake/duplicate suppression։ Teacher-ի թեստը ստուգում է հանրային UUID-ն և clipboard-ի մերժումը։

Embedded PostgreSQL թեստն օգտագործում է իրական Teacher adapter-ը, migrations/RLS-ը և Student RPC parser/connection controller-ը՝ միացում, offline restart, նոր revision, դասարանի փոխում, դատարկ հրապարակում և persistent null ստուգելու համար։ Transport/storage սահմանները թեստային adapters են. սա native ֆայլերի, UI-ի կամ PostgREST-ի ապացույց չէ։ Native persistence/scheduler-ի առանձին Rust թեստերը ստուգում են իրական տեղային ֆայլեր։

Release-ից առաջ երեք OS-ի վերևի ցուցակներում առանձին նշեք startup/tray/թաքնված հիշեցումներ/sleep-wake/native notification/զանգ/խոսք արդյունքները և հրապարակման ամբողջ շղթան։

### Գործող տեղային Supabase-ով լրացուցիչ ստուգում

- `npm run publication:test:local`՝ հաջող. իրական Auth մուտք, Teacher workspace save/publish, Student UUID preview/confirm, դպրոցի timezone, offline վերականգնում, revision 2-ի բեռնում, դասարանի փոփոխություն, դատարկ revision 3, ոչ ակտիվ դասարանի `null` և հաջորդ offline մեկնարկի արգելք, anon draft-ի մերժում։
- Թեստի offline փուլում անջատվում է միայն դրա HTTP transport-ը, իսկ restart-ը նոր Student controller instance է՝ նույն ժամանակավոր ֆայլով։ Սա OS ցանցի անջատում կամ Tauri process restart չէ։
- Փորձնական դպրոցն ու Auth հաշիվը մեկուսացված պատահական UUID-ներով են։ Վերջում դրանք և ժամանակավոր cache-ը հեռացվում են։ Նախապես եղած public տվյալների fingerprint-ը համընկել է։ Secret/token/password կամ `.env.local` չի արտածվել։
- `npm run supabase:test`՝ **133/133** pgTAP ստուգում, ներառյալ երկու կապով concurrency-ն։ Երկու հին ստուգում ենթադրում էին ճիշտ 2 դասարան. այժմ ամբողջ ID ցանկը համեմատվում է դպրոցի նախապես կարդացված ID-ների հետ՝ լրացուցիչ տեղային դասարանները չջնջելու և RLS ստուգումը պահպանելու համար։
- `npm run supabase:lint`՝ schema errors չկան։ Reset, hosted փոփոխություն կամ նոր migration չի կատարվել։

Կրկնելու համար պետք են գործող local stack-ը, կիրառված migrations-ը և root/Teacher/Student dependencies-ը։ Հրամանը գործարկեք repository root-ից՝ առանց զուգահեռ տվյալների խմբագրման, որպեսզի fingerprint-ի համեմատությունը իմաստալից լինի։

- [ ] UUID տարբերակից թարմացում՝ հին `publication-v2.json`/invalidation ֆայլերը պահպանվում են, նոր կոդով միացումը և offline վերամեկնարկն աշխատում են `publication-v3.json`-ով։

## Join-code review fixes — 2026-09-26

- macOS x86_64 / Node 22.17.1՝ Teacher 30 և Student 15 թեստ, երկու production build։ Rust՝ 26 library test և `cargo check --locked`։ Windows/Linux և native UI/tray/audio ձեռքով չեն ստուգվել այս փուլում։
- Embedded PostgreSQL՝ 5 թեստ, ներառյալ արդեն լցված բազայի forward migration, անփոփոխ publication/draft, UUID compatibility, կոդերի կայունություն և collision retry։
- Տեղային PostgreSQL՝ 139 pgTAP ստուգում առանձին ժամանակավոր բազայում, ներառյալ իրական երկու միացումով նույն կոդի բախումը։ Գործող տեղային բազայի seed-ը խմբագրված է, ուստի ամբողջ suite-ն այնտեղ baseline-ի սխալներ է տալիս․ այն չի reset արվել։
- Գործող տեղային բազայի lint-ը և մեկուսացված HTTP integration-ը անցել են, առկա public տվյալների fingerprint-ը չի փոխվել։
