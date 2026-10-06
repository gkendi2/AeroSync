import os
import numpy as np
import pandas as pd


# ============================================================
# AeroSync - Dataset Preparation
# Sprint 1
#
# Purpose:
# Create a clean dataset for AeroSync delay-risk analysis.
#
# IMPORTANT:
# The source datasets are synthetic/reference datasets.
# They are NOT Kenya Airways operational records.
#
# AeroSync-specific operational indicators such as staff
# availability, baggage progress, incidents and time remaining
# are simulated to represent realistic operational scenarios.
# ============================================================


# ------------------------------------------------------------
# 1. PROJECT PATHS
# ------------------------------------------------------------

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

AIRPORT_DATA = os.path.join(
    BASE_DIR,
    "data",
    "extracted",
    "airport-operations",
    "airport-operations-dataset"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "data",
    "processed"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ------------------------------------------------------------
# 2. LOAD SOURCE DATA
# ------------------------------------------------------------

flights_path = os.path.join(
    AIRPORT_DATA,
    "flights.csv"
)

baggage_path = os.path.join(
    AIRPORT_DATA,
    "baggage.csv"
)

staff_path = os.path.join(
    AIRPORT_DATA,
    "staff_shifts.csv"
)

flights = pd.read_csv(flights_path)
baggage = pd.read_csv(baggage_path)
staff = pd.read_csv(staff_path)


# ------------------------------------------------------------
# 3. RENAME FLIGHT COLUMNS
# ------------------------------------------------------------

# The source CSV uses string column names:
# "0", "1", "2", etc.
#
# Therefore the mapping converts the numeric mapping keys
# into strings before renaming.

flight_columns = {
    0: "flight_id",
    1: "airline",
    2: "airline_code",
    3: "origin",
    4: "destination",
    5: "scheduled_departure",
    6: "estimated_departure",
    7: "scheduled_arrival",
    8: "estimated_arrival",
    9: "aircraft_type",
    10: "aircraft_registration",
    11: "planned_capacity",
    12: "passenger_count",
    13: "flight_status",
    14: "delay_minutes",
    15: "delay_cause",
    16: "terminal",
    17: "gate",
    18: "operational_flag",
    19: "flight_metric_1",
    20: "flight_metric_2",
    21: "operational_timestamp",
    22: "secondary_flag",
    23: "delay_status",
    24: "load_factor_percent",
    25: "route_metric",
    26: "operational_score",
    27: "time_of_day",
    28: "day_of_week",
    29: "weekend_flag",
    30: "season",
    31: "route_type"
}

flights = flights.rename(
    columns={
        str(k): v
        for k, v in flight_columns.items()
    }
)


# ------------------------------------------------------------
# 4. RENAME BAGGAGE COLUMNS
# ------------------------------------------------------------

baggage_columns = {
    0: "baggage_id",
    1: "qr_code",
    2: "flight_id",
    3: "passenger_reference",
    4: "baggage_weight_kg",
    5: "baggage_dimensions",
    6: "baggage_stage_source",
    7: "baggage_location_source",
    8: "baggage_timestamp_1",
    9: "baggage_timestamp_2",
    10: "baggage_metric",
    11: "baggage_status_source",
    12: "baggage_flag_1",
    13: "baggage_metric_2",
    14: "baggage_area_source",
    15: "baggage_timestamp_3",
    16: "baggage_flag_2",
    17: "unused_column"
}

baggage = baggage.rename(
    columns={
        str(k): v
        for k, v in baggage_columns.items()
    }
)


# ------------------------------------------------------------
# 5. RENAME STAFF COLUMNS
# ------------------------------------------------------------

staff_columns = {
    0: "staff_id",
    1: "staff_name",
    2: "department",
    3: "role",
    4: "shift_date",
    5: "shift_timestamp_1",
    6: "shift_timestamp_2",
    7: "terminal",
    8: "gate",
    9: "assignment_reference",
    10: "staff_metric",
    11: "staff_flag",
    12: "unused_column",
    13: "secondary_date",
    14: "language"
}

staff = staff.rename(
    columns={
        str(k): v
        for k, v in staff_columns.items()
    }
)


# ------------------------------------------------------------
# 6. CONVERT FLIGHT TIMESTAMPS
# ------------------------------------------------------------

flights["scheduled_departure"] = pd.to_datetime(
    flights["scheduled_departure"],
    errors="coerce"
)

flights["estimated_departure"] = pd.to_datetime(
    flights["estimated_departure"],
    errors="coerce"
)

flights["scheduled_arrival"] = pd.to_datetime(
    flights["scheduled_arrival"],
    errors="coerce"
)

flights["estimated_arrival"] = pd.to_datetime(
    flights["estimated_arrival"],
    errors="coerce"
)


# ------------------------------------------------------------
# 7. BAGGAGE SUMMARY
# ------------------------------------------------------------

# Aggregate baggage records to flight level.

baggage_summary = (
    baggage
    .groupby("flight_id")
    .agg(
        baggage_count=(
            "baggage_id",
            "count"
        ),

        total_baggage_weight_kg=(
            "baggage_weight_kg",
            "sum"
        ),

        average_baggage_weight_kg=(
            "baggage_weight_kg",
            "mean"
        )
    )
    .reset_index()
)


# ------------------------------------------------------------
# 8. MERGE BAGGAGE INFORMATION
# ------------------------------------------------------------

dataset = flights.merge(
    baggage_summary,
    on="flight_id",
    how="left"
)


# Flights without baggage records receive zero.

dataset["baggage_count"] = (
    dataset["baggage_count"]
    .fillna(0)
)

dataset["total_baggage_weight_kg"] = (
    dataset["total_baggage_weight_kg"]
    .fillna(0)
)

dataset["average_baggage_weight_kg"] = (
    dataset["average_baggage_weight_kg"]
    .fillna(0)
)


# ------------------------------------------------------------
# 9. STAFF SOURCE INFORMATION
# ------------------------------------------------------------

# The staff source contains staff/shift records but does not
# provide a verified attendance percentage.
#
# Therefore the AeroSync staff availability variables below
# are simulated rather than claimed to come directly from
# staff_shifts.csv.

dataset["staff_records_available"] = len(staff)


# ------------------------------------------------------------
# 10. REPRODUCIBLE SYNTHETIC SCENARIOS
# ------------------------------------------------------------

# Fixed seed means the same dataset is produced each time
# the script is run.

np.random.seed(42)

n = len(dataset)


# ------------------------------------------------------------
# 10A. STAFF REQUIREMENT AND AVAILABILITY
# ------------------------------------------------------------

dataset["staff_required"] = np.random.randint(
    6,
    13,
    size=n
)

dataset["staff_available"] = np.random.randint(
    4,
    13,
    size=n
)

# Available staff cannot exceed required staff.

dataset["staff_available"] = np.minimum(
    dataset["staff_available"],
    dataset["staff_required"]
)

dataset["staff_availability_pct"] = (
    dataset["staff_available"]
    / dataset["staff_required"]
    * 100
).round(2)


# ------------------------------------------------------------
# 10B. BAGGAGE HANDLING PROGRESS
# ------------------------------------------------------------

# The source baggage dataset has constant handling-stage and
# status values, so it cannot provide a useful progress
# percentage.
#
# We therefore create a simulated operational snapshot.

dataset["baggage_progress_pct"] = np.random.randint(
    35,
    101,
    size=n
)


# ------------------------------------------------------------
# 10C. UNRESOLVED INCIDENTS
# ------------------------------------------------------------

# The gate-events dataset contains only "Boarding Start"
# events and therefore cannot provide a genuine incident count.
#
# We simulate an incident count for AeroSync scenarios.

dataset["unresolved_incidents"] = np.random.choice(
    [0, 0, 0, 1, 1, 2, 3],
    size=n
)


# ------------------------------------------------------------
# 10D. TIME REMAINING
# ------------------------------------------------------------

# Simulated AeroSync decision-support snapshot.

dataset["time_remaining_minutes"] = np.random.randint(
    20,
    241,
    size=n
)


# ------------------------------------------------------------
# 11. OPERATIONAL RISK COMPONENTS
# ------------------------------------------------------------

# Lower staff availability = higher risk.

staff_risk = (
    100
    - dataset["staff_availability_pct"]
)


# Lower baggage progress = higher risk.

baggage_risk = (
    100
    - dataset["baggage_progress_pct"]
)


# More unresolved incidents = higher risk.

incident_risk = (
    dataset["unresolved_incidents"]
    / 3
    * 100
)


# Less time remaining = higher risk.

time_risk = (
    100
    -
    (
        (
            dataset["time_remaining_minutes"]
            - 20
        )
        / 220
    )
    * 100
)


# Keep risk components within 0-100.

staff_risk = staff_risk.clip(
    0,
    100
)

baggage_risk = baggage_risk.clip(
    0,
    100
)

incident_risk = incident_risk.clip(
    0,
    100
)

time_risk = time_risk.clip(
    0,
    100
)


# ------------------------------------------------------------
# 12. AEROSYNC OPERATIONAL RISK SCORE
# ------------------------------------------------------------

# Weighting reflects the AeroSync operational scenario:
#
# Baggage progress       35%
# Staff availability     25%
# Incidents               20%
# Time remaining          20%

dataset["operational_risk_score"] = (
    staff_risk * 0.25
    +
    baggage_risk * 0.35
    +
    incident_risk * 0.20
    +
    time_risk * 0.20
).round(2)


# ------------------------------------------------------------
# 13. DELAY-RISK CLASSIFICATION
# ------------------------------------------------------------

# These thresholds are used only to generate the synthetic
# AeroSync scenario labels.
#
# They are NOT claimed to be Kenya Airways thresholds.

def classify_risk(score):

    if score >= 60:
        return "HIGH"

    elif score >= 35:
        return "MEDIUM"

    else:
        return "LOW"


dataset["delay_risk"] = (
    dataset["operational_risk_score"]
    .apply(classify_risk)
)


# ------------------------------------------------------------
# 14. ACTUAL SOURCE DELAY OUTCOME
# ------------------------------------------------------------

# delay_minutes comes from the Airport Operations source data.

dataset["delay_occurred"] = (
    dataset["delay_minutes"] > 0
).astype(int)


# ------------------------------------------------------------
# 15. DERIVED DATE/TIME FEATURES
# ------------------------------------------------------------

dataset["scheduled_departure_date"] = (
    dataset["scheduled_departure"]
    .dt.date
    .astype(str)
)

dataset["scheduled_departure_hour"] = (
    dataset["scheduled_departure"]
    .dt.hour
)


# ------------------------------------------------------------
# 16. FINAL DATASET COLUMNS
# ------------------------------------------------------------

final_columns = [

    # Flight identification
    "flight_id",
    "airline",
    "airline_code",

    # Route
    "origin",
    "destination",
    "route_type",

    # Aircraft
    "aircraft_type",
    "aircraft_registration",

    # Airport
    "terminal",
    "gate",
    "flight_status",

    # Schedule
    "scheduled_departure",
    "estimated_departure",
    "scheduled_arrival",
    "estimated_arrival",
    "scheduled_departure_date",
    "scheduled_departure_hour",

    # Passenger/load
    "planned_capacity",
    "passenger_count",
    "load_factor_percent",

    # Baggage
    "baggage_count",
    "total_baggage_weight_kg",
    "average_baggage_weight_kg",

    # Staff
    "staff_required",
    "staff_available",
    "staff_availability_pct",

    # Baggage progress
    "baggage_progress_pct",

    # Incidents
    "unresolved_incidents",

    # Time
    "time_remaining_minutes",

    # Existing delay information
    "delay_minutes",
    "delay_cause",
    "delay_status",

    # Derived outcome
    "delay_occurred",

    # AeroSync risk variables
    "operational_risk_score",
    "delay_risk"
]


dataset = dataset[final_columns]


# ------------------------------------------------------------
# 17. REMOVE DUPLICATE FLIGHT RECORDS
# ------------------------------------------------------------

dataset = (
    dataset
    .drop_duplicates(
        subset=["flight_id"]
    )
    .reset_index(drop=True)
)


# ------------------------------------------------------------
# 18. HANDLE MISSING VALUES
# ------------------------------------------------------------

# Categorical fields.

categorical_columns = (
    dataset
    .select_dtypes(
        include="object"
    )
    .columns
)

for column in categorical_columns:

    dataset[column] = (
        dataset[column]
        .fillna("Unknown")
    )


# Numeric fields.

numeric_columns = (
    dataset
    .select_dtypes(
        include=[
            "int64",
            "float64"
        ]
    )
    .columns
)

for column in numeric_columns:

    dataset[column] = (
        dataset[column]
        .fillna(0)
    )


# ------------------------------------------------------------
# 19. SAVE MAIN DATASET
# ------------------------------------------------------------

dataset_path = os.path.join(
    OUTPUT_DIR,
    "aerosync_dataset.csv"
)

dataset.to_csv(
    dataset_path,
    index=False
)


# ------------------------------------------------------------
# 20. DATA DICTIONARY
# ------------------------------------------------------------

dictionary = [

    (
        "flight_id",
        "Unique flight identifier",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "airline",
        "Airline name",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "airline_code",
        "Airline IATA code",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "origin",
        "Origin airport code",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "destination",
        "Destination airport code",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "route_type",
        "Route classification",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "aircraft_type",
        "Aircraft type",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "aircraft_registration",
        "Aircraft registration",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "terminal",
        "Airport terminal",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "gate",
        "Assigned gate",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "flight_status",
        "Flight operational status",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "scheduled_departure",
        "Scheduled departure timestamp",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "estimated_departure",
        "Estimated departure timestamp",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "scheduled_arrival",
        "Scheduled arrival timestamp",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "estimated_arrival",
        "Estimated arrival timestamp",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "scheduled_departure_date",
        "Calendar date extracted from scheduled departure",
        "Derived",
        "Calculated from scheduled_departure"
    ),

    (
        "scheduled_departure_hour",
        "Hour extracted from scheduled departure",
        "Derived",
        "Calculated from scheduled_departure"
    ),

    (
        "planned_capacity",
        "Planned passenger capacity",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "passenger_count",
        "Passenger count",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "load_factor_percent",
        "Flight load factor percentage",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "baggage_count",
        "Number of baggage records associated with the flight",
        "Derived",
        "Aggregated from baggage.csv"
    ),

    (
        "total_baggage_weight_kg",
        "Total recorded baggage weight in kilograms",
        "Derived",
        "Aggregated from baggage.csv"
    ),

    (
        "average_baggage_weight_kg",
        "Average baggage weight in kilograms",
        "Derived",
        "Aggregated from baggage.csv"
    ),

    (
        "staff_required",
        "Number of staff required in the simulated operational scenario",
        "Simulated",
        "AeroSync synthetic operational scenario"
    ),

    (
        "staff_available",
        "Number of staff available in the simulated operational scenario",
        "Simulated",
        "AeroSync synthetic operational scenario"
    ),

    (
        "staff_availability_pct",
        "Percentage of required staff available",
        "Derived from simulated data",
        "staff_available / staff_required × 100"
    ),

    (
        "baggage_progress_pct",
        "Estimated percentage of baggage handling completed at the simulated snapshot",
        "Simulated",
        "AeroSync synthetic operational scenario"
    ),

    (
        "unresolved_incidents",
        "Number of unresolved operational incidents at the simulated snapshot",
        "Simulated",
        "AeroSync synthetic operational scenario"
    ),

    (
        "time_remaining_minutes",
        "Minutes remaining before scheduled departure at the simulated snapshot",
        "Simulated",
        "AeroSync synthetic operational scenario"
    ),

    (
        "delay_minutes",
        "Recorded delay duration",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "delay_cause",
        "Recorded delay cause",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "delay_status",
        "Recorded source delay status",
        "Source",
        "Airport Operations flights.csv"
    ),

    (
        "delay_occurred",
        "Binary indicator showing whether delay_minutes is greater than zero",
        "Derived",
        "Calculated from delay_minutes"
    ),

    (
        "operational_risk_score",
        "Composite AeroSync operational risk score",
        "Derived",
        "Calculated from staff, baggage, incident and time indicators"
    ),

    (
        "delay_risk",
        "AeroSync delay-risk classification",
        "Derived",
        "Generated from the AeroSync synthetic scenario risk score"
    )
]


dictionary_df = pd.DataFrame(
    dictionary,
    columns=[
        "column_name",
        "description",
        "data_origin",
        "source_or_method"
    ]
)


dictionary_path = os.path.join(
    OUTPUT_DIR,
    "aerosync_data_dictionary.csv"
)

dictionary_df.to_csv(
    dictionary_path,
    index=False
)


# ------------------------------------------------------------
# 21. FINAL QUALITY CHECK
# ------------------------------------------------------------

print()
print("=" * 70)
print("AeroSync Dataset Preparation Complete")
print("=" * 70)

print()
print(f"Rows: {len(dataset):,}")
print(f"Columns: {len(dataset.columns)}")

print()
print("Risk classification:")
print(
    dataset["delay_risk"]
    .value_counts()
    .sort_index()
    .to_string()
)

print()
print("Total missing values:")
print(
    int(dataset.isnull().sum().sum())
)

print()
print("Duplicate flight IDs:")
print(
    int(dataset["flight_id"].duplicated().sum())
)

print()
print("Files created:")

print(
    f"1. {dataset_path}"
)

print(
    f"2. {dictionary_path}"
)

print()
print("The main dataset can be opened directly in Excel.")

print("=" * 70)