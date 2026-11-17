"""Shared configuration: paths, body constants, planetary reference regions,
and the list of established terrestrial analog sites used ONLY for validation.

Nothing in KNOWN_ANALOGS is read by the scoring code; it is consumed after
ranking to test whether the method recovers these sites on its own.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
WEB_DATA = ROOT / "web" / "public" / "data"

# Mean radii (km). The three global DEMs were chosen because their native
# pixels have almost the same ground size: ETOPO 60" = 1.853 km,
# MOLA 32 px/deg = 1.849 km, LOLA 16 px/deg = 1.895 km.
RADIUS_KM = {"earth": 6371.0088, "mars": 3389.5, "moon": 1737.4}

# Terrain sampling window: N x N samples at STEP_KM spacing on a local
# azimuthal-equidistant grid, identical for all three bodies.
STEP_KM = 1.9
WIN_N = 32  # 32 x 1.9 km = 60.8 km window

# Earth analysis grid (cell centres), 0.25 degrees.
GRID_DEG = 0.25

# ----------------------------------------------------------------------------
# Planetary reference regions. Coordinates are planetocentric latitude and
# east longitude (-180..180). `geology` lists the lithology/process classes
# documented for the region (see pipeline/geology.py for the vocabulary) with
# the publication the assignment rests on. `ice` marks regions where shallow
# ground ice / cold-trapped volatiles are a defining exploration characteristic.
# ----------------------------------------------------------------------------
TARGETS = [
    # ------------------------------- MARS ---------------------------------
    dict(id="jezero", body="mars", name="Jezero Crater", sub="Western delta & crater floor",
         lat=18.44, lon=77.45, ice=False,
         mission="Mars 2020 Perseverance (2021–)",
         geology=["sed_clastic", "carbonate", "volc_mafic", "impact"],
         geology_note="Noachian open-basin palaeolake: fluvio-deltaic clastic sediments, marginal carbonates, olivine-rich igneous crater floor (Séítah, Máaz).",
         geology_ref="Farley et al. 2022, Science 377, eabo2196; Mangold et al. 2021, Science 374, 711"),
    dict(id="gale", body="mars", name="Gale Crater", sub="Aeolis Palus & lower Mount Sharp",
         lat=-4.59, lon=137.44, ice=False,
         mission="MSL Curiosity (2012–)",
         geology=["sed_clastic", "evaporite", "aeolian", "impact"],
         geology_note="Fluvio-lacustrine mudstones and sandstones, sulfate-bearing strata, active basaltic dune field (Bagnold Dunes).",
         geology_ref="Grotzinger et al. 2014, Science 343, 1242777; Rapin et al. 2019, Nat. Geosci. 12, 889"),
    dict(id="meridiani", body="mars", name="Meridiani Planum", sub="Opportunity traverse plains",
         lat=-1.95, lon=-5.53, ice=False,
         mission="MER Opportunity (2004–2018)",
         geology=["evaporite", "aeolian", "sed_clastic"],
         geology_note="Sulfate-rich aeolian sandstones reworked in acid playa/interdune settings, hematite concretion lag.",
         geology_ref="Squyres et al. 2004, Science 306, 1709; Grotzinger et al. 2005, EPSL 240, 11"),
    dict(id="valles", body="mars", name="Valles Marineris", sub="Melas Chasma floor & walls",
         lat=-10.5, lon=-72.5, ice=False,
         mission="Orbital only (MRO, Mars Express)",
         geology=["evaporite", "volc_mafic", "sed_clastic", "mass_wasting"],
         geology_note="Tectonic canyon cut into layered basaltic plateau lavas; interior layered sulfate deposits; giant landslides.",
         geology_ref="Quantin et al. 2004, Icarus 172, 555; Weitz et al. 2015, Icarus 251, 291"),
    dict(id="elysium", body="mars", name="Elysium Planitia", sub="InSight landing plains",
         lat=4.50, lon=135.62, ice=False,
         mission="InSight (2018–2022)",
         geology=["volc_mafic", "regolith"],
         geology_note="Smooth Hesperian–Amazonian basaltic lava plains mantled by ~3 m of impact-gardened regolith.",
         geology_ref="Golombek et al. 2020, Nat. Commun. 11, 1014"),
    dict(id="utopia", body="mars", name="Utopia Planitia", sub="Viking 2 landing plains",
         lat=47.64, lon=134.29, ice=True,
         mission="Viking Lander 2 (1976–1980); Zhurong farther south",
         geology=["periglacial", "volc_mafic", "sed_clastic"],
         geology_note="Vastitas Borealis plains: basaltic sediments, polygonal patterned ground and scalloped terrain over ice-rich mantle.",
         geology_ref="Stuurman et al. 2016, GRL 43, 9484; Séjourné et al. 2011, PSS 59, 412"),
    dict(id="arcadia", body="mars", name="Arcadia Planitia", sub="Mid-latitude shallow-ice plains",
         lat=39.8, lon=-157.9, ice=True,
         mission="Candidate human landing zone",
         geology=["periglacial", "volc_mafic"],
         geology_note="Amazonian lava plains with widespread excess ice within decimetres–metres of the surface.",
         geology_ref="Bramson et al. 2015, GRL 42, 6566; Morgan et al. 2021, Nat. Astron. 5, 230"),
    dict(id="arsia", body="mars", name="Arsia Mons flank", sub="Tharsis pit craters & lava tubes",
         lat=-6.5, lon=-121.0, ice=False,
         mission="Orbital only (THEMIS, HiRISE)",
         geology=["volc_mafic", "lava_tube"],
         geology_note="Amazonian basaltic shield flank with collapse pits and lava-tube skylights ('Seven Sisters').",
         geology_ref="Cushing et al. 2007, GRL 34, L17201"),
    # ------------------------------- MOON ---------------------------------
    dict(id="shackleton", body="moon", name="Shackleton – de Gerlache ridge", sub="Lunar south pole",
         lat=-89.45, lon=-137.3, ice=True,
         mission="Artemis III candidate region",
         geology=["anorthosite", "impact", "regolith"],
         geology_note="Heavily cratered feldspathic highland crust on the South Pole–Aitken rim; persistently lit ridges beside permanently shadowed crater floors.",
         geology_ref="Spudis et al. 2008, GRL 35, L14201; Mazarico et al. 2011, Icarus 211, 1066"),
    dict(id="cabeus", body="moon", name="Cabeus crater", sub="Permanently shadowed region (LCROSS)",
         lat=-84.68, lon=-48.69, ice=True,
         mission="LCROSS impact (2009)",
         geology=["anorthosite", "impact", "regolith"],
         geology_note="Permanently shadowed highland crater floor; LCROSS measured 5.6 ± 2.9 wt% water ice in ejecta.",
         geology_ref="Colaprete et al. 2010, Science 330, 463; Paige et al. 2010, Science 330, 479"),
    dict(id="descartes", body="moon", name="Descartes Highlands", sub="Apollo 16 site",
         lat=-8.97, lon=15.50, ice=False,
         mission="Apollo 16 (1972)",
         geology=["anorthosite", "impact", "regolith"],
         geology_note="Feldspathic highland breccias and impact-melt rocks (Cayley and Descartes formations).",
         geology_ref="Muehlberger et al. 1980, Proc. Conf. Lunar Highlands Crust, 1; Ulrich et al. 1981, USGS Prof. Paper 1048"),
    dict(id="tranquillitatis", body="moon", name="Mare Tranquillitatis", sub="Apollo 11 site",
         lat=0.67, lon=23.47, ice=False,
         mission="Apollo 11 (1969)",
         geology=["volc_mafic", "regolith"],
         geology_note="High-Ti mare basalt flows beneath 3–6 m of regolith.",
         geology_ref="Beaty & Albee 1978, Proc. LPSC 9, 359"),
    dict(id="marius", body="moon", name="Marius Hills", sub="Volcanic domes & lava-tube skylight",
         lat=14.09, lon=-56.77, ice=False,
         mission="Orbital only (SELENE, LRO, GRAIL)",
         geology=["volc_mafic", "lava_tube", "regolith"],
         geology_note="Mare volcanic complex of domes, cones and sinuous rilles; 65 m skylight into an intact lava tube.",
         geology_ref="Haruyama et al. 2009, GRL 36, L21206; Kaku et al. 2017, GRL 44, 10155"),
]
TARGET_BY_ID = {t["id"]: t for t in TARGETS}

# ----------------------------------------------------------------------------
# Established terrestrial analog sites (validation set only).
# `for_` = which body the community uses it for; `basis` = why it is used:
#   env  : environmental conditions (cold / dry / barren)  -> should be found by the gridded scan
#   geo  : rock type or geological process                  -> only visible to the geology tier
#   ops  : logistics / mission-simulation heritage          -> not expected to be found by any physical metric
# ----------------------------------------------------------------------------
KNOWN_ANALOGS = [
    dict(id="yungay", name="Atacama Desert — Yungay", lat=-24.08, lon=-69.92, for_=["mars"], basis=["env", "geo"],
         note="Hyperarid core; Mars-like soils at the dry limit of microbial life.",
         ref="Navarro-González et al. 2003, Science 302, 1018"),
    dict(id="maria_elena", name="Atacama Desert — María Elena South", lat=-22.26, lon=-69.72, for_=["mars"], basis=["env"],
         note="Among the driest soils measured on Earth.",
         ref="Azua-Bustos et al. 2015, Environ. Microbiol. Rep. 7, 388"),
    dict(id="university_valley", name="McMurdo Dry Valleys — University Valley", lat=-77.86, lon=160.71, for_=["mars"], basis=["env", "geo"],
         note="Dry permafrost over ice-cemented ground; closest thermal/hydrological match to Mars ground ice.",
         ref="Marchant & Head 2007, Icarus 192, 187"),
    dict(id="taylor_valley", name="McMurdo Dry Valleys — Taylor Valley", lat=-77.72, lon=162.30, for_=["mars"], basis=["env"],
         note="Cold polar desert valley floor with ice-covered lakes.",
         ref="Doran et al. 2010, Life in Antarctic Deserts and other Cold Dry Environments (CUP)"),
    dict(id="haughton", name="Haughton impact structure, Devon Island", lat=75.38, lon=-89.67, for_=["mars", "moon"], basis=["env", "geo", "ops"],
         note="23 km impact structure in polar desert; long-running Haughton-Mars Project.",
         ref="Lee & Osinski 2005, Meteorit. Planet. Sci. 40, 1755"),
    dict(id="death_valley", name="Death Valley — Badwater / Mars Hill", lat=36.38, lon=-116.85, for_=["mars"], basis=["env", "geo"],
         note="Evaporite basin, alluvial fans and volcanic rubble used since Viking for instrument tests.",
         ref="Farr 2004, Planet. Space Sci. 52, 3"),
    dict(id="mojave_cima", name="Mojave Desert — Cima volcanic field", lat=35.25, lon=-115.75, for_=["mars"], basis=["geo", "env"],
         note="Basaltic cinder cones and flows; source region of the MMS Mars simulant.",
         ref="Peters et al. 2008, Icarus 197, 470"),
    dict(id="mdrs", name="Utah — Hanksville (MDRS)", lat=38.41, lon=-110.79, for_=["mars"], basis=["geo", "ops"],
         note="Jurassic–Cretaceous clay-bearing badlands; Mars Desert Research Station.",
         ref="Stoker et al. 2011, Int. J. Astrobiol. 10, 269"),
    dict(id="qaidam", name="Qaidam Basin — Dalangtan Playa", lat=38.50, lon=91.40, for_=["mars"], basis=["env", "geo"],
         note="High, cold, hyperarid evaporite basin with yardangs and polygonal salt crust.",
         ref="Xiao et al. 2017, Earth-Sci. Rev. 164, 84"),
    dict(id="ladakh", name="Ladakh — Tso Kar / Puga", lat=33.30, lon=78.20, for_=["mars"], basis=["env", "geo"],
         note="High-altitude cold desert with permafrost, hot springs and saline lakes.",
         ref="Pandey et al. 2020, Int. J. Astrobiol. 19, 78"),
    dict(id="namib", name="Namib Sand Sea", lat=-24.75, lon=15.30, for_=["mars"], basis=["geo", "env"],
         note="Active linear and star dunes; analog for Martian dune fields.",
         ref="Lancaster 1989, The Namib Sand Sea (Balkema)"),
    dict(id="rio_tinto", name="Río Tinto, Spain", lat=37.72, lon=-6.55, for_=["mars"], basis=["geo"],
         note="Acid-sulfate, iron-oxide system; geochemical analog for Meridiani Planum.",
         ref="Fernández-Remolar et al. 2005, EPSL 240, 149"),
    dict(id="pilbara", name="Pilbara Craton — North Pole Dome", lat=-21.10, lon=119.40, for_=["mars"], basis=["geo"],
         note="3.5 Ga stromatolites and hydrothermal deposits; biosignature analog.",
         ref="Brown et al. 2005, Aust. J. Earth Sci. 52, 287"),
    dict(id="svalbard", name="Svalbard — Bockfjorden (AMASE)", lat=79.43, lon=13.30, for_=["mars"], basis=["geo", "env"],
         note="Arctic volcanics with carbonate globules like ALH84001; AMASE instrument campaigns.",
         ref="Steele et al. 2007, Meteorit. Planet. Sci. 42, 1549"),
    dict(id="iceland_askja", name="Iceland — Askja / Holuhraun", lat=65.05, lon=-16.75, for_=["mars", "moon"], basis=["geo", "ops"],
         note="Young basaltic lavas and tephra; Apollo geology training, Mars 2020 rover field tests.",
         ref="Léveillé 2010, Planet. Space Sci. 58, 631"),
    dict(id="hawaii_maunakea", name="Hawai‘i — Mauna Kea / Mauna Loa saddle", lat=19.60, lon=-155.49, for_=["mars", "moon"], basis=["geo", "ops"],
         note="High-altitude basaltic volcanic terrain; BASALT, HI-SEAS and ISRU field tests.",
         ref="Lim et al. 2019, Astrobiology 19, 245"),
    dict(id="lanzarote", name="Lanzarote — Corona lava tube", lat=29.16, lon=-13.45, for_=["mars", "moon"], basis=["geo", "ops"],
         note="8 km basaltic lava tube; ESA PANGAEA astronaut geology training.",
         ref="Sauro et al. 2020, Earth-Sci. Rev. 209, 103288"),
    dict(id="craters_moon", name="Idaho — Craters of the Moon", lat=43.42, lon=-113.52, for_=["moon", "mars"], basis=["geo", "ops"],
         note="Basaltic rift lavas, cinder cones and tubes; Apollo training, NASA FINESSE.",
         ref="Heldmann et al. 2017 (FINESSE), LPSC abstracts; Léveillé 2010, Planet. Space Sci. 58, 631"),
    dict(id="sfvf", name="Arizona — San Francisco Volcanic Field", lat=35.67, lon=-111.47, for_=["moon", "mars"], basis=["geo", "ops"],
         note="Black Point lava flow and cinder fields; Apollo training and Desert RATS rover trials.",
         ref="Ross et al. 2013, Acta Astronaut. 90, 182"),
    dict(id="meteor_crater", name="Arizona — Meteor (Barringer) Crater", lat=35.03, lon=-111.02, for_=["moon", "mars"], basis=["geo"],
         note="Best-preserved simple impact crater on Earth; Apollo crew training.",
         ref="Kring 2007, Guidebook to the Geology of Barringer Meteorite Crater (LPI Contrib. 1355)"),
    dict(id="mistastin", name="Labrador — Mistastin (Kamestastin) crater", lat=55.88, lon=-63.30, for_=["moon"], basis=["geo"],
         note="Impact into anorthosite — rare lunar-highland lithology match.",
         ref="Mader & Osinski 2018, Meteorit. Planet. Sci. 53, 2492"),
    dict(id="ries", name="Germany — Nördlinger Ries crater", lat=48.88, lon=10.57, for_=["moon"], basis=["geo", "ops"],
         note="24 km complex crater with suevite; Apollo 14/17 and ESA training.",
         ref="Stöffler et al. 2013, Meteorit. Planet. Sci. 48, 515"),
    dict(id="concordia", name="Antarctica — Dome C (Concordia)", lat=-75.10, lon=123.33, for_=["moon", "mars"], basis=["env", "ops"],
         note="Extreme cold, dry, high plateau; ESA human-spaceflight isolation analog.",
         ref="ESA Concordia programme; Tafforin 2009, Antarct. Sci. 21, 1"),
    dict(id="negev_ramon", name="Negev — Makhtesh Ramon", lat=30.60, lon=34.80, for_=["mars"], basis=["geo", "ops"],
         note="Erosional crater with basalts and clays; D-MARS / AMADEE-20 mission simulation.",
         ref="Groemer et al. 2020 (AMADEE), Astrobiology 20, 1276"),
    dict(id="dhofar", name="Oman — Dhofar desert", lat=18.30, lon=53.95, for_=["mars"], basis=["env", "ops"],
         note="Gravel plains and wadis; AMADEE-18 Mars mission simulation.",
         ref="Groemer et al. 2020, Astrobiology 20, 1276"),
    dict(id="danakil", name="Ethiopia — Dallol, Danakil Depression", lat=14.24, lon=40.30, for_=["mars"], basis=["geo"],
         note="Hyperacid, hypersaline hydrothermal system in an evaporite basin.",
         ref="Cavalazzi et al. 2019, Astrobiology 19, 553"),
    dict(id="tolbachik", name="Kamchatka — Tolbachik lava fields", lat=55.80, lon=160.30, for_=["moon", "mars"], basis=["geo", "ops"],
         note="Fresh basaltic scoria plains; Lunokhod and Marsokhod rover testing.",
         ref="Kemurdzhian et al. 1993, Planetary Rovers (Mashinostroenie)"),
]

# ----------------------------------------------------------------------------
# Label-only gazetteer: well-known physiographic names that Natural Earth's
# region polygons lack or generalise. Used ONLY to name a candidate cell after
# it has been scored and selected (centre lat, lon, radius km, name).
# ----------------------------------------------------------------------------
PLACE_LABELS = [
    (25.70, 39.95, 75, "Harrat Khaybar"),
    (43.20, 103.0, 430, "Gobi Desert"),
    (35.60, 83.50, 330, "West Kunlun"),
    (-24.5, -69.3, 330, "Atacama Desert"),
]
