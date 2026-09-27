# Դասացուցակ — Horarium Classium

Windows, macOS և Linux (Ubuntu/Xubuntu family) հարթակների փոքր desktop utility՝ օրվա դասերը տեսնելու և դասերի մեկնարկից ու ավարտից տեղեկանալու համար։ Հավելվածը կառուցված է TypeScript + Vanilla HTML/CSS, Tauri 2 և Rust տեխնոլոգիաներով։ Դասացուցակը բեռնվում է frontend-ում, իսկ հիշեցումների scheduler-ը աշխատում է Rust-ում՝ անկախ թաքնված պատուհանի timer-ից։

![Հիմնական պատուհանի նախնական տեսքը](horarium-classium-student.png)

## Հնարավորություններ

- Supabase-ի հրապարակված դասացուցակին միացում՝ 4 տառանոց դասարանի կոդով, առանց Student հաշվի։
- Հրապարակման բեռնում՝ 10 վայրկյան timeout-ով և դպրոցի ժամային գոտով։
- Վերջին վավեր դասացուցակի offline cache՝ application data directory-ում։
- Դասացուցակը բեռնվում է գործարկման ժամանակ և ավտոմատ ստուգվում յուրաքանչյուր 15 րոպեն մեկ՝ ցանցի անհասանելիության դեպքում օգտագործելով պահված տարբերակը։
- Աղբյուրի նշում՝ առցանց, պահված տարբերակ կամ սխալ։ Առցանց բեռնման դեպքում երևում է թարմացման ժամը։
- Ընթացիկ/հաջորդ դասի ամփոփում, ընթացող դասի առաջընթաց և «Այսօր դասեր չկան» վիճակ։
- Native system notification-ներ դասից մեկ րոպե առաջ և ավարտից հետո։
- Անջատվող bundled զանգ և optional հայերեն/անգլերեն text-to-speech։
- Պահպանվող կարգավորումներ, OS autostart և թաքնված մեկնարկ tray-ում։
- Փակման կոճակը թաքցնում է պատուհանը․ ծրագիրը ամբողջությամբ փակվում է tray-ի «Ելք» գործողությամբ։

## Տվյալներ և validation

Teacher-ում ընտրեք դասարանը, պահպանեք սևագիրը և հրապարակեք այն։ Դասարանի անվան կողքին երևում է կայուն 4 տառանոց կոդը, որը կարելի է պատճենել clipboard-ի փոքր կոճակով։ Student-ի առաջին մեկնարկը բացում է «Միանալ դասարանին» ձևը։ Կոդը ստուգելուց հետո երևում են դպրոցի և դասարանի անունները. «Միանալ»-ը պահպանում է ընտրությունը։ Վերնամասում երևում են ընտրված դասարանը և դրա կոդը։ Կոդի վրա սեղմելը բացում է դասարանի փոփոխման ձևը, որը նույն ընթացքով փոխարինում է այն միայն հաջող պահպանումից հետո։ UUID-ը մնում է ներքին տվյալների identity և օգտվողին որպես կոդ չի ցուցադրվում։

`src/publication.ts`-ը կանչում է `get_published_schedule(p_join_code text)` RPC-ն և ստուգում envelope-ի formatVersion/joinCode/revision/publishedAt/անունները/IANA timezone-ը, ապա առանձին՝ `schedule` դաշտը։ Network/HTTP/JSON/validation սխալի դեպքում օգտագործվում է միայն նույն Supabase URL-ին և դասարանին պատկանող կրկին ստուգված cache-ը։ Առանց դրա երևում են սխալն ու «Կրկին փորձել»-ը։ Դասարանի ստուգման կամ պահման ձախողումը չի փոխում նախկին հաստատված կապը։

Հաջող `null` պատասխանը նշանակում է «Դասարանը հասանելի չէ կամ դեռ հրապարակված չէ»։ Այն մաքրում է հիշեցումները և ֆայլում պահում անվավերացումը. հաջորդ offline մեկնարկը չի ակտիվացնում հին դասերը։ Վավեր դատարկ հրապարակումը նույնպես փոխարինում է նախկին դասերը։ Cache-ի պահման ձախողումը չի ներկայացվում որպես հաջող միացում/թարմացում. երևում է սխալ և retry։ Անվավերացումը հիշողության մեջ կատարվում է նաև սկավառակի ձախողման դեպքում. եթե սկավառակը ընդհանրապես չի ընդունում գրառումներ, restart-ի անվտանգությունը հնարավոր չէ երաշխավորել, և UI-ն այդ մասին հայտնում է։

Թույլատրվում են միայն `Երկուշաբթի`, `Երեքշաբթի`, `Չորեքշաբթի`, `Հինգշաբթի`, `Ուրբաթ`, `Շաբաթ`, `Կիրակի` բանալիները։ Յուրաքանչյուր դաս պետք է ունենա `start`, `end`, `lesson` տեքստային դաշտերը։ Ժամերը պետք է լինեն ճշգրիտ `HH:MM` (`00:00`–`23:59`), `start < end`, իսկ անվանումը՝ ոչ դատարկ։ Նույն օրվա դասերը չեն կարող համընկնել․ հաջորդ դասը կարող է սկսվել նախորդի ավարտի պահին։ Վավեր դասերը դասավորվում են ըստ մեկնարկի, անվանումների եզրային բացատները հեռացվում են։ Բացակայող օրը կամ դատարկ զանգվածը ազատ օր է։

Պահպանման ֆայլերը գտնվում են Tauri-ի `app_data_dir()`-ով որոշվող հավելվածի պանակում։ Այդ API-ն ընտրում է համապատասխան տեղը յուրաքանչյուր OS-ում․ կոդում hard-coded OS path չկա։

- `publication-v3.json`՝ միջավայրը, ընտրված `joinCode`-ը և ամբողջ հրապարակումը կամ `publication: null` անվավերացումը։ Cache-ի ներսի version-ը 3 է։ Հին `publication-v2.json`-ը և նրա invalidation նշիչը մնում են անփոփոխ․ թարմացումից հետո մեկ անգամ միացեք 4 տառանոց կոդով,
- `publication-v3.invalidated.json`՝ անվավերացման լրացուցիչ նշիչ. պաշտպանում է նաև հին cache ֆայլի փոխարինման ձախողման դեպքում,
- հին `schedule-v1.json`-ը չի օգտագործվում և չի ջնջվում,
- `settings.json`՝ կարգավորումները։

Գրառումը կատարվում է նույն պանակում ժամանակավոր ֆայլով, sync-ով և `tempfile::persist`-ով՝ նաև Windows-ում գոյություն ունեցող ֆայլի փոխարինման համար։ `localStorage` չի օգտագործվում։ Վնասված կամ ավելի նոր cache/settings ֆայլը չի վերագրվում defaults-ով. պահուստավորեք այն և ուղղեք պատճառը։ Հին notification/sound/speech արժեքները պահպանվում են։

Օրը, ժամը, դասերը, ամփոփումն ու progress-ը հաշվվում են դպրոցի timezone-ով։ Օրվա անվան կողքի փոքր սլաքներով կարելի է թերթել նախորդ և հաջորդ օրերի դասացուցակները։ Ընթացիկ դասի progress-ն ու «Հաջորդ դասը» ամփոփումը ցուցադրվում են միայն այսօրվա էջում։ Rust-ը օգտագործում է `chrono-tz`-ի ներառված IANA տվյալները։ DST-ի գոյություն չունեցող մեկնարկ/ավարտ ունեցող դասը տվյալ օրը բաց է թողնվում, կրկնվող ժամի համար ընտրվում է առաջին իրական պահը։ Frontend-ն ու scheduler-ը համեմատում են իրական պահերը։ Դասարան կամ timezone փոխելիս duplicate state-ը մաքրվում է, նույն աղբյուրի թարմացման ժամանակ պահպանվում է, իսկ դատարկ/անհասանելի հրապարակումը դադարեցնում է հիշեցումները, սպասող խոսքն ու զանգը։

## Կարգավորումներ և tray

| Կարգավորում | Լռելյայն | Վարք |
| --- | --- | --- |
| Ծանուցումներ | Միացված | Գլխավոր անջատիչ՝ հիշեցումների, զանգի և խոսքի համար |
| Ձայն | Միացված | «Կաքավիկ»-ի առաջին 6 նոտաներով զանգ հիշեցումների ժամանակ |
| Խոսք | Անջատված | Հիշեցման հայերեն տեքստի արտասանում |

Մուտք գործելիս գործարկումն ու կարգավորված հավելվածի tray-ում թաքնված մեկնարկը մշտական վարք են։ Առաջին/չկարգավորված մեկնարկին պատուհանը ցուցադրվում է։ Յուրաքանչյուր մեկնարկին Tauri autostart plugin-ը միացնում է OS գրանցումը։ Հին `autostartEnabled`/`startMinimized` արժեքներն անտեսվում են։ Գրանցման ձախողումը գրվում է log-ում՝ առանց հավելվածի գործարկումն ընդհատելու։ Tray-ի ստեղծման ձախողման դեպքում պատուհանը ցուցադրվում է։ Վնասված settings ֆայլի դեպքում ժամանակավորապես կիրառվում են defaults-ը և ցուցադրվում է սխալը, իսկ ֆայլի փոփոխությունը արգելվում է մինչև այն վերականգնելը։

Tray-ի ընտրացանկը՝ «Բացել», նշվող «Ծանուցումներ», «Ձայն», «Խոսք» և «Ելք»։ Կարգավորումների դիալոգ չկա։ Փոփոխություններն անմիջապես պահվում են ֆայլում։ Պահպանման սխալը ցուցադրվում է գլխավոր պատուհանում, իսկ ընտրացանկի նշումները վերադառնում են պահպանված վիճակին։

## Ձայն և խոսք

Զանգը Կոմիտասի «Կաքավիկ»-ի առաջին 6 նոտաների ինքնուրույն սինթեզված, 2 վայրկյանանոց տարբերակն է՝ մեղմ զանգակային տեմբրով (mono, 16-bit PCM, 22050 Hz)։ Այն ներառված է հավելվածում որպես `src-tauri/assets/kakavik.wav` և բոլոր երեք հարթակներում նվագարկվում է նույն Rust backend-ից։ Օգտագործվում է [Rodio-ի միայն playback հնարավորությունը](https://docs.rs/rodio/0.21.1/rodio/#optional-features)՝ `default-features = false`․ codec փաթեթներ չեն ավելացվում, քանի որ bundled ֆայլը հայտնի PCM ձևաչափով է։ Այս փոքր native audio կախվածությունը պահպանում է թաքնված պատուհանում նվագարկումը՝ առանց browser autoplay-ից կամ արտաքին player-ից կախված լինելու։ OS տարբերությունները կառավարում է audio backend-ը․ հավելվածում WinMM/afplay առանձին implementations չկան։

Միաժամանակյա ազդանշանները չեն կուտակվում։ Ձայնային սարքի սխալը չի կանգնեցնում scheduler-ը, իսկ stalled playback-ը սահմանափակված է 5 վայրկյանով։ WAV-ը կարելի է վերաստեղծել `python3 scripts/generate-kakavik.py` հրամանով։ Linux build-ի համար ավելացվում է `libasound2-dev`, իսկ `.deb`/`.rpm` փաթեթներում նշված է ALSA runtime կախվածությունը։

Խոսքն օգտագործում է WebView-ի `speechSynthesis`-ը՝ նախընտրելով `hy` / `hy-AM` ձայնը։ Հայերենի բացակայության դեպքում ընտրվում է անգլերեն ձայն (`en-US`, ապա `en-GB`, ապա այլ `en`) և անգլերեն հաղորդագրություն՝ առանց հայերեն դասանունների։ Համապատասխան ձայնի կամ API-ի բացակայության դեպքում խոսքը բաց է թողնվում՝ չխանգարելով ծանուցմանը և զանգին։ Ուշ բեռնվող ձայները ստուգվում են նաև `voiceschanged`-ով՝ մինչև 5 վայրկյան. նոր հաղորդագրությունը կամ խոսքի անջատումը չեղարկում է սպասող խոսքը։ Խոսքն ու զանգը առանձին ընտրանքներ են, իսկ «Ծանուցումներ»-ի անջատիչը անջատում է երկուսն էլ։

## Scheduler-ի վարք

Rust worker-ը ստուգում է տեղային ժամը յուրաքանչյուր 10 վայրկյանը մեկ։ Դասից մեկ րոպե առաջ ուղարկվում է մեկնարկի հիշեցում։ Դասի ընթացքում մեկնարկելու կամ sleep-ից արթնանալու դեպքում կարելի է մեկ անգամ ստանալ «դասն արդեն սկսվել է» հաղորդագրությունը։ Բաց թողնված ավարտները մշակվում են վերջին ստուգված օրվա և ընթացիկ օրվա համար, ներառյալ կեսգիշերով անցումը։ Բազմօրյա sleep-ից հետո միջանկյալ ամբողջ օրերի հին հիշեցումները չեն վերարտադրվում։

Duplicate protection-ը գործում է ընթացիկ գործընթացի ընթացքում։ Օրվա փոփոխության ժամանակ նախորդ օրվա բանալիները հեռացվում են․ պահպանվում է հաջորդ օրվա `00:00` դասի արդեն տրված նախազգուշացումը։ Ծանուցումները անջատած ժամանակ իրադարձությունները նույնպես համարվում են մշակված՝ կրկին միացնելիս հին հիշեցումները չկուտակելու համար։

## Կառուցվածք

```text

  index.html
  src/
    main.ts             # UI, սկզբնական բեռնում, օրափոխություն
    schedule.ts         # Student schedule validation
    publication.ts      # Supabase RPC և envelope/cache validation
    connection.ts       # Միացում, հաստատում, մրցակցող հարցումներ
    school-time.ts      # Դպրոցի ժամային գոտի և DST
    settings.ts         # settings state և backend commands
    tray.ts             # tray-ից եկող frontend events
    audio.ts            # playBell() → Rust
    speech.ts           # optional speechSynthesis
    notifications.ts    # ձեռքով ծանուցման helper
    style.css
  src-tauri/
    src/
      lib.rs            # bootstrap, startup visibility
      model.rs          # դասացուցակի տիպեր
      scheduler.rs      # pure scheduler logic և worker
      storage.rs        # app-data JSON cache
      settings.rs       # settings persistence
      tray.rs           # native tray և checked items
      audio.rs          # ընդհանուր native audio backend
    assets/kakavik.wav
  scripts/generate-kakavik.py
  tests/                # Node unit tests TypeScript logic-ի համար
```

## Development և build

Անհրաժեշտ են Node.js 22.17+ (կամ համատեղելի ավելի նոր տարբերակ), npm, Rust stable և տվյալ OS-ի [Tauri prerequisites-ը](https://v2.tauri.app/start/prerequisites/)։ Windows-ում՝ C++ Build Tools/Windows SDK/WebView2, macOS-ում՝ Xcode Command Line Tools։ Ubuntu/Xubuntu-ի համար՝

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev patchelf
```

Linux-ի լայն համատեղելիության համար build արեք աջակցվող ամենահին բազայի վրա․ Ubuntu/Xubuntu build-ը ստուգեք ձեռքով։ Ավելի նոր համակարգում build-ը կարող է պահանջել ավելի նոր glibc, ինչպես նկարագրված է [Tauri-ի Debian ուղեցույցում](https://v2.tauri.app/distribute/debian/#limitations)։

Հրամանները՝ repository-ի root-ից․

```powershell
npm ci
# Պատճենել .env.example-ը .env.local և լրացնել հանրային կարգավորումները
npm run tauri dev
```

Build-ի environment-ը՝ `VITE_SUPABASE_URL` և `VITE_SUPABASE_PUBLISHABLE_KEY` ([օրինակ](.env.example))։ Development-ում դրանք պահեք չհետևվող `.env.local`-ում։ Տեղային Supabase-ի համար URL-ը `http://127.0.0.1:54321` է, բանալին՝ տվյալ local stack-ի publishable key-ը կամ legacy anon JWT-ը։ Release build-ի համար օգտագործեք նպատակային HTTPS project URL-ն ու դրա publishable key-ը։ URL-ն environment identity-ն է, ուստի local/hosted cache-երը չեն խառնվում։ Key rotation-ը չի փոխում դասարանի identity-ն։ Այս արժեքները ներառվում են binary/frontend bundle-ում. secret/service-role բանալի մի տրամադրեք։

GitHub Windows release workflow-ի repository variables-ը՝ `STUDENT_SUPABASE_URL` և `STUDENT_SUPABASE_PUBLISHABLE_KEY`։ Workflow-ը փոխանցում է դրանք Vite-ին և `scripts/check-publication-env.mjs`-ով մերժում բացակայող/անվավեր կարգավորումները։ Տեղային release-ից առաջ նույն environment-ով գործարկեք `node scripts/check-publication-env.mjs`։ Սովորական development build-ը կարող է անցնել առանց կարգավորումների, բայց Student-ը ցույց կտա հայերեն կարգավորման սխալ։ Environment-ը փոխելուց հետո վերագործարկեք Vite-ը կամ նորից կառուցեք հավելվածը։ Scheduler-ի `apps/teacher/.env.local`-ը Student-ը ինքնաբերաբար չի կարդում․ `npm run tauri dev`-ից առաջ կարգավորեք նաև `.env.local`-ը։ «Ստուգել կոդը» սպասում է սկզբնական cache-ի ընթերցմանը, իսկ պատրաստման ձախողման դեպքում ցույց է տալիս սխալը և հաջորդ սեղմումով կրկին փորձում։

Միայն `npm run dev`-ը frontend preview է․ native cache/settings/tray/audio գործողությունների համար պետք է Tauri shell-ը։

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build
```

Փաթեթավորումը կատարվում է համապատասխան native OS-ի վրա․ `bundle.targets`-ը մնում է `all`։ Կոնկրետ ձևաչափերի ընտրություն՝

| OS | Հրաման | Փաթեթներ |
| --- | --- | --- |
| Windows | `npm run tauri build -- --bundles msi,nsis` | MSI, NSIS |
| macOS | `npm run tauri build -- --bundles app,dmg` | `.app`, `.dmg` |
| Ubuntu/Xubuntu | `npm run tauri build -- --bundles deb,appimage` | `.deb`, `.AppImage` |

Արդյունքները՝ `src-tauri/target/release/bundle/`։ Սովորական branch push-երի և pull request-ների համար GitHub Actions չի գործարկվում։ macOS/Linux build-երը կատարվում են ձեռքով համապատասխան միջավայրերում։

### Windows release

Պաշտոնական Windows ռելիզ ստեղծելու համար՝

1. `package.json` և `src-tauri/tauri.conf.json` ֆայլերում սահմանել նույն `x.y.z` տարբերակը։
2. Փոփոխությունները միացնել հիմնական branch-ին։
3. Ստեղծել և ուղարկել նույն տարբերակի tag-ը, օրինակ՝ `git tag v0.1.0`, ապա `git push origin v0.1.0`։

[`Windows release`](.github/workflows/release.yml) workflow-ը գործարկվում է միայն `vX.Y.Z` tag-ի push-ից։ Այն ստուգում է tag-ի և երկու config-ների տարբերակների համընկնումը, անցկացնում է ավտոմատ ստուգումները, կառուցում NSIS `-setup.exe` installer և ստեղծում GitHub Release՝ ավտոմատ release notes-ով։ NSIS-ը բացահայտ կարգավորված է `currentUser` ռեժիմով․ հավելվածը տեղադրվում է տվյալ օգտատիրոջ `%LOCALAPPDATA%` պանակում և administrator իրավունք չի պահանջում։ MSI չի կառուցվում և սովորական push-ից workflow չի գործարկվում։

### GitHub Release

Պաշտոնական Windows ռելիզ ստեղծելու համար՝

1. `package.json` և `src-tauri/tauri.conf.json` ֆայլերում սահմանել նույն `x.y.z` տարբերակը։
2. Փոփոխությունները միացնել `master`-ին։
3. Ստեղծել և ուղարկել նույն տարբերակի `vX.Y.Z` tag-ը, օրինակ՝ `git tag v0.1.0`, ապա `git push origin v0.1.0`։

[`Windows release`](.github/workflows/release.yml) workflow-ը ստուգում է tag-ի և երկու config-ների տարբերակների համընկնումը, անցկացնում է ավտոմատ ստուգումները, կառուցում MSI-ն և ստեղծում GitHub Release՝ ավտոմատ release notes-ով։ Չհամընկնող տարբերակների դեպքում հրապարակումը կանգնում է մինչև installer-ի կառուցումը։ Միևնույն tag-ի երկու զուգահեռ գործարկում չի չեղարկում արդեն սկսված ռելիզը։ Ներկայում GitHub Release-ին կցվում է միայն Windows MSI-ն. macOS/Linux փաթեթների հրապարակումը դեռ առանձին աշխատանք է։

## Հարթակների վարք և զարգացման կանոն

Նոր փոփոխությունները պետք է պահպանեն Windows/macOS/Linux աջակցությունը։ Օգտագործեք Tauri-ի cross-platform API-ները, platform-neutral անվանումները և application-data/config path resolver-ները։ Անհրաժեշտ OS տարբերությունները պահեք փոքր adapter-ներում։ Այդ կանոնները ամրագրված են նաև [AGENTS.md](AGENTS.md)-ում։

- **Tray․** օգտագործվում է Tauri-ի ընդհանուր menu API-ն։ Linux-ում գործողությունները հասանելի են menu-ի միջոցով․ raw tray click events-ի վրա հենվել պետք չէ ([Tauri tray docs](https://v2.tauri.app/learn/system-tray/#listen-to-tray-events))։ Desktop panel-ը պետք է ցուցադրի AppIndicator/StatusNotifier icon-երը։ Tray-ի ստեղծման սխալի դեպքում պատուհանը մնում է տեսանելի, իսկ Close-ը կարող է փակել ծրագիրը։ OS API-ն չի երաշխավորում, որ հաջող ստեղծված icon-ը իսկապես երևում է panel-ում․ tray-ի հասանելիությունը ստուգեք տվյալ desktop session-ում։
- **macOS․** Dock-ի reopen իրադարձությունը վերադարձնում է պատուհանը։ Menu bar-ի tray-ը շարունակում է աշխատել։
- **Launch at login․** բոլոր OS-երում օգտագործվում է առկա Tauri autostart plugin-ը․ macOS-ում ընտրված է LaunchAgent-ը։ Գրանցումը միացվում է յուրաքանչյուր startup-ին։ Linux AppImage-ի դեպքում այն պահեք կայուն տեղում՝ login entry-ի հղումը պահպանելու համար։
- **Native system notification․** օգտագործվում է նույն Tauri plugin-ը։ Թույլտվությունները և Do Not Disturb/Focus-ը կառավարում է տվյալ OS-ը։
- **Speech․** Windows WebView2-ը, macOS WKWebView-ը և Linux WebKitGTK-ն կարող են ունենալ տարբեր speech/voice աջակցություն։ API-ի կամ հայերեն և անգլերեն voice-երի բացակայությունը մշակվում է որպես optional feature-ի անհասանելիություն։

Յուրաքանչյուր հարթակի ձեռքով ստուգման ցանկը և փաստացի արդյունքները՝ [TESTING.md](TESTING.md)։

## Հավելվածի icon-երը

Գիրք և ժամացույց նշանի աղբյուրը՝ `src/assets/horarium.svg`։ Նույն նշանն օգտագործվում է պատուհանի վերնամասում և favicon-ում։ Desktop PNG/ICO/ICNS ու Windows Store չափերը վերարտադրելու համար repository-ի root-ից գործարկեք `npm run icons`։ Օգտագործվում է նախագծի առկա Tauri CLI-ն՝ առանց նոր dependency-ի։

Tray-ի համար կան առանձին պարզեցված SVG-ներ․ `tray-template.svg`-ը macOS-ի թափանցիկ template-ն է՝ համակարգի tint-ով, իսկ `tray.svg`-ը Windows/Linux-ի հակադրությամբ տարբերակն է։ Դրանք նույնպես գեներացվում են նույն հրամանով։

## Սահմանափակումներ

- Յուրաքանչյուր OS-ի notification/tray/audio/launch-at-login վարքը և native installer-ը պետք է ստուգվեն այդ OS-ում։ Մի հարթակի build-ը մյուս երկուսի հաստատումը չէ։
- OS-ի volume/notification կարգավորումները կարող են լռեցնել ազդանշանները։
- Հայերեն խոսքը կախված է տեղադրված voice-երից և WebView-ի աջակցությունից, հատկապես թաքնված պատուհանի դեպքում։
- Հիշեցումների duplicate state-ը չի պահպանվում restart-երի միջև․ դասի ընթացքում նոր գործարկումը կարող է նորից տալ «արդեն սկսվել է» հիշեցումը։
- Դասացուցակը բեռնվում է գործարկման, միանալու/փոխելու և սխալից հետո «Կրկին փորձել»-ի ժամանակ և յուրաքանչյուր 15 րոպեն մեկ՝ նաև թաքնված պատուհանով։ Ստուգումը կատարվում է հաջորդ native tick-ին (մինչև մոտ 10 վայրկյան ուշացում)։ Քնից վերադառնալուց հետո ժամկետանց ստուգումը կատարվում է մեկ անգամ։ Դասարանի միացման ձևը բաց լինելու ընթացքում ստուգումը հետաձգվում է։ Ֆոնային սխալները պատուհանը չեն բացում, իսկ հաջորդ ստուգումը նորից փորձում է կապվել։ Cache-ը կարող է հնացած լինել․ UI-ն նշում է դրա օգտագործումը։
