from pathlib import Path
from zipfile import ZipFile

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
REFERENCE_DIR = DATA_DIR / "reference"


def inspect_zip(zip_path: Path) -> None:
    print(f"\n{'=' * 60}")
    print(f"Dataset: {zip_path.name}")
    print(f"Location: {zip_path}")

    with ZipFile(zip_path, "r") as archive:
        files = [
            entry.filename
            for entry in archive.infolist()
            if not entry.is_dir()
        ]

    print(f"Files found: {len(files)}")

    for filename in files:
        print(f"  - {filename}")


def main() -> None:
    print("AeroSync Data Inventory")
    print("=" * 60)

    datasets = [
        RAW_DIR / "airport-operations.zip",
        REFERENCE_DIR / "kq-routes-reference.zip",
        REFERENCE_DIR / "flight-delay-causes.zip",
    ]

    for dataset in datasets:
        if dataset.exists():
            inspect_zip(dataset)
        else:
            print(f"\nWARNING: Dataset not found: {dataset}")

    print("\nInventory complete.")


if __name__ == "__main__":
    main()