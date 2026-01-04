import io, zipfile, requests
import pandas as pd

ZIP_URL = "https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip"

SWISS_CANTON_ABBR = {
    "AG":"Argovie","AI":"Appenzell Rhodes-Intérieures","AR":"Appenzell Rhodes-Extérieures",
    "BE":"Berne","BL":"Bâle-Campagne","BS":"Bâle-Ville","FR":"Fribourg","GE":"Genève",
    "GL":"Glaris","GR":"Grisons","JU":"Jura","LU":"Lucerne","NE":"Neuchâtel","NW":"Nidwald",
    "OW":"Obwald","SG":"Saint-Gall","SH":"Schaffhouse","SO":"Soleure","SZ":"Schwytz",
    "TG":"Thurgovie","TI":"Tessin","UR":"Uri","VD":"Vaud","VS":"Valais","ZG":"Zoug","ZH":"Zurich",
}

def pick_col(df, candidates):
    cols = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols:
            return cols[cand.lower()]
    # fallback: contains match
    for c in df.columns:
        cl = c.lower()
        for cand in candidates:
            if cand.lower() in cl:
                return c
    raise ValueError(f"Impossible de trouver une colonne parmi: {candidates}. Colonnes disponibles: {list(df.columns)}")

def main():
    r = requests.get(ZIP_URL, timeout=120)
    r.raise_for_status()

    z = zipfile.ZipFile(io.BytesIO(r.content))
    # prend le 1er CSV du zip
    csv_name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    raw = z.read(csv_name)

    # CSV swisstopo souvent séparé par ';' (et encodage UTF-8)
    df = pd.read_csv(io.BytesIO(raw), sep=";", dtype=str, encoding="utf-8", engine="python")

    # Colonnes typiques: ORTSCHAFT (localité) + KANTON (sigle)
    locality_col = pick_col(df, ["ORTSCHAFT", "LocalityName", "LOCALITY", "place"])
    canton_col   = pick_col(df, ["KANTON", "CANTON", "KT"])

    out = df[[locality_col, canton_col]].copy()
    # Colonnes ASCII propres pour Supabase
    out.columns = ["locality", "canton_abbr"]

    # Filtre: uniquement cantons suisses (AG, VD, ZH, etc.)
    out = out[out["canton_abbr"].isin(SWISS_CANTON_ABBR.keys())]

    # Canton en toutes lettres (FR)
    out["canton"] = out["canton_abbr"].map(SWISS_CANTON_ABBR)

    # Nettoyage / dédoublonnage
    out["locality"] = out["locality"].astype(str).str.strip()
    out = out.dropna(subset=["locality", "canton"]).drop_duplicates(subset=["locality", "canton"])

    # Colonnes finales exportées
    out = out[["locality", "canton"]].sort_values(["canton", "locality"]).reset_index(drop=True)

    out.to_csv("localites_suisse_cantons.csv", index=False, encoding="utf-8")
    out.to_excel("localites_suisse_cantons.xlsx", index=False)

    print(f"OK ✅ {len(out):,} lignes exportées")
    print("Fichiers générés : localites_suisse_cantons.csv / localites_suisse_cantons.xlsx")

if __name__ == "__main__":
    main()
