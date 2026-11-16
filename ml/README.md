# AeroSync ML Workspace

Delay-risk model for AeroSync: a depth-3 Decision Tree combined with four prototype operational rules.

The model is trained on **synthetic data**. Its results describe how well it recovers a simulated relationship, not performance on real airline operations.

## Files

| File | Purpose |
|---|---|
| `notebooks/AeroSync.ipynb` | Training, evaluation, hybrid risk indicator and model export |
| `models/aerosync_decision_tree.pkl` | Fitted model with feature order, threshold (0.30) and rule descriptions (joblib) |
| `models/aerosync_decision_tree.json` | The same tree as split thresholds and leaf probabilities, for use in the mobile app |
| `models/aerosync_parity_cases.json` | 200 test flights with expected probability, rule count and risk level |

## Model inputs (in order)

1. `scheduled_departure_hour`
2. `load_factor_percent`
3. `staff_required`
4. `staff_availability_pct`
5. `baggage_progress_pct`
6. `unresolved_incidents`
7. `time_remaining_minutes`

The tree splits only on `time_remaining_minutes`, `baggage_progress_pct` and `staff_availability_pct`.

## Hybrid risk level

- **High:** probability >= 0.30 and at least two rules triggered
- **Medium:** probability >= 0.30 or at least one rule triggered
- **Low:** otherwise

Rules R1 to R4 are listed in the notebook and in both model files. They are prototype assumptions, not official Kenya Airways thresholds.

## Reproducing

1. `python scripts/data_preparation.py` creates `data/processed/aerosync_dataset.csv`.
2. `python scripts/data_generation.py` creates `data/processed/aerosync_modeling_dataset.csv`.
3. Run `ml/notebooks/AeroSync.ipynb` from `ml/notebooks/`, or in Google Colab after uploading the modelling dataset.

Test-set results: accuracy 0.755, ROC-AUC 0.795 (tree); recall 0.77 for the hybrid indicator.
