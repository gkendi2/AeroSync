import os
import numpy as np
import pandas as pd


# ============================================================
# AeroSync - Modelling Dataset Generation
#
# Purpose:
# Create the final modelling dataset for AeroSync delay
# prediction using synthetic operational conditions.
#
# The original aerosync_dataset.csv is NOT modified.
#
# Target:
#   delay_occurred
#
# Prediction-time operational stress factors:
#   Staff shortage        = 25%
#   Baggage remaining     = 25%
#   Time pressure         = 20%
#   Unresolved incidents = 10%
#   Baggage/time crunch   = 20%
#
# The delay outcome is generated probabilistically rather
# than deterministically.
#
# The dataset is synthetic and does NOT represent actual
# Kenya Airways operational records.
# ============================================================


# ------------------------------------------------------------
# 1. PROJECT PATHS
# ------------------------------------------------------------

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

INPUT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "aerosync_dataset.csv"
)

OUTPUT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "aerosync_modeling_dataset.csv"
)

RANDOM_SEED = 20261006


# ------------------------------------------------------------
# 2. LABEL-GENERATION PARAMETERS
# ------------------------------------------------------------

# At 180 minutes or more before departure,
# time pressure is treated as zero.

TIME_WINDOW_MIN = 180

# Stress level corresponding approximately to
# a 50% probability of delay before random noise.

STRESS_MIDPOINT = 0.30

# Controls how strongly increasing stress affects
# the probability of delay.

SLOPE = 16.0

# Adds modest randomness so that the relationship
# is probabilistic rather than deterministic.

NOISE_SD = 0.35


# ------------------------------------------------------------
# 3. LOAD EXISTING AEROSYNC DATASET
# ------------------------------------------------------------

raw = pd.read_csv(INPUT_FILE)

print()
print("=" * 70)
print("AeroSync Modelling Dataset Generation")
print("=" * 70)

print()
print(f"Source rows: {len(raw):,}")
print(f"Source columns: {len(raw.columns)}")


# ------------------------------------------------------------
# 4. SELECT PREDICTION-TIME FEATURES
# ------------------------------------------------------------

feature_columns = [
    "flight_id",
    "scheduled_departure_hour",
    "planned_capacity",
    "passenger_count",
    "load_factor_percent",
    "baggage_count",
    "total_baggage_weight_kg",
    "average_baggage_weight_kg",
    "staff_required",
    "staff_available",
    "staff_availability_pct",
    "baggage_progress_pct",
    "unresolved_incidents",
    "time_remaining_minutes",
]

missing_columns = [
    column
    for column in feature_columns
    if column not in raw.columns
]

if missing_columns:
    raise ValueError(
        f"Missing required columns: {missing_columns}"
    )

# Create a separate modelling dataset.
# The original dataset remains unchanged.

data = raw[feature_columns].copy()


# ------------------------------------------------------------
# 5. OPERATIONAL STRESS INDICATORS
# ------------------------------------------------------------

# ---- Staff shortage ----
#
# 0 = all required staff available
# 1 = maximum shortage

staff_required = (
    data["staff_required"].replace(0, np.nan)
)

staff_shortage = (
    (staff_required - data["staff_available"])
    / staff_required
).fillna(0).clip(0, 1)


# ---- Baggage remaining ----
#
# 0 = baggage handling complete
# 1 = no baggage handling completed

baggage_remaining = (
    1 - data["baggage_progress_pct"] / 100
).clip(0, 1)


# ---- Time pressure ----
#
# 0 = 180 minutes or more remaining
# 1 = no time remaining

time_pressure = (
    1
    - np.minimum(
        data["time_remaining_minutes"]
        / TIME_WINDOW_MIN,
        1
    )
).clip(0, 1)


# ---- Incident pressure ----
#
# 0 = no unresolved incidents
# 1 = three or more unresolved incidents

incident_pressure = (
    np.minimum(
        data["unresolved_incidents"] / 3,
        1
    )
)


# ------------------------------------------------------------
# 6. BAGGAGE/TIME CRUNCH INTERACTION
# ------------------------------------------------------------

# A high amount of baggage remaining becomes more serious
# when there is little time left before departure.

crunch = (
    baggage_remaining
    * time_pressure
)


# ------------------------------------------------------------
# 7. OVERALL OPERATIONAL STRESS
# ------------------------------------------------------------

# Combined stress weighting:
#
# Staff shortage        25%
# Baggage remaining     25%
# Time pressure         20%
# Incidents             10%
# Baggage/time crunch   20%
#
# Total                 100%

stress = (
    0.25 * staff_shortage
    + 0.25 * baggage_remaining
    + 0.20 * time_pressure
    + 0.10 * incident_pressure
    + 0.20 * crunch
)


# ------------------------------------------------------------
# 8. GENERATE PROBABILISTIC DELAY OUTCOME
# ------------------------------------------------------------

rng = np.random.default_rng(
    RANDOM_SEED
)

random_noise = rng.normal(
    0,
    NOISE_SD,
    len(data)
)

logit = (
    SLOPE
    * (stress - STRESS_MIDPOINT)
    + random_noise
)

delay_probability = (
    1
    / (1 + np.exp(-logit))
)

data["delay_occurred"] = (
    rng.binomial(
        1,
        delay_probability
    )
    .astype(int)
)


# ------------------------------------------------------------
# 9. DATASET AUDIT
# ------------------------------------------------------------

print()
print("-" * 70)
print("DATASET AUDIT")
print("-" * 70)

delayed = int(
    data["delay_occurred"].sum()
)

on_time = (
    len(data) - delayed
)

delay_percentage = (
    delayed / len(data) * 100
)

on_time_percentage = (
    on_time / len(data) * 100
)

print()
print(f"Rows: {len(data):,}")
print(f"Columns: {len(data.columns)}")

print()
print(
    f"On-time: {on_time:,} "
    f"({on_time_percentage:.1f}%)"
)

print(
    f"Delayed: {delayed:,} "
    f"({delay_percentage:.1f}%)"
)

print()
print(
    "Missing values:",
    int(data.isna().sum().sum())
)

print(
    "Duplicate rows:",
    int(data.duplicated().sum())
)


# ------------------------------------------------------------
# 10. OPERATIONAL FACTOR COMPARISON
# ------------------------------------------------------------

delayed_mask = (
    data["delay_occurred"] == 1
)

on_time_mask = (
    data["delay_occurred"] == 0
)

print()
print("-" * 70)
print("MEAN OPERATIONAL CONDITIONS")
print("-" * 70)

print()
print(
    "Staff shortage:",
    f"{staff_shortage[delayed_mask].mean():.4f}",
    "vs",
    f"{staff_shortage[on_time_mask].mean():.4f}"
)

print(
    "Baggage remaining:",
    f"{baggage_remaining[delayed_mask].mean():.4f}",
    "vs",
    f"{baggage_remaining[on_time_mask].mean():.4f}"
)

print(
    "Time pressure:",
    f"{time_pressure[delayed_mask].mean():.4f}",
    "vs",
    f"{time_pressure[on_time_mask].mean():.4f}"
)

print(
    "Incident pressure:",
    f"{incident_pressure[delayed_mask].mean():.4f}",
    "vs",
    f"{incident_pressure[on_time_mask].mean():.4f}"
)

print(
    "Baggage/time crunch:",
    f"{crunch[delayed_mask].mean():.4f}",
    "vs",
    f"{crunch[on_time_mask].mean():.4f}"
)


# ------------------------------------------------------------
# 11. CORRELATION CHECK
# ------------------------------------------------------------

print()
print("-" * 70)
print("CORRELATION WITH DELAY OUTCOME")
print("-" * 70)

factors = {
    "staff_shortage": staff_shortage,
    "baggage_remaining": baggage_remaining,
    "time_pressure": time_pressure,
    "incident_pressure": incident_pressure,
    "crunch": crunch,
}

for name, values in factors.items():

    correlation = np.corrcoef(
        values,
        data["delay_occurred"]
    )[0, 1]

    print(
        f"{name}: {correlation:.3f}"
    )


# ------------------------------------------------------------
# 12. SAVE FINAL MODELLING DATASET
# ------------------------------------------------------------

data.to_csv(
    OUTPUT_FILE,
    index=False
)

print()
print("=" * 70)
print("MODELLING DATASET CREATED")
print("=" * 70)

print()
print("Saved to:")
print(OUTPUT_FILE)

print()
print(
    "The original aerosync_dataset.csv "
    "was not modified."
)

print("=" * 70)