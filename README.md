# Research-Tool

Minimal research/survey data processor that converts CSV/JSON input into a paginated Excel report.

## Features
- Accepts questionnaire/opinion/research data from `.csv` or `.json`
- Generates Excel workbook with:
  - `RawData` sheet (full input)
  - `Summary` sheet (response counts, unique counts, and numeric stats)
  - `Page_n` sheets for pagination

## Usage
```bash
pip install -r requirements.txt
python research_tool.py input.csv output.xlsx --page-size 500
```