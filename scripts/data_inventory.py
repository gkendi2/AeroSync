from pathlib import Path
from zipfile import ZipFile

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
REFERENCE_DIR = DATA_DIR / "reference"
EXTRACTED_DIR = DATA_DIR / "extracted"
PROCESSED_DIR = DATA_DIR / "processed"


def extract_zip(zip_path: Path, destination: Path) -> None:
    """Extract a ZIP dataset without modifying the original ZIP file."""
    dataset_name = zip_path.stem
    output_dir = destination / dataset_name

    output_dir.mkdir(parents=True, exist_ok=True)

    with ZipFile(zip_path, "r") as archive:
        archive.extractall(output_dir)

    print(f"Extracted: {zip_path.name}")


def inspect_csv(csv_file: Path) -> dict:
    """Inspect a CSV and return basic data-quality information."""

    try:
        df = pd.read_csv(csv_file)

        return {
            "file": str(csv_file.relative_to(PROJECT_ROOT)),
            "rows": len(df),
            "columns": len(df.columns),
            "missing_values": int(df.isna().sum().sum()),
            "duplicate_rows": int(df.duplicated().sum()),
            "status": "OK",
        }

    except Exception as error:
        return {
            "file": str(csv_file.relative_to(PROJECT_ROOT)),
            "rows": None,
            "columns": None,
            "missing_values": None,
            "duplicate_rows": None,
            "status": f"ERROR: {error}",
        }


def profile_csv(csv_file: Path) -> list[dict]:
    """Create a column-level profile for a CSV file."""

    df = pd.read_csv(csv_file)

    profiles = []

    for column in df.columns:
        series = df[column]

        examples = (
            series.dropna()
            .astype(str)
            .drop_duplicates()
            .head(5)
            .tolist()
        )

        profiles.append(
            {
                "file": str(csv_file.relative_to(PROJECT_ROOT)),
                "column": str(column),
                "data_type": str(series.dtype),
                "missing_values": int(series.isna().sum()),
                "unique_values": int(series.nunique(dropna=True)),
                "example_values": " | ".join(examples),
            }
        )

    return profiles


def main() -> None:
    print("AeroSync Data Preparation & Quality Inventory")
    print("=" * 70)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    datasets = [
        RAW_DIR / "airport-operations.zip",
        REFERENCE_DIR / "kq-routes-reference.zip",
        REFERENCE_DIR / "flight-delay-causes.zip",
    ]

    # ---------------------------------------------------------
    # 1. Extract datasets
    # ---------------------------------------------------------

    print("\n[1] Extracting datasets")
    print("-" * 70)

    for dataset in datasets:
        if not dataset.exists():
            print(f"WARNING: Dataset not found: {dataset}")
            continue

        extract_zip(dataset, EXTRACTED_DIR)

    # ---------------------------------------------------------
    # 2. Discover CSV files
    # ---------------------------------------------------------

    csv_files = sorted(EXTRACTED_DIR.rglob("*.csv"))

    print("\n[2] CSV files discovered")
    print("-" * 70)
    print(f"Total CSV files: {len(csv_files)}")

    # ---------------------------------------------------------
    # 3. Dataset-level inventory
    # ---------------------------------------------------------

    print("\n[3] Dataset-level quality inspection")
    print("-" * 70)

    inventory_results = []

    for csv_file in csv_files:
        result = inspect_csv(csv_file)
        inventory_results.append(result)

        print(
            f"{csv_file.name}: "
            f"{result['rows']} rows, "
            f"{result['columns']} columns, "
            f"{result['missing_values']} missing values, "
            f"{result['duplicate_rows']} duplicates"
        )

    inventory_report = pd.DataFrame(inventory_results)

    inventory_path = PROCESSED_DIR / "data_inventory.csv"
    inventory_report.to_csv(inventory_path, index=False)

    # ---------------------------------------------------------
    # 4. Column-level profiling
    # ---------------------------------------------------------

    print("\n[4] Column-level profiling")
    print("-" * 70)

    profile_results = []

    for csv_file in csv_files:
        try:
            profiles = profile_csv(csv_file)
            profile_results.extend(profiles)

            print(f"Profiled: {csv_file.name}")

        except Exception as error:
            print(f"ERROR profiling {csv_file.name}: {error}")

    profile_report = pd.DataFrame(profile_results)

    profile_path = PROCESSED_DIR / "data_dictionary_report.csv"
    profile_report.to_csv(profile_path, index=False)

    # ---------------------------------------------------------
    # 5. Completion
    # ---------------------------------------------------------

    print("\n[5] Reports generated")
    print("-" * 70)
    print(f"Dataset inventory: {inventory_path}")
    print(f"Column profile:     {profile_path}")

    print("\nAeroSync data preparation complete.")


if __name__ == "__main__":
    main()