// GENERATED from data/reference/nuts_regions.json — do not edit by hand.
// Source: Eurostat GISCO, NUTS 2024. Regenerate with
// `python3 ETL/terms/emit_regions.py`; check_regions.ts fails the build if
// this file and the reference data disagree.
//
// NUTS-1 and NUTS-2 are both present because national regions sit at different
// levels: France's Normandie is NUTS-1 (FRD) while Ile-de-France is NUTS-2
// (FR10). Where the same name exists at both levels the broader id is kept,
// since region matching is by id PREFIX and the broader one still satisfies a
// rule written against the narrower.
export interface Region { id: string; name: string }

export const REGIONS_BY_COUNTRY: Record<string, Region[]> = {
  AL: [{ id: "AL03", name: "Jug" }, { id: "AL02", name: "Qender" }, { id: "AL0", name: "Shqipëria" }, { id: "AL01", name: "Veri" }],
  AT: [{ id: "AT11", name: "Burgenland" }, { id: "AT21", name: "Kärnten" }, { id: "AT12", name: "Niederösterreich" }, { id: "AT31", name: "Oberösterreich" }, { id: "AT1", name: "Ostösterreich" }, { id: "AT32", name: "Salzburg" }, { id: "AT22", name: "Steiermark" }, { id: "AT2", name: "Südösterreich" }, { id: "AT33", name: "Tirol" }, { id: "AT34", name: "Vorarlberg" }, { id: "AT3", name: "Westösterreich" }, { id: "AT13", name: "Wien" }],
  BA: [{ id: "BA0", name: "Bosna I Hercegovina" }, { id: "BA03", name: "Brčko District BiH" }, { id: "BA01", name: "Federacija Bosne i Hercegovine" }, { id: "BA02", name: "Republika Srpska" }],
  BE: [{ id: "BE21", name: "Prov. Antwerpen" }, { id: "BE31", name: "Prov. Brabant wallon" }, { id: "BE32", name: "Prov. Hainaut" }, { id: "BE22", name: "Prov. Limburg (BE)" }, { id: "BE33", name: "Prov. Liège" }, { id: "BE34", name: "Prov. Luxembourg (BE)" }, { id: "BE35", name: "Prov. Namur" }, { id: "BE23", name: "Prov. Oost-Vlaanderen" }, { id: "BE24", name: "Prov. Vlaams-Brabant" }, { id: "BE25", name: "Prov. West-Vlaanderen" }, { id: "BE10", name: "Région de Bruxelles-Capitale/ Brussels Hoofdstedelijk Gewest" }, { id: "BE1", name: "Région de Bruxelles-Capitale/Brussels Hoofdstedelijk Gewest" }, { id: "BE3", name: "Région wallonne" }, { id: "BE2", name: "Vlaams Gewest" }],
  BG: [{ id: "BG32", name: "Severen tsentralen" }, { id: "BG3", name: "Severna i Yugoiztochna Bulgaria" }, { id: "BG33", name: "Severoiztochen" }, { id: "BG31", name: "Severozapaden" }, { id: "BG34", name: "Yugoiztochen" }, { id: "BG41", name: "Yugozapaden" }, { id: "BG4", name: "Yugozapadna i Yuzhna tsentralna Bulgaria" }, { id: "BG42", name: "Yuzhen tsentralen" }],
  CH: [{ id: "CH02", name: "Espace Mittelland" }, { id: "CH03", name: "Nordwestschweiz" }, { id: "CH05", name: "Ostschweiz" }, { id: "CH01", name: "Région lémanique" }, { id: "CH0", name: "Schweiz/Suisse/Svizzera" }, { id: "CH07", name: "Ticino" }, { id: "CH06", name: "Zentralschweiz" }, { id: "CH04", name: "Zürich" }],
  CY: [{ id: "CY0", name: "Kýpros" }],
  CZ: [{ id: "CZ06", name: "Jihovýchod" }, { id: "CZ03", name: "Jihozápad" }, { id: "CZ08", name: "Moravskoslezsko" }, { id: "CZ01", name: "Praha" }, { id: "CZ05", name: "Severovýchod" }, { id: "CZ04", name: "Severozápad" }, { id: "CZ07", name: "Střední Morava" }, { id: "CZ02", name: "Střední Čechy" }, { id: "CZ0", name: "Česko" }],
  DE: [{ id: "DEA5", name: "Arnsberg" }, { id: "DE1", name: "Baden-Württemberg" }, { id: "DE2", name: "Bayern" }, { id: "DE3", name: "Berlin" }, { id: "DE4", name: "Brandenburg" }, { id: "DE91", name: "Braunschweig" }, { id: "DE5", name: "Bremen" }, { id: "DED4", name: "Chemnitz" }, { id: "DE71", name: "Darmstadt" }, { id: "DEA4", name: "Detmold" }, { id: "DED2", name: "Dresden" }, { id: "DEA1", name: "Düsseldorf" }, { id: "DE13", name: "Freiburg" }, { id: "DE72", name: "Gießen" }, { id: "DE6", name: "Hamburg" }, { id: "DE92", name: "Hannover" }, { id: "DE7", name: "Hessen" }, { id: "DE12", name: "Karlsruhe" }, { id: "DE73", name: "Kassel" }, { id: "DEB1", name: "Koblenz" }, { id: "DEA2", name: "Köln" }, { id: "DED5", name: "Leipzig" }, { id: "DE93", name: "Lüneburg" }, { id: "DE8", name: "Mecklenburg-Vorpommern" }, { id: "DE25", name: "Mittelfranken" }, { id: "DEA3", name: "Münster" }, { id: "DE22", name: "Niederbayern" }, { id: "DE9", name: "Niedersachsen" }, { id: "DEA", name: "Nordrhein-Westfalen" }, { id: "DE21", name: "Oberbayern" }, { id: "DE24", name: "Oberfranken" }, { id: "DE23", name: "Oberpfalz" }, { id: "DEB3", name: "Rheinhessen-Pfalz" }, { id: "DEB", name: "Rheinland-Pfalz" }, { id: "DEC", name: "Saarland" }, { id: "DED", name: "Sachsen" }, { id: "DEE", name: "Sachsen-Anhalt" }, { id: "DEF", name: "Schleswig-Holstein" }, { id: "DE27", name: "Schwaben" }, { id: "DE11", name: "Stuttgart" }, { id: "DEG", name: "Thüringen" }, { id: "DEB2", name: "Trier" }, { id: "DE14", name: "Tübingen" }, { id: "DE26", name: "Unterfranken" }, { id: "DE94", name: "Weser-Ems" }],
  DK: [{ id: "DK0", name: "Danmark" }, { id: "DK01", name: "Hovedstaden" }, { id: "DK04", name: "Midtjylland" }, { id: "DK05", name: "Nordjylland" }, { id: "DK02", name: "Sjælland" }, { id: "DK03", name: "Syddanmark" }],
  EE: [{ id: "EE0", name: "Eesti" }],
  ES: [{ id: "ES61", name: "Andalucía" }, { id: "ES24", name: "Aragón" }, { id: "ES7", name: "Canarias" }, { id: "ES13", name: "Cantabria" }, { id: "ES41", name: "Castilla y León" }, { id: "ES42", name: "Castilla-La Mancha" }, { id: "ES51", name: "Cataluña" }, { id: "ES4", name: "Centro (ES)" }, { id: "ES63", name: "Ciudad de Ceuta" }, { id: "ES64", name: "Ciudad de Melilla" }, { id: "ES22", name: "Comunidad Foral de Navarra" }, { id: "ES3", name: "Comunidad de Madrid" }, { id: "ES52", name: "Comunitat Valenciana" }, { id: "ES5", name: "Este" }, { id: "ES43", name: "Extremadura" }, { id: "ES11", name: "Galicia" }, { id: "ES53", name: "Illes Balears" }, { id: "ES23", name: "La Rioja" }, { id: "ES2", name: "Noreste" }, { id: "ES1", name: "Noroeste" }, { id: "ES21", name: "País Vasco" }, { id: "ES12", name: "Principado de Asturias" }, { id: "ES62", name: "Región de Murcia" }, { id: "ES6", name: "Sur" }],
  FI: [{ id: "FI1C", name: "Etelä-Suomi" }, { id: "FI1B", name: "Helsinki-Uusimaa" }, { id: "FI19", name: "Länsi-Suomi" }, { id: "FI1", name: "Manner-Suomi" }, { id: "FI1D", name: "Pohjois- ja Itä-Suomi" }, { id: "FI2", name: "Åland" }],
  FR: [{ id: "FRF1", name: "Alsace" }, { id: "FRI1", name: "Aquitaine" }, { id: "FRK1", name: "Auvergne" }, { id: "FRK", name: "Auvergne-Rhône-Alpes" }, { id: "FRD1", name: "Basse-Normandie" }, { id: "FRC1", name: "Bourgogne" }, { id: "FRC", name: "Bourgogne-Franche-Comté" }, { id: "FRH", name: "Bretagne" }, { id: "FRB", name: "Centre — Val de Loire" }, { id: "FRF2", name: "Champagne-Ardenne" }, { id: "FRM", name: "Corse" }, { id: "FRC2", name: "Franche-Comté" }, { id: "FRF", name: "Grand Est" }, { id: "FRY1", name: "Guadeloupe" }, { id: "FRY3", name: "Guyane" }, { id: "FRD2", name: "Haute-Normandie" }, { id: "FRE", name: "Hauts-de-France" }, { id: "FR1", name: "Ile-de-France" }, { id: "FRY4", name: "La Réunion" }, { id: "FRJ1", name: "Languedoc-Roussillon" }, { id: "FRI2", name: "Limousin" }, { id: "FRF3", name: "Lorraine" }, { id: "FRY2", name: "Martinique" }, { id: "FRY5", name: "Mayotte" }, { id: "FRJ2", name: "Midi-Pyrénées" }, { id: "FRE1", name: "Nord-Pas de Calais" }, { id: "FRD", name: "Normandie" }, { id: "FRI", name: "Nouvelle-Aquitaine" }, { id: "FRJ", name: "Occitanie" }, { id: "FRG", name: "Pays de la Loire" }, { id: "FRE2", name: "Picardie" }, { id: "FRI3", name: "Poitou-Charentes" }, { id: "FRL", name: "Provence-Alpes-Côte d’Azur" }, { id: "FRY", name: "RUP FR — Régions Ultrapériphériques Françaises" }, { id: "FRK2", name: "Rhône-Alpes" }],
  GR: [{ id: "EL51", name: "Anatoliki Makedonia, Thraki" }, { id: "EL3", name: "Attiki" }, { id: "EL63", name: "Dytiki Elláda" }, { id: "EL53", name: "Dytiki Makedonia" }, { id: "EL62", name: "Ionia Nisia" }, { id: "EL54", name: "Ipeiros" }, { id: "EL6", name: "Kentriki Elláda" }, { id: "EL52", name: "Kentriki Makedonia" }, { id: "EL43", name: "Kriti" }, { id: "EL4", name: "Nisia Aigaiou, Kriti" }, { id: "EL42", name: "Notio Aigaio" }, { id: "EL65", name: "Peloponnisos" }, { id: "EL64", name: "Sterea Elláda" }, { id: "EL61", name: "Thessalia" }, { id: "EL5", name: "Voreia Elláda" }, { id: "EL41", name: "Voreio Aigaio" }],
  HR: [{ id: "HR05", name: "Grad Zagreb" }, { id: "HR0", name: "Hrvatska" }, { id: "HR03", name: "Jadranska Hrvatska" }, { id: "HR02", name: "Panonska Hrvatska" }, { id: "HR06", name: "Sjeverna Hrvatska" }],
  HU: [{ id: "HU3", name: "Alföld és Észak" }, { id: "HU11", name: "Budapest" }, { id: "HU2", name: "Dunántúl" }, { id: "HU33", name: "Dél-Alföld" }, { id: "HU23", name: "Dél-Dunántúl" }, { id: "HU21", name: "Közép-Dunántúl" }, { id: "HU1", name: "Közép-Magyarország" }, { id: "HU22", name: "Nyugat-Dunántúl" }, { id: "HU12", name: "Pest" }, { id: "HU32", name: "Észak-Alföld" }, { id: "HU31", name: "Észak-Magyarország" }],
  IE: [{ id: "IE06", name: "Eastern and Midland" }, { id: "IE0", name: "Ireland" }, { id: "IE04", name: "Northern and Western" }, { id: "IE05", name: "Southern" }],
  IS: [{ id: "IS0", name: "Ísland" }],
  IT: [{ id: "ITF1", name: "Abruzzo" }, { id: "ITF5", name: "Basilicata" }, { id: "ITF6", name: "Calabria" }, { id: "ITF3", name: "Campania" }, { id: "ITI", name: "Centro (IT)" }, { id: "ITH5", name: "Emilia-Romagna" }, { id: "ITH4", name: "Friuli-Venezia Giulia" }, { id: "ITG", name: "Isole" }, { id: "ITI4", name: "Lazio" }, { id: "ITC3", name: "Liguria" }, { id: "ITC4", name: "Lombardia" }, { id: "ITI3", name: "Marche" }, { id: "ITF2", name: "Molise" }, { id: "ITH", name: "Nord-Est" }, { id: "ITC", name: "Nord-Ovest" }, { id: "ITC1", name: "Piemonte" }, { id: "ITH1", name: "Provincia Autonoma di Bolzano/Bozen" }, { id: "ITH2", name: "Provincia Autonoma di Trento" }, { id: "ITF4", name: "Puglia" }, { id: "ITG2", name: "Sardegna" }, { id: "ITG1", name: "Sicilia" }, { id: "ITF", name: "Sud" }, { id: "ITI1", name: "Toscana" }, { id: "ITI2", name: "Umbria" }, { id: "ITC2", name: "Valle d’Aosta/Vallée d’Aoste" }, { id: "ITH3", name: "Veneto" }],
  LI: [{ id: "LI0", name: "Liechtenstein" }],
  LT: [{ id: "LT0", name: "Lietuva" }, { id: "LT01", name: "Sostinės regionas" }, { id: "LT02", name: "Vidurio ir vakarų Lietuvos regionas" }],
  LU: [{ id: "LU0", name: "Luxembourg" }],
  LV: [{ id: "LV0", name: "Latvija" }],
  ME: [{ id: "ME0", name: "Crna Gora" }],
  MK: [{ id: "MK0", name: "Severna Makedonija" }],
  MT: [{ id: "MT0", name: "Malta" }],
  NL: [{ id: "NL13", name: "Drenthe" }, { id: "NL23", name: "Flevoland" }, { id: "NL12", name: "Friesland (NL)" }, { id: "NL22", name: "Gelderland" }, { id: "NL11", name: "Groningen" }, { id: "NL42", name: "Limburg (NL)" }, { id: "NL41", name: "Noord-Brabant" }, { id: "NL32", name: "Noord-Holland" }, { id: "NL1", name: "Noord-Nederland" }, { id: "NL2", name: "Oost-Nederland" }, { id: "NL21", name: "Overijssel" }, { id: "NL35", name: "Utrecht" }, { id: "NL3", name: "West-Nederland" }, { id: "NL34", name: "Zeeland" }, { id: "NL36", name: "Zuid-Holland" }, { id: "NL4", name: "Zuid-Nederland" }],
  NO: [{ id: "NO09", name: "Agder og Sør-Østlandet" }, { id: "NO02", name: "Innlandet" }, { id: "NO07", name: "Nord-Norge" }, { id: "NO0", name: "Norge" }, { id: "NO08", name: "Oslo og Viken" }, { id: "NO0B", name: "Svalbard og Jan Mayen" }, { id: "NO06", name: "Trøndelag/Trööndelage" }, { id: "NO0A", name: "Vestlandet" }],
  PL: [{ id: "PL51", name: "Dolnośląskie" }, { id: "PL61", name: "Kujawsko-pomorskie" }, { id: "PL81", name: "Lubelskie" }, { id: "PL43", name: "Lubuskie" }, { id: "PL7", name: "Makroregion centralny" }, { id: "PL5", name: "Makroregion południowo-zachodni" }, { id: "PL2", name: "Makroregion południowy" }, { id: "PL4", name: "Makroregion północno-zachodni" }, { id: "PL6", name: "Makroregion północny" }, { id: "PL9", name: "Makroregion województwo mazowieckie" }, { id: "PL8", name: "Makroregion wschodni" }, { id: "PL92", name: "Mazowiecki regionalny" }, { id: "PL21", name: "Małopolskie" }, { id: "PL52", name: "Opolskie" }, { id: "PL82", name: "Podkarpackie" }, { id: "PL84", name: "Podlaskie" }, { id: "PL63", name: "Pomorskie" }, { id: "PL62", name: "Warmińsko-mazurskie" }, { id: "PL91", name: "Warszawski stołeczny" }, { id: "PL41", name: "Wielkopolskie" }, { id: "PL42", name: "Zachodniopomorskie" }, { id: "PL71", name: "Łódzkie" }, { id: "PL22", name: "Śląskie" }, { id: "PL72", name: "Świętokrzyskie" }],
  PT: [{ id: "PT1C", name: "Alentejo" }, { id: "PT15", name: "Algarve" }, { id: "PT19", name: "Centro (PT)" }, { id: "PT1", name: "Continente" }, { id: "PT1A", name: "Grande Lisboa" }, { id: "PT11", name: "Norte" }, { id: "PT1D", name: "Oeste e Vale do Tejo" }, { id: "PT1B", name: "Península de Setúbal" }, { id: "PT3", name: "Região Autónoma da Madeira" }, { id: "PT2", name: "Região Autónoma dos Açores" }],
  RO: [{ id: "RO32", name: "Bucureşti-Ilfov" }, { id: "RO12", name: "Centru" }, { id: "RO2", name: "Macroregiunea Doi" }, { id: "RO4", name: "Macroregiunea Patru" }, { id: "RO3", name: "Macroregiunea Trei" }, { id: "RO1", name: "Macroregiunea Unu" }, { id: "RO21", name: "Nord-Est" }, { id: "RO11", name: "Nord-Vest" }, { id: "RO22", name: "Sud-Est" }, { id: "RO31", name: "Sud-Muntenia" }, { id: "RO41", name: "Sud-Vest Oltenia" }, { id: "RO42", name: "Vest" }],
  RS: [{ id: "RS12", name: "Autonomous Province of Vojvodina" }, { id: "RS11", name: "City of Belgrade" }, { id: "RS22", name: "Region Južne i Istočne Srbije" }, { id: "RS21", name: "Region Šumadije i Zapadne Srbije" }, { id: "RS2", name: "Serbia - jug" }, { id: "RS1", name: "Serbia - sever" }],
  SE: [{ id: "SE32", name: "Mellersta Norrland" }, { id: "SE31", name: "Norra Mellansverige" }, { id: "SE3", name: "Norra Sverige" }, { id: "SE21", name: "Småland med öarna" }, { id: "SE11", name: "Stockholm" }, { id: "SE22", name: "Sydsverige" }, { id: "SE2", name: "Södra Sverige" }, { id: "SE23", name: "Västsverige" }, { id: "SE12", name: "Östra Mellansverige" }, { id: "SE1", name: "Östra Sverige" }, { id: "SE33", name: "Övre Norrland" }],
  SI: [{ id: "SI0", name: "Slovenija" }, { id: "SI03", name: "Vzhodna Slovenija" }, { id: "SI04", name: "Zahodna Slovenija" }],
  SK: [{ id: "SK01", name: "Bratislavský kraj" }, { id: "SK0", name: "Slovensko" }, { id: "SK03", name: "Stredné Slovensko" }, { id: "SK04", name: "Východné Slovensko" }, { id: "SK02", name: "Západné Slovensko" }],
  TR: [{ id: "TR62", name: "Adana, Mersin" }, { id: "TR6", name: "Akdeniz" }, { id: "TR51", name: "Ankara" }, { id: "TR61", name: "Antalya, Isparta, Burdur" }, { id: "TR32", name: "Aydın, Denizli, Muğla" }, { id: "TRA2", name: "Ağrı, Kars, Iğdır, Ardahan" }, { id: "TR22", name: "Balıkesir, Çanakkale" }, { id: "TR5", name: "Batı Anadolu" }, { id: "TR8", name: "Batı Karadeniz" }, { id: "TR2", name: "Batı Marmara" }, { id: "TR41", name: "Bursa, Eskişehir, Bilecik" }, { id: "TR9", name: "Doğu Karadeniz" }, { id: "TR4", name: "Doğu Marmara" }, { id: "TR3", name: "Ege" }, { id: "TRA1", name: "Erzurum, Erzincan, Bayburt" }, { id: "TRC1", name: "Gaziantep, Adıyaman, Kilis" }, { id: "TRC", name: "Güneydoğu Anadolu" }, { id: "TR63", name: "Hatay, Kahramanmaraş, Osmaniye" }, { id: "TR82", name: "Kastamonu, Çankırı, Sinop" }, { id: "TR72", name: "Kayseri, Sivas, Yozgat" }, { id: "TR42", name: "Kocaeli, Sakarya, Düzce, Bolu, Yalova" }, { id: "TR52", name: "Konya, Karaman" }, { id: "TRA", name: "Kuzeydoğu Anadolu" }, { id: "TR71", name: "Kırıkkale, Aksaray, Niğde, Nevşehir, Kırşehir" }, { id: "TRB1", name: "Malatya, Elazığ, Bingöl, Tunceli" }, { id: "TR33", name: "Manisa, Afyonkarahisar, Kütahya, Uşak" }, { id: "TRC3", name: "Mardin, Batman, Şırnak, Siirt" }, { id: "TR7", name: "Orta Anadolu" }, { id: "TRB", name: "Ortadoğu Anadolu" }, { id: "TR83", name: "Samsun, Tokat, Çorum, Amasya" }, { id: "TR21", name: "Tekirdağ, Edirne, Kırklareli" }, { id: "TR90", name: "Trabzon, Ordu, Giresun, Rize, Artvin, Gümüşhane" }, { id: "TRB2", name: "Van, Muş, Bitlis, Hakkari" }, { id: "TR81", name: "Zonguldak, Karabük, Bartın" }, { id: "TR1", name: "İstanbul" }, { id: "TR31", name: "İzmir" }, { id: "TRC2", name: "Şanlıurfa, Diyarbakır" }],
  UA: [{ id: "UA44", name: "Avtonomna Respublika Krym" }, { id: "UA62", name: "Cherkaska Oblast" }, { id: "UA14", name: "Chernihivska Oblast" }, { id: "UA74", name: "Chernivetska Oblast" }, { id: "UA31", name: "Dnipropetrovska Oblast" }, { id: "UA21", name: "Donetska Oblast" }, { id: "UA72", name: "Ivano-Frankivska Oblast" }, { id: "UA13", name: "Kharkivska Oblast" }, { id: "UA43", name: "Khersonska Oblast" }, { id: "UA53", name: "Khmelnytska Oblast" }, { id: "UA33", name: "Kirovohradska Oblast" }, { id: "UA61", name: "Kyivska Oblast" }, { id: "UA22", name: "Luhanska Oblast" }, { id: "UA73", name: "Lvivska Oblast" }, { id: "UA63", name: "M. Kyiv" }, { id: "UA45", name: "M. Sevastopol" }, { id: "UA1", name: "Macroregion_01" }, { id: "UA2", name: "Macroregion_02" }, { id: "UA3", name: "Macroregion_03" }, { id: "UA4", name: "Macroregion_04" }, { id: "UA5", name: "Macroregion_05" }, { id: "UA6", name: "Macroregion_06" }, { id: "UA7", name: "Macroregion_07" }, { id: "UA8", name: "Macroregion_08" }, { id: "UA41", name: "Mykolaivska Oblast" }, { id: "UA42", name: "Odeska Oblast" }, { id: "UA11", name: "Poltavska Oblast" }, { id: "UA83", name: "Rivnenska Oblast" }, { id: "UA12", name: "Sumska Oblast" }, { id: "UA52", name: "Ternopilska Oblast" }, { id: "UA51", name: "Vinnytska Oblast" }, { id: "UA81", name: "Volynska Oblast" }, { id: "UA71", name: "Zakarpatska Oblast" }, { id: "UA32", name: "Zaporizka Oblast" }, { id: "UA82", name: "Zhytomyrska Oblast" }],
  XK: [{ id: "XK0", name: "Kosovo" }],
};

/**
 * Do two regions overlap?
 *
 * NUTS ids are hierarchical, so containment is a string prefix: FRD1
 * (Basse-Normandie) sits inside FRD (Normandie). The test runs BOTH ways on
 * purpose. A founder who answered at one level and a rule written at another
 * describe overlapping ground, and the honest reading of a partial overlap is
 * "not ruled out" — the product never claims a founder qualifies, only that
 * nothing disqualifies them, so leniency here cannot overclaim.
 */
export function regionsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toUpperCase(), y = b.toUpperCase();
  return x.startsWith(y) || y.startsWith(x);
}

/** The official name behind a NUTS id, for describing a fund's reach. */
export function regionNameFor(id: string): string | null {
  // Falls back to the nearest ANCESTOR, because this module deliberately keeps
  // only the broader id where one name exists at two levels (DE3 Berlin, not
  // DE30). An id measured elsewhere at the narrower level -- an instrument's
  // delivery region, for instance -- would otherwise resolve to null and the
  // region would silently stop being describable. Ancestry is a NUTS prefix, so
  // walking the id back one character at a time cannot name a different place;
  // it can only name a broader one, which is the honest answer.
  let want = (id || "").toUpperCase();
  while (want.length >= 2) {
    for (const list of Object.values(REGIONS_BY_COUNTRY)) {
      for (const r of list) if (r.id === want) return r.name;
    }
    want = want.slice(0, -1);
  }
  return null;
}

/** Options for the founder's countries, deduplicated across them. */
export function regionOptions(countryCodes: string[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const cc of countryCodes) {
    for (const r of REGIONS_BY_COUNTRY[cc.toUpperCase()] ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ value: r.id, label: r.name });
    }
  }
  return out;
}
