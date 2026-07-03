// Hand-crafted BGG XML fixtures modeled on real /thing, /search, and HTML-page
// responses. Kept minimal but representative of the edge cases the adapter must
// handle (MIGRATION-PLAN §12.3).

/** Catan (base, id 13): multi-designer, coop/legacy/campaign flags, 2 expansion links, rank 392. */
export const CATAN_ITEM = `
  <item type="boardgame" id="13">
    <thumbnail>https://cf.geekdo-images.com/catan_thumb.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/catan.jpg</image>
    <name type="primary" sortindex="1" value="Catan"/>
    <name type="alternate" value="Die Siedler von Catan"/>
    <description>Trade, build and settle the island of Catan &amp; prosper.</description>
    <yearpublished value="1995"/>
    <minplayers value="3"/>
    <maxplayers value="4"/>
    <playingtime value="120"/>
    <minplaytime value="60"/>
    <maxplaytime value="120"/>
    <link type="boardgamecategory" id="1015" value="Negotiation"/>
    <link type="boardgamemechanic" id="2072" value="Cooperative Game"/>
    <link type="boardgamemechanic" id="2004" value="Legacy"/>
    <link type="boardgamefamily" id="5666" value="Campaign Games"/>
    <link type="boardgamedesigner" id="11" value="Klaus Teuber"/>
    <link type="boardgamedesigner" id="99" value="Benjamin Teuber"/>
    <link type="boardgamepublisher" id="21" value="KOSMOS"/>
    <link type="boardgameartist" id="12" value="Volkan Baga"/>
    <link type="boardgameexpansion" id="926" value="Catan: Seafarers"/>
    <link type="boardgameexpansion" id="927" value="Catan: Cities &amp; Knights"/>
    <statistics page="1">
      <ratings>
        <usersrated value="120000"/>
        <average value="7.14"/>
        <bayesaverage value="6.94"/>
        <stddev value="1.53"/>
        <averageweight value="2.31"/>
        <numweights value="9000"/>
        <ranks>
          <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="392" bayesaverage="6.94"/>
          <rank type="family" id="5497" name="strategygames" friendlyname="Strategy Game Rank" value="250"/>
        </ranks>
      </ratings>
    </statistics>
  </item>`;

/** Seafarers (expansion, id 926): single <name>, "Not Ranked" rank. */
export const SEAFARERS_ITEM = `
  <item type="boardgameexpansion" id="926">
    <name type="primary" sortindex="1" value="Catan: Seafarers"/>
    <yearpublished value="1997"/>
    <minplayers value="3"/>
    <maxplayers value="4"/>
    <statistics page="1">
      <ratings>
        <average value="7.30"/>
        <ranks>
          <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="Not Ranked"/>
        </ranks>
      </ratings>
    </statistics>
  </item>`;

/** 1830 (base, id 17226): 18xx family flag; coop/legacy/campaign all false. */
export const RAILS_18XX_ITEM = `
  <item type="boardgame" id="17226">
    <name type="primary" sortindex="1" value="1830: Railways &amp; Robber Barons"/>
    <yearpublished value="1986"/>
    <minplayers value="2"/>
    <maxplayers value="7"/>
    <link type="boardgamemechanic" id="2013" value="Stock Holding"/>
    <link type="boardgamefamily" id="19" value="Series: 18xx"/>
    <statistics page="1"><ratings><average value="7.6"/></ratings></statistics>
  </item>`;

export const wrapItems = (...items: string[]): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<items>${items.join('\n')}</items>`;

/** A /thing batch with a base + an expansion (type derivation in one response). */
export const THING_MIXED_BATCH = wrapItems(CATAN_ITEM, SEAFARERS_ITEM);
/** A single-item /thing response (exercises isArray normalization). */
export const THING_SINGLE = wrapItems(CATAN_ITEM);
export const THING_18XX = wrapItems(RAILS_18XX_ITEM);
/** An empty /thing response (all requested ids missing) — BGG always emits the termsofuse attr. */
export const THING_EMPTY = `<?xml version="1.0" encoding="utf-8"?>\n<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse"></items>`;

export const SEARCH_RESULTS = `<?xml version="1.0" encoding="utf-8"?>
<items total="2">
  <item type="boardgame" id="13"><name type="primary" value="Catan"/><yearpublished value="1995"/></item>
  <item type="boardgame" id="931"><name type="primary" value="Catan Junior"/><yearpublished value="2010"/></item>
</items>`;

export const GAME_HTML_PAGE = `<!doctype html><html><head>
  <meta name="description" content="Catan is the classic trading &amp; building game for 3&ndash;4 players.">
  </head><body></body></html>`;
